import asyncio
import logging
import os
import re
import time
import urllib.request
import zipfile
from contextlib import asynccontextmanager
from html import escape

import httpx
import orjson
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

from fees import analyze_fees, simulate_fees
from hyperliquid import fetch_all_fills, fetch_portfolio, fetch_spot_meta, fetch_user_fees
from og_image import generate_og_image

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
VALID_WINDOWS = {"all", "7d", "30d", "90d", "1yr"}
WINDOW_MS = {
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
    "1yr": 365 * 24 * 60 * 60 * 1000,
}

# ── Read index HTML once ──────────────────────────────────────────────────────
_index_html_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "index.html")
with open(_index_html_path) as f:
    _INDEX_HTML = f.read()

# ── OG image / analyze caches ────────────────────────────────────────────────
_og_image_cache: dict[str, tuple[float, bytes]] = {}  # key -> (timestamp, png_bytes)
_analyze_cache: dict[str, tuple[float, dict]] = {}    # address -> (timestamp, result)
_default_og_image: bytes | None = None
OG_CACHE_TTL = 3600  # 1 hour


def _ensure_fonts():
    """Download JetBrains Mono if font files are missing."""
    font_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
    needed = ["JetBrainsMono-Regular.ttf", "JetBrainsMono-Bold.ttf", "JetBrainsMono-ExtraBold.ttf"]

    if all(os.path.exists(os.path.join(font_dir, f)) for f in needed):
        return

    os.makedirs(font_dir, exist_ok=True)
    url = "https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip"
    zip_path = os.path.join(font_dir, "font.zip")
    try:
        logger.info("Downloading JetBrains Mono fonts...")
        urllib.request.urlretrieve(url, zip_path)
        with zipfile.ZipFile(zip_path) as zf:
            for name in zf.namelist():
                basename = os.path.basename(name)
                if basename in needed:
                    data = zf.read(name)
                    with open(os.path.join(font_dir, basename), "wb") as f:
                        f.write(data)
        logger.info("Fonts downloaded")
    except Exception as e:
        logger.warning(f"Font download failed: {e}")
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_fonts()
    app.state.http_client = httpx.AsyncClient(
        headers={"Content-Type": "application/json"},
        timeout=httpx.Timeout(30, connect=10),
    )
    logger.info("HTTP client created")
    yield
    await app.state.http_client.aclose()
    logger.info("HTTP client closed")


app = FastAPI(title="Fee Savings Calculator", lifespan=lifespan)


class ORJSONResponse(Response):
    media_type = "application/json"

    def render(self, content) -> bytes:
        return orjson.dumps(content)


# ── API endpoints ─────────────────────────────────────────────────────────────

@app.post("/api/analyze", response_class=ORJSONResponse)
async def analyze(request: Request):
    body = await request.json()
    address = body.get("address", "").strip().lower()
    window = body.get("window", "all")

    if not ADDRESS_RE.match(address):
        raise HTTPException(status_code=400, detail="Invalid Ethereum address. Must be 0x followed by 40 hex characters.")
    if window not in VALID_WINDOWS:
        raise HTTPException(status_code=400, detail="Invalid time window.")

    client = request.app.state.http_client

    try:
        user_fees_data, portfolio_data, fills_data, spot_meta = await _fetch_data(client, address)
    except httpx.HTTPStatusError as e:
        logger.error(f"HL API error: {e}")
        raise HTTPException(status_code=502, detail="Hyperliquid API returned an error. Please try again.")
    except httpx.NetworkError as e:
        logger.error(f"HL API network error: {e}")
        raise HTTPException(status_code=502, detail="Hyperliquid API is temporarily unreachable. Please try again.")
    except httpx.TimeoutException:
        logger.error("HL API timeout")
        raise HTTPException(status_code=504, detail="Hyperliquid API timed out. Please try again.")

    fills = _filter_fills_by_window(fills_data["fills"], window)
    fills_data = {**fills_data, "fills": fills}
    result = analyze_fees(
        user_fees_data=user_fees_data,
        portfolio_data=portfolio_data,
        fills_data=fills_data,
        spot_meta=spot_meta,
        address=address,
        window=window,
    )
    result["window"] = window

    # Cache result for OG image reuse
    if not result.get("error"):
        _cache_analyze_result(address, result)

    return result


@app.post("/api/simulate", response_class=ORJSONResponse)
async def simulate(request: Request):
    body = await request.json()
    window = body.get("window", "all")

    try:
        estimated_volume = float(body.get("estimated_volume", 0))
        taker_ratio = float(body.get("taker_ratio", 0.5))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid simulation inputs.")

    if window not in VALID_WINDOWS:
        raise HTTPException(status_code=400, detail="Invalid time window.")
    if estimated_volume <= 0:
        raise HTTPException(status_code=400, detail="Estimated volume must be greater than 0.")
    if taker_ratio < 0 or taker_ratio > 1:
        raise HTTPException(status_code=400, detail="Taker ratio must be between 0 and 1.")

    result = simulate_fees(estimated_volume=estimated_volume, taker_ratio=taker_ratio, window=window)
    result["window"] = window
    return result


# ── OG image endpoint ─────────────────────────────────────────────────────────

