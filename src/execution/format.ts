import type { Direction, Tag, WindowKey } from "./types";

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

export function fmtUsd(v: number | null | undefined, signed = false): string {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtBps(v: number | null | undefined, signed = true): string {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  return `${sign}${Math.abs(v).toFixed(2)} bps`;
}

export const fmtInt = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));

export function fmtPx(v: number | null | undefined): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  const digits = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const signClass = (v: number | null | undefined) =>
  v == null || v === 0 ? "" : v > 0 ? "ex-pos" : "ex-neg";

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
