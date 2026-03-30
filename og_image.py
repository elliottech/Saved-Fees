"""Server-side OG image generation using Pillow."""

import io
import logging
import os

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

# ── Dark-theme palette ────────────────────────────────────────────────────────
BG = (13, 17, 23)
CARD_BG = (22, 27, 34)
BORDER = (48, 54, 61)
TEXT = (230, 237, 243)
TEXT_DIM = (177, 186, 196)
TEXT_MUTED = (139, 148, 158)
GREEN = (63, 185, 80)
RED = (248, 81, 73)
COL_LIGHTER = (74, 122, 255)
COL_BINANCE = (240, 185, 11)
COL_BYBIT = (247, 166, 0)

WIDTH = 1200
HEIGHT = 630
OUTER_PAD = 32
CARD_RADIUS = 16
INNER_X = 40
INNER_Y = 36

FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def _font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    key = (weight, size)
    if key in _font_cache:
        return _font_cache[key]

    path = os.path.join(FONT_DIR, f"JetBrainsMono-{weight}.ttf")
    try:
        font = ImageFont.truetype(path, size)
    except (OSError, IOError):
        try:
            font = ImageFont.load_default(size=size)
        except TypeError:
            font = ImageFont.load_default()
    _font_cache[key] = font
    return font


# ── Formatting helpers (mirror the JS helpers) ───────────────────────────────

def _fmt_usd(val: float) -> str:
    sign = "-" if val < 0 else ""
    return f"{sign}${abs(val):,.2f}"


def _fmt_vol(val: float) -> str:
    if val >= 1_000_000_000:
        return f"${val / 1_000_000_000:.2f}B"
    if val >= 1_000_000:
        return f"${val / 1_000_000:.2f}M"
    if val >= 1_000:
        return f"${val / 1_000:.1f}K"
    return f"${val:.0f}"


def _fmt_bps(val: float) -> str:
    bps = (val or 0) * 10000
    rounded = round(bps * 100) / 100
    if rounded == int(rounded):
        return f"{int(rounded)} bps"
    return f"{rounded:.2f} bps"


def _fmt_num(val: int) -> str:
    return f"{val:,}"


# ── Image generation ──────────────────────────────────────────────────────────

def generate_og_image(data: dict) -> bytes:
    """Render a 1200x630 OG preview image. Returns PNG bytes."""
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    # Card
    cx1, cy1 = OUTER_PAD, OUTER_PAD
    cx2, cy2 = WIDTH - OUTER_PAD, HEIGHT - OUTER_PAD
    draw.rounded_rectangle(
        [cx1, cy1, cx2, cy2],
        radius=CARD_RADIUS,
        fill=CARD_BG,
        outline=BORDER,
    )

    x = cx1 + INNER_X
    y = cy1 + INNER_Y
    content_w = (cx2 - cx1) - 2 * INNER_X

    hl = data["hyperliquid"]
    summary = data["summary"]
    lighter = data["comparisons"]["lighter"]
    binance = data["comparisons"]["binance"]
    bybit = data["comparisons"]["bybit"]

    # ── Header row ────────────────────────────────────────────────────────────
    f_label = _font("Regular", 14)
    draw.text((x, y), "TOTAL FEES PAID ON HYPERLIQUID", font=f_label, fill=TEXT_MUTED)
    brand = "tradingfees.wtf"
    brand_w = draw.textlength(brand, font=f_label)
    draw.text((x + content_w - brand_w, y), brand, font=f_label, fill=TEXT_MUTED)

    y += 42

    # ── Main amount ───────────────────────────────────────────────────────────
    f_amount = _font("ExtraBold", 56)
    draw.text((x, y), _fmt_usd(hl["total_fees_paid"]), font=f_amount, fill=TEXT)

    y += 76

    # ── Volume / trades sub ───────────────────────────────────────────────────
    f_sub = _font("Regular", 18)
    vol_text = f"{_fmt_vol(summary['total_volume'])} volume"
    if summary["total_trades"] > 0:
        vol_text += f" across {_fmt_num(summary['total_trades'])} trades"
    draw.text((x, y), vol_text, font=f_sub, fill=TEXT_DIM)

    y += 52

    # ── Separator ─────────────────────────────────────────────────────────────
    draw.line([(x, y), (x + content_w, y)], fill=BORDER, width=1)

    y += 28

    # ── Comparison label ──────────────────────────────────────────────────────
    draw.text(
        (x, y),
        "THE SAME ACTIVITY WOULD HAVE COST YOU:",
        font=f_label,
        fill=TEXT_MUTED,
    )

    y += 42

    # ── Three exchange columns ────────────────────────────────────────────────
    exchanges = [
        {"name": "LIGHTER", "color": COL_LIGHTER, "data": lighter, "key": "lighter"},
        {"name": "BINANCE", "color": COL_BINANCE, "data": binance, "key": "binance"},
        {"name": "BYBIT", "color": COL_BYBIT, "data": bybit, "key": "bybit"},
    ]

    col_w = content_w // 3
    f_ename = _font("Bold", 16)
    f_efees = _font("Bold", 30)
    f_edetail = _font("Regular", 14)
    f_ediff = _font("Bold", 15)

    col_height = 170

    for i, exch in enumerate(exchanges):
        col_x = x + i * col_w + (20 if i > 0 else 0)

        if i > 0:
            sep_x = x + i * col_w + 4
            draw.line([(sep_x, y), (sep_x, y + col_height)], fill=BORDER, width=1)

        ey = y
        draw.text((col_x, ey), exch["name"], font=f_ename, fill=exch["color"])

        ey += 34
        draw.text(
            (col_x, ey),
            _fmt_usd(exch["data"]["total_fees"]),
            font=f_efees,
            fill=TEXT,
        )

        ey += 48
        draw.text(
            (col_x, ey),
            f"taker: {_fmt_bps(exch['data']['taker_rate'])}",
            font=f_edetail,
            fill=TEXT_MUTED,
        )
        ey += 24
        draw.text(
            (col_x, ey),
            f"maker: {_fmt_bps(exch['data']['maker_rate'])}",
            font=f_edetail,
            fill=TEXT_MUTED,
        )

        ey += 34
        if exch["key"] == "lighter":
            diff_text = f"{_fmt_usd(exch['data']['savings_vs_hl'])} saved"
            diff_color = GREEN
        else:
            diff = exch["data"]["diff_vs_hl"]
            if diff > 0:
                diff_text = f"HL cost {_fmt_usd(diff)} more"
                diff_color = RED
            elif diff < 0:
                diff_text = f"HL saved {_fmt_usd(abs(diff))}"
                diff_color = GREEN
            else:
                diff_text = "same cost"
                diff_color = TEXT_MUTED

        draw.text((col_x, ey), diff_text, font=f_ediff, fill=diff_color)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
