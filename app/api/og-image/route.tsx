import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const HL_API_URL = "https://api.hyperliquid.xyz/info";
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/* ── Formatting helpers ──────────────────────────────────────────────────── */

function fmtUsd(val: number): string {
  const sign = val < 0 ? "-" : "";
  return `${sign}$${Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtVol(val: number): string {
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function fmtBps(val: number): string {
  const bps = (val || 0) * 10000;
  const rounded = Math.round(bps * 100) / 100;
  if (rounded === Math.floor(rounded)) return `${Math.floor(rounded)} bps`;
  return `${rounded.toFixed(2)} bps`;
}

function fmtNum(val: number): string {
  return val.toLocaleString("en-US");
}

/* ── Minimal fee tier logic (mirrors src/fees.ts) ────────────────────────── */

interface Tier {
  name: string;
  min_volume: number;
  taker: number;
  maker: number;
}

const HL_PERP_TIERS: Tier[] = [
  { name: "Tier 0 (<$5M)", min_volume: 0, taker: 0.00045, maker: 0.00015 },
  { name: "Tier 1 (>$5M)", min_volume: 5_000_000, taker: 0.0004, maker: 0.00012 },
  { name: "Tier 2 (>$25M)", min_volume: 25_000_000, taker: 0.00035, maker: 0.00008 },
  { name: "Tier 3 (>$100M)", min_volume: 100_000_000, taker: 0.0003, maker: 0.00004 },
  { name: "Tier 4 (>$500M)", min_volume: 500_000_000, taker: 0.00028, maker: 0.0 },
  { name: "Tier 5 (>$2B)", min_volume: 2_000_000_000, taker: 0.00025, maker: 0.0 },
  { name: "Tier 6 (>$7B)", min_volume: 7_000_000_000, taker: 0.00024, maker: 0.0 },
];

const BINANCE_TIERS: Tier[] = [
  { name: "VIP 0", min_volume: 0, maker: 0.0002, taker: 0.0005 },
  { name: "VIP 1 (>$15M)", min_volume: 15_000_000, maker: 0.00016, taker: 0.0004 },
  { name: "VIP 2 (>$50M)", min_volume: 50_000_000, maker: 0.00014, taker: 0.00035 },
  { name: "VIP 3 (>$100M)", min_volume: 100_000_000, maker: 0.00012, taker: 0.00032 },
  { name: "VIP 4 (>$250M)", min_volume: 250_000_000, maker: 0.0001, taker: 0.0003 },
  { name: "VIP 5 (>$500M)", min_volume: 500_000_000, maker: 0.00008, taker: 0.00027 },
  { name: "VIP 6 (>$1B)", min_volume: 1_000_000_000, maker: 0.00006, taker: 0.00025 },
  { name: "VIP 7 (>$2.5B)", min_volume: 2_500_000_000, maker: 0.00004, taker: 0.00022 },
  { name: "VIP 8 (>$5B)", min_volume: 5_000_000_000, maker: 0.00002, taker: 0.0002 },
  { name: "VIP 9 (>$10B)", min_volume: 10_000_000_000, maker: 0.0, taker: 0.00017 },
];

const BYBIT_TIERS: Tier[] = [
  { name: "VIP 0", min_volume: 0, maker: 0.0002, taker: 0.00055 },
  { name: "VIP 1 (>$10M)", min_volume: 10_000_000, maker: 0.00018, taker: 0.0004 },
  { name: "VIP 2 (>$25M)", min_volume: 25_000_000, maker: 0.00016, taker: 0.000375 },
  { name: "VIP 3 (>$50M)", min_volume: 50_000_000, maker: 0.00014, taker: 0.00035 },
  { name: "VIP 4 (>$100M)", min_volume: 100_000_000, maker: 0.00012, taker: 0.00032 },
  { name: "VIP 5 (>$250M)", min_volume: 250_000_000, maker: 0.0001, taker: 0.00032 },
  { name: "Supreme VIP (>$500M)", min_volume: 500_000_000, maker: 0.0, taker: 0.0003 },
];

const STABLE_FEE_TOKENS = new Set([
  "USDC", "USDT", "USDT0", "USDH", "USDE", "USDHL", "USDXL", "DAI",
]);

function getTier(tiers: Tier[], volume: number): Tier {
  let matched = tiers[0]!;
  for (const tier of tiers) {
    if (volume >= tier.min_volume) matched = tier;
  }
  return matched;
}

/* ── Hyperliquid API calls ───────────────────────────────────────────────── */

async function postHL(payload: Record<string, unknown>): Promise<unknown> {
  const resp = await fetch(HL_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`HL API ${resp.status}`);
  return resp.json();
}

interface Fill {
  px: string;
  sz: string;
  fee: string;
  feeToken?: string;
  crossed?: boolean;
  coin: string;
  time: string | number;
  tid?: string;
}

async function fetchFillsForOG(address: string): Promise<Fill[]> {
  const fills = (await postHL({ type: "userFills", user: address })) as Fill[];
  if (!fills || fills.length === 0) return [];

  const allFills: Fill[] = [...fills];
  const seenTids = new Set(allFills.map((f) => f.tid).filter(Boolean));

  // Paginate up to ~10k fills for OG (keep it fast)
  if (fills.length >= 2000) {
    let earliestTime = Math.min(...fills.map((f) => Number(f.time)));
    let pages = 0;

    while (allFills.length < 10000 && pages < 4) {
      const page = (await postHL({
        type: "userFillsByTime",
        user: address,
        startTime: 0,
        endTime: earliestTime - 1,
      })) as Fill[];

      if (!page || page.length === 0) break;

      const newFills = page.filter((f) => !seenTids.has(f.tid));
      if (newFills.length === 0) break;

      allFills.push(...newFills);
      for (const f of newFills) {
        if (f.tid) seenTids.add(f.tid);
      }

      if (page.length < 2000) break;
      earliestTime = Math.min(...newFills.map((f) => Number(f.time)));
      pages++;
    }
  }

  return allFills;
}

/* ── Quick analysis for OG ───────────────────────────────────────────────── */

interface OGData {
  totalFeesPaid: number;
  totalVolume: number;
  totalTrades: number;
  lighter: { totalFees: number; takerRate: number; makerRate: number; savingsVsHl: number };
  binance: { totalFees: number; takerRate: number; makerRate: number; diffVsHl: number };
  bybit: { totalFees: number; takerRate: number; makerRate: number; diffVsHl: number };
}

async function analyzeForOG(address: string): Promise<OGData | null> {
  const [fills] = await Promise.all([fetchFillsForOG(address)]);

  if (fills.length === 0) return null;

  let totalVolume = 0;
  let takerVolume = 0;
  let makerVolume = 0;
  let totalHlFees = 0;

  for (const fill of fills) {
    const px = Number(fill.px || 0);
    const sz = Number(fill.sz || 0);
    const notional = px * sz;
    const rawFee = Number(fill.fee || 0);
    const feeToken = fill.feeToken || "USDC";
    const isTaker = fill.crossed !== false;

    const feeUsd = STABLE_FEE_TOKENS.has(feeToken) ? rawFee : rawFee * px;

    totalVolume += notional;
    totalHlFees += feeUsd;
    if (isTaker) takerVolume += notional;
    else makerVolume += notional;
  }

  const times = fills.map((f) => Number(f.time));
  const periodStart = Math.min(...times);
  const periodEnd = Math.max(...times);
  const tradingDays = Math.max((periodEnd - periodStart) / (86400 * 1000), 1);

  const estimated14dVol = tradingDays > 14 ? totalVolume * (14 / tradingDays) : totalVolume;
  const estimated30dVol = tradingDays > 30 ? totalVolume * (30 / tradingDays) : totalVolume;

  const binanceTier = getTier(BINANCE_TIERS, estimated30dVol);
  const binanceFees = takerVolume * binanceTier.taker + makerVolume * binanceTier.maker;

  const bybitTier = getTier(BYBIT_TIERS, estimated30dVol);
  const bybitFees = takerVolume * bybitTier.taker + makerVolume * bybitTier.maker;

  return {
    totalFeesPaid: Math.round(totalHlFees * 100) / 100,
    totalVolume: Math.round(totalVolume * 100) / 100,
    totalTrades: fills.length,
    lighter: {
      totalFees: 0,
      takerRate: 0,
      makerRate: 0,
      savingsVsHl: Math.round(totalHlFees * 100) / 100,
    },
    binance: {
      totalFees: Math.round(binanceFees * 100) / 100,
      takerRate: binanceTier.taker,
      makerRate: binanceTier.maker,
      diffVsHl: Math.round((totalHlFees - binanceFees) * 100) / 100,
    },
    bybit: {
      totalFees: Math.round(bybitFees * 100) / 100,
      takerRate: bybitTier.taker,
      makerRate: bybitTier.maker,
      diffVsHl: Math.round((totalHlFees - bybitFees) * 100) / 100,
    },
  };
}

/* ── Default simulation data for generic OG ──────────────────────────────── */

function defaultOGData(): OGData {
  const estimatedVolume = 1_450_734_500;
  const takerRatio = 0.5;
  const takerVolume = estimatedVolume * takerRatio;
  const makerVolume = estimatedVolume - takerVolume;

  const hlTier = getTier(HL_PERP_TIERS, estimatedVolume);
  const totalHlFees = takerVolume * hlTier.taker + makerVolume * hlTier.maker;

  const binanceTier = getTier(BINANCE_TIERS, estimatedVolume);
  const binanceFees = takerVolume * binanceTier.taker + makerVolume * binanceTier.maker;

  const bybitTier = getTier(BYBIT_TIERS, estimatedVolume);
  const bybitFees = takerVolume * bybitTier.taker + makerVolume * bybitTier.maker;

  return {
    totalFeesPaid: Math.round(totalHlFees * 100) / 100,
    totalVolume: Math.round(estimatedVolume * 100) / 100,
    totalTrades: 0,
    lighter: { totalFees: 0, takerRate: 0, makerRate: 0, savingsVsHl: Math.round(totalHlFees * 100) / 100 },
    binance: { totalFees: Math.round(binanceFees * 100) / 100, takerRate: binanceTier.taker, makerRate: binanceTier.maker, diffVsHl: Math.round((totalHlFees - binanceFees) * 100) / 100 },
    bybit: { totalFees: Math.round(bybitFees * 100) / 100, takerRate: bybitTier.taker, makerRate: bybitTier.maker, diffVsHl: Math.round((totalHlFees - bybitFees) * 100) / 100 },
  };
}

/* ── Diff label helper ───────────────────────────────────────────────────── */

function diffLabel(
  key: "lighter" | "binance" | "bybit",
  data: OGData
): { text: string; color: string } {
  if (key === "lighter") {
    return { text: `${fmtUsd(data.lighter.savingsVsHl)} saved`, color: "#34d399" };
  }
  const exch = data[key];
  if (exch.diffVsHl > 0) return { text: `HL cost ${fmtUsd(exch.diffVsHl)} more`, color: "#f87171" };
  if (exch.diffVsHl < 0) return { text: `HL saved ${fmtUsd(Math.abs(exch.diffVsHl))}`, color: "#34d399" };
  return { text: "same cost", color: "#5e636e" };
}

/* ── OG Image JSX ────────────────────────────────────────────────────────── */

function OGImage({ data }: { data: OGData }) {
  const BG = "#0d1117";
  const CARD_BG = "#161b22";
  const BORDER = "#30363d";
  const TEXT = "#e6edf3";
  const TEXT_DIM = "#b1bac4";
  const TEXT_MUTED = "#8b949e";
  const COL_LIGHTER = "#4a7aff";
  const COL_BINANCE = "#f0b90b";
  const COL_BYBIT = "#f7a600";

  const exchanges = [
    { key: "lighter" as const, name: "LIGHTER", color: COL_LIGHTER, fees: data.lighter.totalFees, takerRate: data.lighter.takerRate, makerRate: data.lighter.makerRate },
    { key: "binance" as const, name: "BINANCE", color: COL_BINANCE, fees: data.binance.totalFees, takerRate: data.binance.takerRate, makerRate: data.binance.makerRate },
    { key: "bybit" as const, name: "BYBIT", color: COL_BYBIT, fees: data.bybit.totalFees, takerRate: data.bybit.takerRate, makerRate: data.bybit.makerRate },
  ];

  const volText = data.totalTrades > 0
    ? `${fmtVol(data.totalVolume)} volume across ${fmtNum(data.totalTrades)} trades`
    : `${fmtVol(data.totalVolume)} volume`;

  return (
    <div
      style={{
        display: "flex",
        width: "1200px",
        height: "630px",
        background: BG,
        padding: "32px",
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: "16px",
          padding: "36px 40px",
        }}
      >
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "14px", color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            TOTAL FEES PAID ON HYPERLIQUID
          </span>
          <span style={{ fontSize: "14px", color: TEXT_MUTED }}>tradingfees.wtf</span>
        </div>

        {/* Main amount */}
        <div style={{ fontSize: "56px", fontWeight: 800, color: TEXT, marginTop: "16px", letterSpacing: "-0.03em", lineHeight: 1 }}>
          {fmtUsd(data.totalFeesPaid)}
        </div>

        {/* Volume sub */}
        <div style={{ fontSize: "18px", color: TEXT_DIM, marginTop: "16px" }}>{volText}</div>

        {/* Separator */}
        <div style={{ display: "flex", width: "100%", height: "1px", background: BORDER, marginTop: "28px" }} />

        {/* Comparison label */}
        <div style={{ fontSize: "14px", color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "28px" }}>
          THE SAME ACTIVITY WOULD HAVE COST YOU:
        </div>

        {/* Exchange columns */}
        <div style={{ display: "flex", marginTop: "24px", flex: 1 }}>
          {exchanges.map((exch, i) => {
            const dl = diffLabel(exch.key, data);
            return (
              <div
                key={exch.key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  paddingLeft: i > 0 ? "24px" : "0",
                  borderLeft: i > 0 ? `1px solid ${BORDER}` : "none",
                  marginLeft: i > 0 ? "24px" : "0",
                }}
              >
                <span style={{ fontSize: "16px", fontWeight: 700, color: exch.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {exch.name}
                </span>
                <span style={{ fontSize: "30px", fontWeight: 700, color: TEXT, marginTop: "10px" }}>
                  {fmtUsd(exch.fees)}
                </span>
                <span style={{ fontSize: "14px", color: TEXT_MUTED, marginTop: "12px" }}>
                  {`taker: ${fmtBps(exch.takerRate)}`}
                </span>
                <span style={{ fontSize: "14px", color: TEXT_MUTED, marginTop: "4px" }}>
                  {`maker: ${fmtBps(exch.makerRate)}`}
                </span>
                <span style={{ fontSize: "15px", fontWeight: 700, color: dl.color, marginTop: "14px" }}>
                  {dl.text}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Route handler ───────────────────────────────────────────────────────── */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = (searchParams.get("address") || "").trim().toLowerCase();

  let data: OGData;

  if (address && ADDRESS_RE.test(address)) {
    try {
      const result = await analyzeForOG(address);
      data = result ?? defaultOGData();
    } catch {
      data = defaultOGData();
    }
  } else {
    data = defaultOGData();
  }

  return new ImageResponse(<OGImage data={data} />, {
    width: 1200,
    height: 630,
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
