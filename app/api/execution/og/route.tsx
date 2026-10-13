import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { ADDRESS_RE, getMeta, getWallet } from "@/execution/data";
import {
  DIRECTIONS,
  WINDOW_LABELS,
  fmtBps,
  fmtInt,
  fmtUsd,
  outcomeText,
  shortAddr,
  signClass,
} from "@/execution/format";
import type { Direction, Wallet, WindowKey, WindowSummary } from "@/execution/types";

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

/** Best window to brag about: the longest with a positive total, else the longest. */
function pickWindow(windows: Partial<Record<WindowKey, { total_usd: number }>>): WindowKey | null {
  const order: WindowKey[] = ["all", "90d", "30d", "7d"];
  return order.find((k) => (windows[k]?.total_usd ?? 0) > 0) ?? order.find((k) => windows[k]) ?? null;
}

function defaultCard(w: WindowSummary | undefined) {
  return (
    <Frame>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 34, color: MUTED }}>Hyperliquid traders, last 30 days</div>
        <div style={{ fontSize: 92, color: GREEN }}>
          {w ? `${fmtUsd(w.positive_total_usd)} saveable` : "Execution leaderboards"}
        </div>
        <div style={{ fontSize: 34, color: TEXT }}>
          {w ? `${fmtInt(w.positive_wallets)} wallets would have paid less on Lighter` : ""}
        </div>
      </div>
    </Frame>
  );
}

const cacheFor = (seconds: number) => ({ "cache-control": `public, max-age=${seconds}` });

export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") ?? "").toLowerCase();

  if (!ADDRESS_RE.test(address)) {
    let w: WindowSummary | undefined;
    try {
      w = (await getMeta()).directions.hl_to_lighter?.windows["30d"];
    } catch {}
    return new ImageResponse(defaultCard(w), { ...SIZE, headers: cacheFor(w ? 3600 : 60) });
  }

  let wallet: Wallet | null;
  try {
    wallet = await getWallet(address);
  } catch {
    return new ImageResponse(defaultCard(undefined), { ...SIZE, headers: cacheFor(60) });
  }
  const direction = (Object.keys(DIRECTIONS) as Direction[]).find((d) => wallet?.directions[d]);
  const data = direction ? wallet?.directions[direction] : undefined;
  const win = data ? pickWindow(data.windows) : null;
  const w = data && win ? data.windows[win] : undefined;
  const who = wallet?.name ?? shortAddr(address);

  return new ImageResponse(
    (
      <Frame>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 36, color: LIGHTER }}>{who}</div>
          {w && direction && win ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div style={{ fontSize: 34, color: MUTED }}>
                {`${outcomeText(direction, w.total_usd)} · ${WINDOW_LABELS[win].toLowerCase()}`}
              </div>
              <div style={{ fontSize: 120, color: signClass(w.total_usd) === "ex-neg" ? RED : GREEN }}>
                {fmtUsd(Math.abs(w.total_usd))}
              </div>
              <div style={{ fontSize: 32, color: TEXT }}>
                {`${fmtBps(w.total_bps)} on ${fmtUsd(w.replayed_notional)} volume · rank #${fmtInt(w.rank)} of ${fmtInt(w.of)}`}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 48, color: MUTED }}>No replayed orders yet</div>
          )}
        </div>
      </Frame>
    ),
    { ...SIZE, headers: cacheFor(wallet ? 3600 : 300) },
  );
}
