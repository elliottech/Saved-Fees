import { gunzipSync } from "zlib";
import type {
  CoinSummary,
  Direction,
  LeaderboardPage,
  LeaderboardRow,
  Latest,
  MarketDay,
  Meta,
  Table,
  Tag,
  Wallet,
  WalletCoin,
  WalletDay,
  WalletDirection,
  WalletOrder,
  WalletWindow,
  WindowKey,
} from "./types";

/** Base URL of the public dataset (R2 custom domain, or a local folder served over HTTP in dev). */
const BASE = (process.env.EXECUTION_DATA_URL ?? "https://execution-data.tradingfees.wtf").replace(/\/$/, "");

/** Files under a version prefix are immutable; latest.json moves once a day. */
const LATEST_TTL = 60;
const FILE_TTL = 86400;

async function getJson<T>(url: string, revalidate: number): Promise<T | null> {
  const res = await fetch(url, { next: { revalidate } });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // R2 serves Content-Encoding: gzip (fetch decompresses); a plain static server doesn't.
  const text = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  return JSON.parse(text) as T;
}

export async function getLatest(): Promise<Latest> {
  const latest = await getJson<Latest>(`${BASE}/latest.json`, LATEST_TTL);
  if (!latest) throw new Error("execution dataset: latest.json missing");
  return latest;
}

async function getFile<T>(rel: string): Promise<T | null> {
  const { prefix } = await getLatest();
  return getJson<T>(`${BASE}/${prefix}${rel}`, FILE_TTL);
}

function objects<T>(table: Table | null | undefined): T[] {
  if (!table) return [];
  return table.rows.map((row) => Object.fromEntries(table.columns.map((c, i) => [c, row[i]])) as T);
}

export async function getMeta(): Promise<Meta> {
  const meta = await getFile<Meta>("meta.json");
  if (!meta) throw new Error("execution dataset: meta.json missing");
  return meta;
}

export async function getLeaderboard(
  direction: Direction,
  window: WindowKey,
  scope: string,
  page: number,
): Promise<LeaderboardPage | null> {
  const raw = await getFile<Omit<LeaderboardPage, "rows"> & Table>(
    `lb/${direction}/${window}/${scope}/${page}.json`,
  );
  if (!raw) return null;
  return { ...raw, rows: objects<LeaderboardRow>(raw) };
}

export async function getCoins(direction: Direction): Promise<CoinSummary[]> {
  return objects<CoinSummary>(await getFile<Table>(`coins/${direction}.json`));
}

export async function getMarketDaily(direction: Direction): Promise<MarketDay[]> {
  return objects<MarketDay>(await getFile<Table>(`daily/${direction}.json`));
}

export async function getSearchIndex(): Promise<{ name: string; address: string }[]> {
  return objects(await getFile<Table>("search.json"));
}

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
          best: unknown[][];
          worst: unknown[][];
        }
      >;
    }
  >;
}

export async function getWallet(address: string): Promise<Wallet | null> {
  const addr = address.toLowerCase();
  if (!ADDRESS_RE.test(addr)) return null;
  const shard = await getFile<RawShard>(`w/${addr.slice(2, 5)}.json`);
  const raw = shard?.wallets[addr];
  if (!shard || !raw) return null;
  const directions: Partial<Record<Direction, WalletDirection>> = {};
  for (const [dir, d] of Object.entries(raw.directions)) {
    directions[dir as Direction] = {
      windows: d.windows,
      coins: objects<WalletCoin>({ columns: shard.columns.coins, rows: d.coins }),
      daily: objects<WalletDay>({ columns: shard.columns.daily, rows: d.daily }),
      best: objects<WalletOrder>({ columns: shard.columns.orders, rows: d.best }),
      worst: objects<WalletOrder>({ columns: shard.columns.orders, rows: d.worst }),
    };
  }
  return { address: addr, name: raw.name, tags: raw.tags, directions };
}
