import { cache } from "react";
import { gunzipSync } from "zlib";
import {
  SCHEMA,
  type CoinSummary,
  type Direction,
  type LeaderboardPage,
  type LeaderboardRow,
  type Latest,
  type MarketDay,
  type Measure,
  type Meta,
  type OrderKind,
  type Table,
  type Tag,
  type Wallet,
  type WalletCoin,
  type WalletDay,
  type WalletDirection,
  type WalletOrder,
  type WalletWindow,
  type WindowKey,
} from "./types";

/** Base URL of the public dataset (R2 custom domain, or a local folder served over HTTP in dev). */
const BASE = (process.env.EXECUTION_DATA_URL ?? "https://tradingfees-data.pages.dev").replace(/\/$/, "");

/** Files under a version prefix are immutable; latest.json moves once a day. */
const LATEST_TTL = 60;
const FILE_TTL = 86400;

async function getJson<T>(url: string, init: RequestInit): Promise<T | null> {
  const res = await fetch(url, init);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // R2 serves Content-Encoding: gzip (fetch decompresses); a plain static server doesn't.
  const text = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  return JSON.parse(text) as T;
}

export const getLatest = cache(async (): Promise<Latest> => {
  const latest = await getJson<Latest>(`${BASE}/latest.json`, { next: { revalidate: LATEST_TTL } });
  if (!latest) throw new Error("execution dataset: latest.json missing");
  return latest;
});

const getFreshLatest = cache(() => getJson<Latest>(`${BASE}/latest.json`, { cache: "no-store" }));

/** A cached latest.json can point at a prefix that a newer publish already replaced: re-read it once on a miss. */
const getRawFile = cache(async (rel: string): Promise<unknown> => {
  const { prefix } = await getLatest();
  const data = await getJson<unknown>(`${BASE}/${prefix}${rel}`, { next: { revalidate: FILE_TTL } });
  if (data != null) return data;
  const fresh = await getFreshLatest();
  if (!fresh || fresh.prefix === prefix) return null;
  return getJson<unknown>(`${BASE}/${fresh.prefix}${rel}`, { next: { revalidate: FILE_TTL } });
});

const getFile = <T>(rel: string) => getRawFile(rel) as Promise<T | null>;

function objects<T>(table: Table | null | undefined): T[] {
  if (!table) return [];
  return table.rows.map((row) => Object.fromEntries(table.columns.map((c, i) => [c, row[i]])) as T);
}

export const getMeta = cache(async (): Promise<Meta> => {
  const meta = await getFile<Meta>("meta.json");
  if (!meta) throw new Error("execution dataset: meta.json missing");
  if (meta.schema !== SCHEMA) throw new Error(`execution dataset: schema ${meta.schema}, expected ${SCHEMA}`);
  return meta;
});

/** *window* must be a window with files of its own (see resolveWindow). */
export const getLeaderboard = cache(
  async (
    direction: Direction,
    window: WindowKey,
    measure: Measure,
    scope: string,
    page: number,
  ): Promise<LeaderboardPage | null> => {
    const raw = await getFile<Omit<LeaderboardPage, "rows"> & Table>(
      `lb/${direction}/${window}/${measure}/${scope}/${page}.json`,
    );
    if (!raw) return null;
    return { ...raw, rows: objects<LeaderboardRow>(raw) };
  },
);

export const getCoins = cache(
  async (direction: Direction): Promise<CoinSummary[]> =>
    objects<CoinSummary>(await getFile<Table>(`coins/${direction}.json`)),
);

export const getMarketDaily = cache(
  async (direction: Direction): Promise<MarketDay[]> =>
    objects<MarketDay>(await getFile<Table>(`daily/${direction}.json`)),
);

export const getSearchIndex = cache(
  async (): Promise<{ name: string; address: string }[]> => objects(await getFile<Table>("search.json")),
);

export const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

interface RawShard {
  columns: { coins: string[]; daily: string[]; orders: string[] };
  wallets: Record<
    string,
    {
      name: string | null;
      tags: Tag[];
      directions: Record<
        string,
        {
          windows: Partial<Record<WindowKey, WalletWindow>>;
          coins: unknown[][];
          daily: unknown[][];
        } & Record<OrderKind, unknown[][]>
      >;
    }
  >;
}

const ORDER_KINDS: OrderKind[] = ["best_mid", "worst_mid", "best", "worst"];

export const getWallet = cache(async (address: string): Promise<Wallet | null> => {
  const addr = address.toLowerCase();
  if (!ADDRESS_RE.test(addr)) return null;
  const shard = await getFile<RawShard>(`w/${addr.slice(2, 5)}.json`);
  const raw = shard?.wallets[addr];
  if (!shard || !raw) return null;
  const directions: Partial<Record<Direction, WalletDirection>> = {};
  for (const [dir, d] of Object.entries(raw.directions)) {
    const orders = Object.fromEntries(
      ORDER_KINDS.map((k) => [k, objects<WalletOrder>({ columns: shard.columns.orders, rows: d[k] ?? [] })]),
    ) as Record<OrderKind, WalletOrder[]>;
    directions[dir as Direction] = {
      windows: d.windows,
      coins: objects<WalletCoin>({ columns: shard.columns.coins, rows: d.coins }),
      daily: objects<WalletDay>({ columns: shard.columns.daily, rows: d.daily }),
      ...orders,
    };
  }
  return { address: addr, name: raw.name, tags: raw.tags, directions };
});
