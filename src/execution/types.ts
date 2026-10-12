/** Public execution dataset — mirrors internal-stats cronjobs/jobs/execution_public/README.md (schema 1). */

export type Direction = "hl_to_lighter" | "lighter_to_hl";
export type WindowKey = "7d" | "30d" | "90d" | "all";

export interface Latest {
  version: string;
  prefix: string;
  generated_at: string;
}

export interface WindowSummary {
  start: string;
  end: string;
  wallets: number;
  positive_wallets: number;
  pages: number;
  positive_pages: number;
  replayed_notional: number;
  total_usd: number;
  positive_total_usd: number;
  fee_saved_usd: number;
  px_usd: number;
  total_bps: number | null;
  median_usd: number;
}

export interface DirectionMeta {
  first_day: string;
  last_day: string;
  windows: Partial<Record<WindowKey, WindowSummary>>;
}

export interface Meta {
  schema: number;
  generated_at: string;
  page_size: number;
  windows: WindowKey[];
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
  total_usd: number;
  total_bps: number;
  fee_saved_usd: number;
  px_usd: number;
  replayed_notional: number;
  orders: number;
  top_coin?: string | null;
  tags: Tag[];
}

export interface LeaderboardPage {
  direction: Direction;
  window: WindowKey;
  scope: string;
  coin: string | null;
  page: number;
  pages: number;
  wallets: number;
  rows: LeaderboardRow[];
}

export interface WalletWindow {
  rank: number;
  of: number;
  total_usd: number;
  total_bps: number;
  fee_saved_usd: number;
  px_usd: number;
  replayed_notional: number;
  taker_notional: number | null;
  orders: number;
  fee_paid_usd: number;
  active_days: number;
  coins: number;
}

export interface WalletCoin {
  coin: string;
  window: WindowKey;
  rank: number;
  of: number;
  total_usd: number;
  total_bps: number;
  fee_saved_usd: number;
  px_usd: number;
  replayed_notional: number;
  orders: number;
}

export interface WalletDay {
  day: string;
  total_usd: number;
  fee_saved_usd: number;
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
  coverage: number;
  fee_usd: number | null;
  fee_saved_usd: number;
  px_usd: number;
  total_usd: number;
  is_liquidation: boolean;
  twap: boolean;
}

export interface WalletDirection {
  windows: Partial<Record<WindowKey, WalletWindow>>;
  coins: WalletCoin[];
  daily: WalletDay[];
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
  positive_wallets: number;
  replayed_notional: number;
  total_usd: number;
  total_bps: number | null;
  pages: number;
}

export interface MarketDay {
  day: string;
  wallets: number;
  orders: number;
  replayed_notional: number;
  fee_saved_usd: number;
  px_usd: number;
  total_usd: number;
}
