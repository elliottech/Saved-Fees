import type { Direction, DirectionMeta, Measure, Tag, WindowCoverage, WindowKey, WindowSummary } from "./types";

export const DIRECTIONS: Record<
  Direction,
  { title: string; short: string; source: string; target: string; question: string }
> = {
  hl_to_lighter: {
    title: "Hyperliquid traders on Lighter",
    short: "HL → Lighter",
    source: "Hyperliquid",
    target: "Lighter",
    question: "How much Hyperliquid takers would have saved by sending the same orders to Lighter",
  },
  lighter_to_hl: {
    title: "Lighter traders vs Hyperliquid",
    short: "Lighter vs HL",
    source: "Lighter",
    target: "Hyperliquid",
    question: "How much Lighter takers saved by not trading the same orders on Hyperliquid",
  },
};

export const WINDOW_LABELS: Record<WindowKey, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
};

export const isDirection = (v: string): v is Direction => v in DIRECTIONS;
export const isWindow = (v: string | undefined): v is WindowKey =>
  v === "7d" || v === "30d" || v === "90d" || v === "all";

export const WINDOW_ORDER: WindowKey[] = ["7d", "30d", "90d", "all"];
export const DEFAULT_WINDOW: WindowKey = "30d";

/** Windows with data of their own, shortest first (a window covering the same days as a shorter one is hidden). */
export function windowOptions(dm: DirectionMeta): WindowKey[] {
  return WINDOW_ORDER.filter((k) => {
    const w = dm.windows[k];
    return w && !w.duplicate_of;
  });
}

/** The window to show for a requested key: a duplicate maps to the shorter window it repeats; unknown → 30 days. */
export function resolveWindow(dm: DirectionMeta, requested?: string): WindowKey | null {
  const key = isWindow(requested) && dm.windows[requested] ? requested : DEFAULT_WINDOW;
  const w = dm.windows[key];
  if (w) return w.duplicate_of ?? key;
  return windowOptions(dm)[0] ?? null;
}

export const isSummary = (w: WindowCoverage | undefined): w is WindowSummary => !!w && "wallets" in w;

/** "2026-10-01 → 2026-10-19 · 19 days with data" — the days a window actually covers. */
export function coverageText(w: WindowCoverage): string {
  const days = `${w.days_with_data} day${w.days_with_data === 1 ? "" : "s"} with data`;
  return `${w.first_day} → ${w.last_day} · ${days}`;
}

/** A window's tab label: its nominal length, or the days it covers when that is shorter. */
export function windowLabel(key: WindowKey, w: WindowCoverage | undefined): string {
  if (!w || key === "all" || w.days == null || w.days_with_data >= w.days) return WINDOW_LABELS[key];
  return `${WINDOW_LABELS[key]} (${w.days_with_data} with data)`;
}

export const MEASURES: Measure[] = ["mid", "raw"];
export const DEFAULT_MEASURE: Measure = "mid";
export const isMeasure = (v: string | undefined): v is Measure => v === "mid" || v === "raw";
export const MEASURE_LABELS: Record<Measure, string> = { mid: "mid-adjusted", raw: "raw price" };
export const MEASURE_HELP: Record<Measure, string> = {
  mid: "Each venue's fill measured against its own mid price, so the standing price gap between the two venues doesn't count.",
  raw: "Fill price on one venue minus fill price on the other, including any standing price gap between the venues.",
};

/** A flat row's total / bps / price difference under a measure. */
export function pick<T extends { total_usd: number; total_mid_usd: number | null }>(row: T, m: Measure): number | null {
  return m === "mid" ? row.total_mid_usd : row.total_usd;
}
export function pickBps<T extends { total_bps: number | null; total_mid_bps: number | null }>(
  row: T,
  m: Measure,
): number | null {
  return m === "mid" ? row.total_mid_bps : row.total_bps;
}
export function pickPx<T extends { px_usd: number; px_mid_usd: number | null }>(row: T, m: Measure): number | null {
  return m === "mid" ? row.px_mid_usd : row.px_usd;
}

const ZERO = 0.005;

const USD_UNITS: [number, string, number][] = [
  [1e3, "K", 1],
  [1e6, "M", 2],
  [1e9, "B", 2],
];

function usdAbs(a: number): string {
  if (a < 1e4) return `$${a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  let i = a >= 1e9 ? 2 : a >= 1e6 ? 1 : 0;
  for (;;) {
    const [div, unit, digits] = USD_UNITS[i];
    const scale = 10 ** digits;
    const n = Math.round(a / (div / scale));
    if (n >= 1000 * scale && i < USD_UNITS.length - 1) {
      i++;
      continue;
    }
    return `$${(n / scale).toFixed(digits)}${unit}`;
  }
}

export function fmtUsd(v: number | null | undefined, signed = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) < ZERO) return "$0.00";
  const sign = v < 0 ? "−" : signed ? "+" : "";
  return `${sign}${usdAbs(Math.abs(v))}`;
}

export function fmtBps(v: number | null | undefined, signed = true): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) < ZERO) return "0.00 bps";
  const sign = v < 0 ? "−" : signed ? "+" : "";
  return `${sign}${Math.abs(v).toFixed(2)} bps`;
}

export const fmtInt = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US");

/** "1 wallet", "2,345 wallets". */
export const fmtWallets = (n: number) => `${fmtInt(n)} wallet${n === 1 ? "" : "s"}`;

export function fmtPx(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a > 0 && a < 1) return v.toLocaleString("en-US", { maximumSignificantDigits: 5 });
  return v.toLocaleString("en-US", { maximumFractionDigits: a >= 1000 ? 2 : 4, minimumFractionDigits: 0 });
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const signClass = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) || Math.abs(v) < ZERO ? "" : v > 0 ? "ex-pos" : "ex-neg";

export const isZero = (v: number | null | undefined) => v == null || !Number.isFinite(v) || Math.abs(v) < ZERO;

/** Hero / share-card phrase for a wallet's total in a direction (positive = cheaper on Lighter). */
export function outcomeText(direction: Direction, totalUsd: number | null): string {
  if (isZero(totalUsd)) return "same cost on both venues";
  const better = (totalUsd as number) > 0;
  if (direction === "hl_to_lighter") return better ? "would have saved on Lighter" : "would have paid more on Lighter";
  return better ? "saved by trading on Lighter (vs Hyperliquid)" : "would have paid less on Hyperliquid";
}

/** Same rule as the producer's coin_slug (Python str.replace replaces every ':'). */
export const coinSlug = (coin: string) => coin.split(":").join("_");

export const fmtTime = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC";

export function tagText(t: Tag): string {
  const [tag, , builder, builderName] = t;
  if (tag === "builder") return `via ${builderName ?? shortAddr(builder ?? "")}`;
  return (
    { on_lighter: "also on Lighter", twap_heavy: "TWAP", liquidated: "liquidated", maker_heavy: "maker" }[tag] ??
    tag
  );
}

export function tagValue(t: Tag): string {
  const [tag, value] = t;
  if (value == null) return "";
  if (tag === "on_lighter") return `${value} account${value === 1 ? "" : "s"}`;
  if (tag === "maker_heavy") return `maker ${value.toFixed(1)}× taker`;
  return `${value.toFixed(0)}% of volume`;
}
