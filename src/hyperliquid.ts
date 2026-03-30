/** Client-side Hyperliquid API calls. */

import type { Fill, FillsData } from "./fees";

const HL_API_URL = "https://api.hyperliquid.xyz/info";
const MAX_FILLS = 50_000;
const PAGE_SIZE = 2000;

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
  onProgress?: (count: number) => void
): Promise<FillsData> {
  // Step 1: get the most recent 2000 fills
  const fills = (await postHL({ type: "userFills", user: address })) as Fill[];

  if (!fills || fills.length === 0) {
    return { fills: [], truncated: false };
  }

  const allFills: Fill[] = [...fills];
  const seenTids = new Set(allFills.map((f) => f.tid).filter(Boolean));
  let truncated = false;

  // Step 2: paginate backwards if we got a full page
  if (fills.length >= PAGE_SIZE) {
    let earliestTime = Math.min(...fills.map((f) => Number(f.time)));

    while (allFills.length < MAX_FILLS) {
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

      onProgress?.(allFills.length);

      if (page.length < PAGE_SIZE) break;
      earliestTime = Math.min(...newFills.map((f) => Number(f.time)));
    }

    if (allFills.length >= MAX_FILLS) {
      truncated = true;
    }
  }

  // Sort by time ascending
  allFills.sort((a, b) => Number(a.time) - Number(b.time));
  return { fills: allFills, truncated };
}
