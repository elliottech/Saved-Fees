import asyncio
import logging
import time

import httpx

logger = logging.getLogger(__name__)

HL_API_URL = "https://api.hyperliquid.xyz/info"
MAX_FILLS = 50_000
PAGE_SIZE = 2000
BASE_REQUEST_DELAY = 0.2
MAX_RETRIES = 5


class HyperliquidRateLimiter:
    """Serialize requests from our IP and back off when HL pushes back."""

    def __init__(self):
        self._semaphore = asyncio.Semaphore(1)
        self._lock = asyncio.Lock()
        self._next_allowed_at = 0.0
        self._extra_delay = 0.0

    async def acquire_slot(self) -> None:
        await self._semaphore.acquire()
        async with self._lock:
            now = time.monotonic()
            wait_for = max(0.0, self._next_allowed_at - now)
            scheduled_at = max(now, self._next_allowed_at) + BASE_REQUEST_DELAY + self._extra_delay
            self._next_allowed_at = scheduled_at
        if wait_for > 0:
            await asyncio.sleep(wait_for)

    async def release_success(self) -> None:
        async with self._lock:
            self._extra_delay = max(0.0, self._extra_delay * 0.5 - 0.05)
        self._semaphore.release()

    async def release_backoff(self, *, attempt: int) -> float:
        async with self._lock:
            bumped = max(0.5, self._extra_delay * 2 if self._extra_delay else 0.5)
            self._extra_delay = min(5.0, bumped)
            delay = self._extra_delay + min(2**attempt, 8)
            self._next_allowed_at = max(self._next_allowed_at, time.monotonic() + delay)
        self._semaphore.release()
        return delay


rate_limiter = HyperliquidRateLimiter()


async def _post_hl(client: httpx.AsyncClient, payload: dict, *, timeout: int) -> list | dict:
    """Make a throttled HL request with retries for rate-limit / transient errors."""
    last_error = None

    for attempt in range(MAX_RETRIES):
        await rate_limiter.acquire_slot()
        try:
            resp = await client.post(HL_API_URL, json=payload, timeout=timeout)
            if resp.status_code == 429 or 500 <= resp.status_code < 600:
                delay = await rate_limiter.release_backoff(attempt=attempt)
                last_error = httpx.HTTPStatusError(
                    f"Hyperliquid API returned status {resp.status_code}",
                    request=resp.request,
                    response=resp,
                )
                logger.warning("HL request throttled (%s). Backing off for %.2fs", resp.status_code, delay)
                await asyncio.sleep(delay)
                continue

            resp.raise_for_status()
            data = resp.json()
            await rate_limiter.release_success()
            return data
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            delay = await rate_limiter.release_backoff(attempt=attempt)
            last_error = exc
            logger.warning("HL request failed (%s). Backing off for %.2fs", type(exc).__name__, delay)
            await asyncio.sleep(delay)
        except Exception:
            rate_limiter._semaphore.release()
            raise

    if last_error:
        raise last_error
    raise RuntimeError("Hyperliquid request failed without an explicit error")


async def fetch_user_fees(client: httpx.AsyncClient, address: str) -> dict:
    """Fetch user fee tier, effective rates, staking/referral discounts."""
    return await _post_hl(
        client,
        {"type": "userFees", "user": address},
        timeout=15,
    )


async def fetch_portfolio(client: httpx.AsyncClient, address: str) -> list:
    """Fetch portfolio volume aggregates used for partial-history estimation."""
    return await _post_hl(
        client,
        {"type": "portfolio", "user": address},
        timeout=20,
    )


async def fetch_spot_meta(client: httpx.AsyncClient) -> dict:
    """Fetch spot metadata used to resolve raw @asset IDs to readable labels."""
    return await _post_hl(
        client,
        {"type": "spotMeta"},
        timeout=20,
    )


async def fetch_all_fills(client: httpx.AsyncClient, address: str) -> dict:
    """Paginate through all user fills, newest first then backwards.

    Returns fills sorted by time ascending (oldest first).
    """
    # Step 1: get the most recent 2000 fills
    fills = await _post_hl(
        client,
        {"type": "userFills", "user": address},
        timeout=30,
    )

    if not fills:
        return {"fills": [], "truncated": False}

    all_fills = list(fills)
    seen_tids = {f.get("tid") for f in all_fills}
    truncated = False

    # Step 2: paginate backwards if we got a full page
    if len(fills) >= PAGE_SIZE:
        earliest_time = min(int(f["time"]) for f in fills)

        while len(all_fills) < MAX_FILLS:
            page = await _post_hl(
                client,
                {
                    "type": "userFillsByTime",
                    "user": address,
                    "startTime": 0,
                    "endTime": earliest_time - 1,
                },
                timeout=30,
            )

            if not page:
                break

            # Deduplicate
            new_fills = [f for f in page if f.get("tid") not in seen_tids]
            if not new_fills:
                break

            all_fills.extend(new_fills)
            seen_tids.update(f.get("tid") for f in new_fills)

            logger.info(f"Fetched {len(all_fills)} fills so far...")

            if len(page) < PAGE_SIZE:
                break

            earliest_time = min(int(f["time"]) for f in new_fills)

        if len(all_fills) >= MAX_FILLS:
            truncated = True

    # Sort by time ascending
    all_fills.sort(key=lambda f: int(f["time"]))
    return {"fills": all_fills, "truncated": truncated}