@app.get("/og-image")
async def og_image(request: Request):
    address = request.query_params.get("address", "").strip().lower()

    if address and ADDRESS_RE.match(address):
        # Check image cache
        cached_img = _get_cached_og_image(address)
        if cached_img:
            return Response(content=cached_img, media_type="image/png",
                            headers={"Cache-Control": "public, max-age=3600"})

        # Check analyze result cache -> generate image from it
        cached_result = _get_cached_analyze(address)
        if cached_result:
            png = generate_og_image(cached_result)
            _set_cached_og_image(address, png)
            return Response(content=png, media_type="image/png",
                            headers={"Cache-Control": "public, max-age=3600"})

        # No cache — fetch from Hyperliquid with a timeout
        client = request.app.state.http_client
        try:
            result = await asyncio.wait_for(
                _analyze_for_og(client, address), timeout=12.0,
            )
            if result and not result.get("error"):
                png = generate_og_image(result)
                _cache_analyze_result(address, result)
                _set_cached_og_image(address, png)
                return Response(content=png, media_type="image/png",
                                headers={"Cache-Control": "public, max-age=3600"})
        except (asyncio.TimeoutError, Exception) as e:
            logger.warning(f"OG fetch failed for {address}: {e}")

    # Default image
    return _serve_default_og()


# ── Index with dynamic OG tags ────────────────────────────────────────────────

@app.get("/")
async def index(request: Request):
    address = request.query_params.get("address", "").strip().lower()

    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("host", request.url.netloc)
    base = f"{scheme}://{host}"

    if address and ADDRESS_RE.match(address):
        og_image_url = escape(f"{base}/og-image?address={address}")
        og_title = "Trading Fee Analysis | tradingfees.wtf"
        og_desc = "See the trading fees for this address on Hyperliquid vs Lighter, Binance, and Bybit."
    else:
        og_image_url = f"{base}/og-image"
        og_title = "tradingfees.wtf"
        og_desc = "See how much you're paying in trading fees. Compare Hyperliquid fees to Lighter, Binance, and Bybit."

    og_tags = (
        f'    <meta property="og:title" content="{og_title}">\n'
        f'    <meta property="og:description" content="{og_desc}">\n'
        f'    <meta property="og:image" content="{og_image_url}">\n'
        f'    <meta property="og:image:width" content="1200">\n'
        f'    <meta property="og:image:height" content="630">\n'
        f'    <meta property="og:type" content="website">\n'
        f'    <meta name="twitter:card" content="summary_large_image">\n'
        f'    <meta name="twitter:title" content="{og_title}">\n'
        f'    <meta name="twitter:description" content="{og_desc}">\n'
        f'    <meta name="twitter:image" content="{og_image_url}">\n'
    )

    html = _INDEX_HTML.replace("</head>", og_tags + "</head>")
    return HTMLResponse(html)


# Mount static files AFTER the root route
app.mount("/static", StaticFiles(directory="static"), name="static")


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _fetch_data(client: httpx.AsyncClient, address: str):
    """Fetch user fees and fills from Hyperliquid API."""
    fees_task = asyncio.create_task(fetch_user_fees(client, address))
    portfolio_task = asyncio.create_task(fetch_portfolio(client, address))
    fills_task = asyncio.create_task(fetch_all_fills(client, address))
    spot_meta_task = asyncio.create_task(fetch_spot_meta(client))

    user_fees_data = await fees_task
    portfolio_data = await portfolio_task
    fills = await fills_task
    spot_meta = await spot_meta_task

    return user_fees_data, portfolio_data, fills, spot_meta


async def _analyze_for_og(client: httpx.AsyncClient, address: str) -> dict | None:
    """Run a full analyze for OG image generation."""
    user_fees_data, portfolio_data, fills_data, spot_meta = await _fetch_data(client, address)
    result = analyze_fees(
        user_fees_data=user_fees_data,
        portfolio_data=portfolio_data,
        fills_data=fills_data,
        spot_meta=spot_meta,
        address=address,
        window="all",
    )
    return result


def _filter_fills_by_window(fills: list[dict], window: str) -> list[dict]:
    if window == "all" or not fills:
        return fills

    latest_time = max(int(fill["time"]) for fill in fills)
    cutoff = latest_time - WINDOW_MS[window]
    return [fill for fill in fills if int(fill["time"]) >= cutoff]


# ── Cache helpers ─────────────────────────────────────────────────────────────

def _cache_analyze_result(address: str, result: dict):
    now = time.time()
    _analyze_cache[address] = (now, result)
    if len(_analyze_cache) > 500:
        expired = [k for k, v in _analyze_cache.items() if now - v[0] > OG_CACHE_TTL]
        for k in expired:
            del _analyze_cache[k]


def _get_cached_analyze(address: str) -> dict | None:
    entry = _analyze_cache.get(address)
    if entry and time.time() - entry[0] < OG_CACHE_TTL:
        return entry[1]
    return None


def _set_cached_og_image(address: str, png: bytes):
    now = time.time()
    _og_image_cache[address] = (now, png)
    if len(_og_image_cache) > 500:
        expired = [k for k, v in _og_image_cache.items() if now - v[0] > OG_CACHE_TTL]
        for k in expired:
            del _og_image_cache[k]


def _get_cached_og_image(address: str) -> bytes | None:
    entry = _og_image_cache.get(address)
    if entry and time.time() - entry[0] < OG_CACHE_TTL:
        return entry[1]
    return None


def _serve_default_og() -> Response:
    global _default_og_image
    if _default_og_image is None:
        data = simulate_fees(estimated_volume=1_450_734_500, taker_ratio=0.5, window="all")
        _default_og_image = generate_og_image(data)
    return Response(
        content=_default_og_image,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
