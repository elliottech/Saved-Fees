import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { ADDRESS_RE, getMeta, getWallet } from "@/execution/data";
import {
  DEFAULT_MEASURE,
  DIRECTIONS,
  MEASURE_LABELS,
  WINDOW_LABELS,
  coverageText,
  fmtBps,
  fmtInt,
  fmtUsd,
  fmtWallets,
  isDirection,
  isMeasure,
  isSummary,
  isZero,
  outcomeText,
  resolveWindow,
  shortAddr,
} from "@/execution/format";
import type { Direction, Measure, Meta, Wallet, WindowKey, WindowSummary } from "@/execution/types";

export const runtime = "nodejs";

const BG = "#0e0f11";
const TEXT = "#e8eaed";
const MUTED = "#9ea3ad";
const GREEN = "#34d399";
const RED = "#f87171";
const LIGHTER = "#6b9bff";

const SIZE = { width: 1200, height: 630 };

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: BG,
        color: TEXT,
        padding: "64px 72px",
        fontFamily: "monospace",
      }}
    >
      {children}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: MUTED }}>
        <span>tradingfees.wtf</span>
        <span>real orders · replayed order books</span>
      </div>
    </div>
  );
}

/** Green / red by sign; zero in the neutral text colour. */
const toneColor = (v: number | null | undefined) => (isZero(v) ? TEXT : (v as number) < 0 ? RED : GREEN);

/** One side of zero, unsigned (the words say which way); an empty side reads "—". */
function sideLine(label: string, wallets: number, total: number) {
  return (
    <span style={{ display: "flex", gap: 14 }}>
      <span>{wallets ? `${label.replace("{n}", fmtWallets(wallets))}:` : `${label.replace("{n}", "no wallet")}:`}</span>
      <span style={{ color: wallets ? (total < 0 ? RED : GREEN) : MUTED }}>
        {wallets ? fmtUsd(Math.abs(total)) : "—"}
      </span>
    </span>
  );
}

function defaultCard(direction: Direction, w: WindowSummary | undefined, win: WindowKey | null, measure: Measure) {
  const s = w?.[measure];
  return (
    <Frame>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 34, color: MUTED }}>
          {w && win ? `${DIRECTIONS[direction].title} · ${WINDOW_LABELS[win].toLowerCase()}` : "Hyperliquid vs Lighter"}
        </div>
        <div style={{ fontSize: 84, color: s ? toneColor(s.total_usd) : GREEN }}>
          {s ? `${fmtUsd(s.total_usd, true)} net` : "Execution leaderboards"}
        </div>
        {s && w && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 30, color: TEXT }}>
            {sideLine("saved by {n}", s.positive_wallets, s.positive_total_usd)}
            {sideLine("cost {n} more", s.negative_wallets, s.negative_total_usd)}
            <span style={{ fontSize: 24, color: MUTED }}>
              {`${fmtBps(s.total_bps)} · ${MEASURE_LABELS[measure]} · ${coverageText(w)}`}
            </span>
          </div>
        )}
      </div>
    </Frame>
  );
}

const cacheFor = (seconds: number) => ({ "cache-control": `public, max-age=${seconds}` });

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const address = (params.get("address") ?? "").toLowerCase();
  const m = params.get("measure") ?? undefined;
  const measure: Measure = isMeasure(m) ? m : DEFAULT_MEASURE;
  const requested = params.get("window") ?? undefined;

  let meta: Meta | null = null;
  try {
    meta = await getMeta();
  } catch {}

  if (!ADDRESS_RE.test(address)) {
    const d = params.get("direction") ?? "";
    const direction: Direction = isDirection(d) ? d : "hl_to_lighter";
    const dm = meta?.directions[direction];
    const win = dm ? resolveWindow(dm, requested) : null;
    const w = dm && win ? dm.windows[win] : undefined;
    const summary = isSummary(w) ? w : undefined;
    return new ImageResponse(defaultCard(direction, summary, win, measure), {
      ...SIZE,
      headers: cacheFor(summary ? 3600 : 60),
    });
  }

  let wallet: Wallet | null;
  try {
    wallet = await getWallet(address);
  } catch {
    return new ImageResponse(defaultCard("hl_to_lighter", undefined, null, measure), { ...SIZE, headers: cacheFor(60) });
  }
  // The viewer's window (30 days by default) — never switched to a more flattering one.
  const direction = (Object.keys(DIRECTIONS) as Direction[]).find((d) => wallet?.directions[d] && meta?.directions[d]);
  const dm = direction ? meta?.directions[direction] : undefined;
  const win = dm ? resolveWindow(dm, requested) : null;
  const cover = dm && win ? dm.windows[win] : undefined;
  const w = direction && win ? wallet?.directions[direction]?.windows[win] : undefined;
  const s = w?.[measure];
  const who = wallet?.name ?? shortAddr(address);

  return new ImageResponse(
    (
      <Frame>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 36, color: LIGHTER }}>{who}</div>
          {w && s && direction && win ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div style={{ fontSize: 34, color: MUTED }}>
                {`${outcomeText(direction, s.total_usd)} · ${WINDOW_LABELS[win].toLowerCase()}`}
              </div>
              <div style={{ fontSize: 120, color: toneColor(s.total_usd) }}>
                {isZero(s.total_usd) ? "$0" : fmtUsd(Math.abs(s.total_usd))}
              </div>
              <div style={{ fontSize: 30, color: TEXT }}>
                {`${fmtBps(s.total_bps)} on ${fmtUsd(w.replayed_notional)} compared · rank #${fmtInt(s.rank)} of ${fmtInt(w.of)}`}
              </div>
              <div style={{ fontSize: 24, color: MUTED }}>
                {`${MEASURE_LABELS[measure]}${cover ? ` · ${coverageText(cover)}` : ""}`}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 48, color: MUTED }}>
              {win ? `No compared orders · ${WINDOW_LABELS[win].toLowerCase()}` : "No compared orders yet"}
            </div>
          )}
        </div>
      </Frame>
    ),
    { ...SIZE, headers: cacheFor(wallet ? 3600 : 300) },
  );
}
