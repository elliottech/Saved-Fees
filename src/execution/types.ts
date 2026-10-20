/** Public execution dataset — mirrors internal-stats cronjobs/jobs/execution_public/README.md (schema 2). */

export const SCHEMA = 2;

export type Direction = "hl_to_lighter" | "lighter_to_hl";
export type WindowKey = "7d" | "30d" | "90d";
/** mid: each venue's execution vs its own mid (default); raw: the raw price difference. */
export type Measure = "mid" | "raw";

export interface Latest {
  version: string;
  prefix: string;
  schema?: number;
  generated_at: string;
}

export interface NotCompared {
  liquidation_notional: number;
  thin_notional: number;
  other_notional: number;
}

export interface MeasureSummary extends Sides {
  total_usd: number;
  total_bps: number | null;
  px_usd: number;
  px_bps: number | null;
  positive_wallets: number;
  positive_total_usd: number;
  negative_wallets: number;
  negative_total_usd: number;
  median_usd: number;
  positive_pages: number;
}

/** What a window actually covers (always present). */
export interface WindowCoverage {
  days: number;
  start: string;
  end: string;
  first_day: string;
  last_day: string;
  days_with_data: number;
  /** Covers the same days as this shorter window: use that one (no files of its own). */
  duplicate_of: WindowKey | null;
}

export interface WindowSummary extends WindowCoverage {
  wallets: number;
  pages: number;
  replayed_notional: number;
  fee_saved_usd: number;
  not_compared: NotCompared;
  mid: MeasureSummary;
  raw: MeasureSummary;
}

export interface DirectionMeta {
  first_day: string;
  last_day: string;
  days_with_data: number;
  updated_at: string;
  top_orders_from: string | null;
  lb_tags: string[];
  windows: Partial<Record<WindowKey, WindowCoverage | WindowSummary>>;
}

export interface Meta {
  schema: number;
  generated_at: string;
  page_size: number;
  windows: WindowKey[];
  measures: Measure[];
  default_measure: Measure;
  variants_version: number;
  max_replay_slippage_bps: number;
  public_tags: Record<string, string>;
  directions: Partial<Record<Direction, DirectionMeta>>;
}

export interface Table<C extends string = string> {
  columns: C[];
  rows: unknown[][];
}

/** [tag, value, builder_address, builder_name] */
export type Tag = [string, number | null, string | null, string | null];

export interface LeaderboardRow {
  rank: number;
  address: string;
  name: string | null;
  total_mid_usd: number;
  total_mid_bps: number;
  total_usd: number;
  total_bps: number;
  fee_saved_usd: number;
  px_mid_usd: number;
  px_usd: number;
  replayed_notional: number;
  orders: number;
  top_coin?: string | null;
  tags: Tag[];
}

export interface LeaderboardPage {
  direction: Direction;
  window: WindowKey;
  measure: Measure;
  scope: string;
  coin: string | null;
  page: number;
  pages: number;
  wallets: number;
  rows: LeaderboardRow[];
}

export interface WalletMeasure {
  rank: number;
  total_usd: number;
  total_bps: number | null;
  px_usd: number;
  px_bps: number | null;
}

export interface WalletWindow {
  of: number;
  replayed_notional: number;
  taker_notional: number | null;
  orders: number;
  fee_paid_usd: number;
  fee_saved_usd: number;
  active_days: number;
  coins: number;
  not_compared: NotCompared;
  mid: WalletMeasure;
  raw: WalletMeasure;
}

export interface WalletCoin {
  coin: string;
  window: WindowKey;
  of: number;
  rank_mid: number;
  rank: number;
  total_mid_usd: number;
  total_mid_bps: number;
  total_usd: number;
  total_bps: number;
  fee_saved_usd: number;
  px_mid_usd: number;
  px_usd: number;
  replayed_notional: number;
  orders: number;
}

export interface WalletDay {
  day: string;
  total_mid_usd: number;
  total_usd: number;
  fee_saved_usd: number;
  px_mid_usd: number;
  px_usd: number;
  replayed_notional: number;
  orders: number;
}

export interface WalletOrder {
  time_ms: number;
  coin: string;
  side: "B" | "A";
  notional: number;
  hl_vwap: number;
  l_vwap: number;
  hl_mid: number | null;
  l_mid: number | null;
  coverage: number;
  fee_usd: number | null;
  fee_saved_usd: number;
  px_mid_usd: number | null;
  px_usd: number;
  total_mid_usd: number | null;
  total_usd: number;
  twap: boolean;
}

export type OrderKind = "best_mid" | "worst_mid" | "best" | "worst";

export interface WalletDirection {
  windows: Partial<Record<WindowKey, WalletWindow>>;
  coins: WalletCoin[];
  daily: WalletDay[];
  best_mid: WalletOrder[];
  worst_mid: WalletOrder[];
  best: WalletOrder[];
  worst: WalletOrder[];
}

export interface Wallet {
  address: string;
  name: string | null;
  tags: Tag[];
  directions: Partial<Record<Direction, WalletDirection>>;
}

export interface CoinSummary {
  coin: string;
  slug: string;
  window: WindowKey;
  wallets: number;
  pages: number;
  /** Bundle file holding this coin's whole ranking, or null when it has pages of its own. */
  bundle: number | null;
  replayed_notional: number;
  fee_saved_usd: number;
  total_mid_usd: number;
  total_mid_bps: number | null;
  positive_wallets_mid: number;
  positive_total_mid_usd: number;
  negative_wallets_mid: number;
  negative_total_mid_usd: number;
  total_usd: number;
  total_bps: number | null;
  positive_wallets: number;
  positive_total_usd: number;
  negative_wallets: number;
  negative_total_usd: number;
}

/** The two sides of zero under one measure (headline split). */
export interface Sides {
  positive_wallets: number;
  positive_total_usd: number;
  negative_wallets: number;
  negative_total_usd: number;
}

export interface MarketDay {
  day: string;
  wallets: number;
  orders: number;
  replayed_notional: number;
  fee_saved_usd: number;
  px_mid_usd: number;
  px_usd: number;
  total_mid_usd: number;
  total_usd: number;
  liquidation_notional: number;
  thin_notional: number;
  other_excluded_notional: number;
}
