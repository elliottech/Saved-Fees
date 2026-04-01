/** Client-side Hyperliquid API calls. */

import type { Fill, FillsData } from "./fees";

const HL_API_URL = "https://api.hyperliquid.xyz/info";
const MAX_FILLS = 50_000;
const PAGE_SIZE = 2000;

export interface FetchFillsOptions {
  onProgress?: (count: number) => void;
  /** When set, only fetch fills from this time onward (ms epoch). */
  startTime?: number;
}

async function postHL(payload: Record<string, unknown>): Promise<unknown> {
  const resp = await fetch(HL_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    throw new Error(`Hyperliquid API returned status ${resp.status}`);
  }
  return resp.json();
}

export async function fetchUserFees(address: string): Promise<Record<string, unknown>> {
  return (await postHL({ type: "userFees", user: address })) as Record<string, unknown>;
}

export async function fetchPortfolio(address: string): Promise<unknown[]> {
  return (await postHL({ type: "portfolio", user: address })) as unknown[];
}

export async function fetchSpotMeta(): Promise<Record<string, unknown>> {
  return (await postHL({ type: "spotMeta" })) as Record<string, unknown>;
}

export async function fetchAllFills(
  address: string,
  opts: FetchFillsOptions = {}
): Promise<FillsData> {
  const { onProgress, startTime: windowStart } = opts;

  // When a time window is specified, skip the generic userFills call and
  // go straight to the time-ranged endpoint so we only fetch what's needed.
  if (windowStart !== undefined) {
    return fetchFillsByTimeRange(address, windowStart, onProgress);
  }

  // Step 1: get the most recent 2000 fills
  const fills = (await postHL({
    type: "userFills",
    user: address,
    aggregateByTime: true,
  })) as Fill[];

  if (!fills || fills.length === 0) {
    return { fills: [], truncated: false };
  }

  const allFills: Fill[] = [...fills];
  const seenTids = new Set(allFills.map((f) => f.tid).filter(Boolean));
  let truncated = false;

  // Step 2: if there may be older fills, page forward from the beginning
  if (fills.length >= PAGE_SIZE) {
    const earliestRecent = Math.min(...fills.map((f) => Number(f.time)));

    let startTime = 0;
    const endTime = earliestRecent - 1;

    while (allFills.length < MAX_FILLS) {
      const page = (await postHL({
        type: "userFillsByTime",
        user: address,
        startTime,
        endTime,
        aggregateByTime: true,
      })) as Fill[];

      if (!page || page.length === 0) break;

      const newFills = page.filter((f) => !seenTids.has(f.tid));
      if (newFills.length === 0) break;

      allFills.push(...newFills);
      for (const f of newFills) {
        if (f.tid) seenTids.add(f.tid);
      }

      onProgress?.(allFills.length);

      if (page.length < PAGE_SIZE) break;

      // API returns oldest 2000 — advance past the latest we received
      const latestReturned = Math.max(...page.map((f) => Number(f.time)));
      startTime = latestReturned + 1;
    }

    if (allFills.length >= MAX_FILLS) {
      truncated = true;
    }
  }

  // Sort by time ascending
  allFills.sort((a, b) => Number(a.time) - Number(b.time));
  return { fills: allFills, truncated };
}

/**
 * Fetch fills only within [startTime, now]. Used for time-windowed queries
 * (7d, 30d, 90d, 1yr) so we don't fetch the user's entire history.
 */
async function fetchFillsByTimeRange(
  address: string,
  startTime: number,
  onProgress?: (count: number) => void
): Promise<FillsData> {
  const allFills: Fill[] = [];
  const seenTids = new Set<string>();
  let cursor = startTime;
  let truncated = false;

  while (allFills.length < MAX_FILLS) {
    const page = (await postHL({
      type: "userFillsByTime",
      user: address,
      startTime: cursor,
      aggregateByTime: true,
    })) as Fill[];

    if (!page || page.length === 0) break;

    const newFills = page.filter((f) => {
      if (f.tid && seenTids.has(f.tid)) return false;
      if (f.tid) seenTids.add(f.tid);
      return true;
    });
    if (newFills.length === 0) break;

    allFills.push(...newFills);
    onProgress?.(allFills.length);

    if (page.length < PAGE_SIZE) break;

    const latestReturned = Math.max(...page.map((f) => Number(f.time)));
    cursor = latestReturned + 1;
  }

  if (allFills.length >= MAX_FILLS) {
    truncated = true;
  }

  allFills.sort((a, b) => Number(a.time) - Number(b.time));
  return { fills: allFills, truncated };
}
