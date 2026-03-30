"""Fee tier definitions and comparison engine."""

from collections import defaultdict
import re

WINDOW_TO_PORTFOLIO_KEY = {
    "7d": "week",
    "30d": "month",
    "all": "allTime",
}

WINDOW_TO_DAYS = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "1yr": 365,
}

SIMULATION_DAYS = {
    "all": 30,
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "1yr": 365,
}

# ── Hyperliquid perp tiers (14-day weighted volume) ──────────────────────────
HL_PERP_TIERS = [
    {"name": "Tier 0 (<$5M)",   "min_volume": 0,             "taker": 0.000450, "maker": 0.000150},
    {"name": "Tier 1 (>$5M)",   "min_volume": 5_000_000,     "taker": 0.000400, "maker": 0.000120},
    {"name": "Tier 2 (>$25M)",  "min_volume": 25_000_000,    "taker": 0.000350, "maker": 0.000080},
    {"name": "Tier 3 (>$100M)", "min_volume": 100_000_000,   "taker": 0.000300, "maker": 0.000040},
    {"name": "Tier 4 (>$500M)", "min_volume": 500_000_000,   "taker": 0.000280, "maker": 0.000000},
    {"name": "Tier 5 (>$2B)",   "min_volume": 2_000_000_000, "taker": 0.000250, "maker": 0.000000},
    {"name": "Tier 6 (>$7B)",   "min_volume": 7_000_000_000, "taker": 0.000240, "maker": 0.000000},
]

HL_STAKING_TIERS = [
    {"name": "None",     "min_hype": 0,       "discount": 0.00},
    {"name": "Wood",     "min_hype": 10,      "discount": 0.05},
    {"name": "Bronze",   "min_hype": 100,     "discount": 0.10},
    {"name": "Silver",   "min_hype": 1_000,   "discount": 0.15},
    {"name": "Gold",     "min_hype": 10_000,  "discount": 0.20},
    {"name": "Platinum", "min_hype": 100_000, "discount": 0.30},
    {"name": "Diamond",  "min_hype": 500_000, "discount": 0.40},
]

STANDARD_HIP3_TIERS = [
    {"name": tier["name"], "min_volume": tier["min_volume"], "taker": tier["taker"] * 2, "maker": tier["maker"] * 2}
    for tier in HL_PERP_TIERS
]

GROWTH_HIP3_TIERS = [
    {"name": tier["name"], "min_volume": tier["min_volume"], "taker": tier["taker"] * 0.2, "maker": tier["maker"] * 0.2}
    for tier in HL_PERP_TIERS
]

STANDARD_ALIGNED_HIP3_TIERS = [
    {"name": tier["name"], "min_volume": tier["min_volume"], "taker": tier["taker"] * 1.8, "maker": tier["maker"] * 1.8}
    for tier in HL_PERP_TIERS
]

GROWTH_ALIGNED_HIP3_TIERS = [
    {"name": tier["name"], "min_volume": tier["min_volume"], "taker": tier["taker"] * 0.18, "maker": tier["maker"] * 0.18}
    for tier in HL_PERP_TIERS
]

HYENA_TIERS = [
    {"name": tier["name"], "min_volume": tier["min_volume"], "taker": tier["taker"] * 1.11, "maker": tier["maker"] * 1.11}
    for tier in HL_PERP_TIERS
]

# ── Binance Futures USDT-M (30-day volume) ───────────────────────────────────
BINANCE_TIERS = [
    {"name": "VIP 0",            "min_volume": 0,               "maker": 0.000200, "taker": 0.000500},
    {"name": "VIP 1 (>$15M)",    "min_volume": 15_000_000,      "maker": 0.000160, "taker": 0.000400},
    {"name": "VIP 2 (>$50M)",    "min_volume": 50_000_000,      "maker": 0.000140, "taker": 0.000350},
    {"name": "VIP 3 (>$100M)",   "min_volume": 100_000_000,     "maker": 0.000120, "taker": 0.000320},
    {"name": "VIP 4 (>$250M)",   "min_volume": 250_000_000,     "maker": 0.000100, "taker": 0.000300},
    {"name": "VIP 5 (>$500M)",   "min_volume": 500_000_000,     "maker": 0.000080, "taker": 0.000270},
    {"name": "VIP 6 (>$1B)",     "min_volume": 1_000_000_000,   "maker": 0.000060, "taker": 0.000250},
    {"name": "VIP 7 (>$2.5B)",   "min_volume": 2_500_000_000,   "maker": 0.000040, "taker": 0.000220},
    {"name": "VIP 8 (>$5B)",     "min_volume": 5_000_000_000,   "maker": 0.000020, "taker": 0.000200},
    {"name": "VIP 9 (>$10B)",    "min_volume": 10_000_000_000,  "maker": 0.000000, "taker": 0.000170},
]

# ── Bybit Linear Perpetuals (30-day volume) ──────────────────────────────────
BYBIT_TIERS = [
    {"name": "VIP 0",               "min_volume": 0,               "maker": 0.000200, "taker": 0.000550},
    {"name": "VIP 1 (>$10M)",       "min_volume": 10_000_000,      "maker": 0.000180, "taker": 0.000400},
    {"name": "VIP 2 (>$25M)",       "min_volume": 25_000_000,      "maker": 0.000160, "taker": 0.000375},
    {"name": "VIP 3 (>$50M)",       "min_volume": 50_000_000,      "maker": 0.000140, "taker": 0.000350},
    {"name": "VIP 4 (>$100M)",      "min_volume": 100_000_000,     "maker": 0.000120, "taker": 0.000320},
    {"name": "VIP 5 (>$250M)",      "min_volume": 250_000_000,     "maker": 0.000100, "taker": 0.000320},
    {"name": "Supreme VIP (>$500M)", "min_volume": 500_000_000,    "maker": 0.000000, "taker": 0.000300},
]

DEPLOYER_FEE_TIERS = {
    "flx": STANDARD_HIP3_TIERS,
    "xyz": STANDARD_HIP3_TIERS,
    "km": GROWTH_ALIGNED_HIP3_TIERS,
    "cash": GROWTH_HIP3_TIERS,
    "vntl": STANDARD_ALIGNED_HIP3_TIERS,
    "hyna": HYENA_TIERS,
}


def get_tier(tiers: list[dict], volume: float) -> dict:
    """Return the highest tier the volume qualifies for."""
    matched = tiers[0]
    for tier in tiers:
        if volume >= tier["min_volume"]:
            matched = tier
    return matched


def _extract_portfolio_volume(portfolio_data: list, window: str) -> float | None:
    """Read HL portfolio volume aggregates when available for the selected window."""
    key = WINDOW_TO_PORTFOLIO_KEY.get(window)
    if not key:
        return None

    for bucket in portfolio_data or []:
        if not isinstance(bucket, list) or len(bucket) != 2:
            continue
        if bucket[0] != key or not isinstance(bucket[1], dict):
            continue
        try:
            return float(bucket[1].get("vlm", 0))
        except (TypeError, ValueError):
            return None

    return None


def _build_spot_asset_labels(spot_meta: dict | None) -> dict[str, str]:
    labels: dict[str, str] = {}
    if not isinstance(spot_meta, dict):
        return labels

    tokens = spot_meta.get("tokens")
    universe = spot_meta.get("universe")
    if not isinstance(tokens, list) or not isinstance(universe, list):
        return labels

    token_names: list[str | None] = []
    for token in tokens:
        if isinstance(token, dict):
            name = token.get("name")
            token_names.append(name if isinstance(name, str) and name else None)
        else:
            token_names.append(None)

    for idx, market in enumerate(universe):
        if not isinstance(market, dict):
            continue

        label = market.get("name")
        token_indexes = market.get("tokens")
        if isinstance(token_indexes, list) and token_indexes:
            base_idx = token_indexes[0]
            if isinstance(base_idx, int) and 0 <= base_idx < len(token_names):
                base_name = token_names[base_idx]
                if isinstance(base_name, str) and base_name:
                    label = base_name

        if isinstance(label, str) and label:
            labels[f"@{idx}"] = label

    return labels


def _coin_prefix(raw_coin: str) -> str | None:
    if not isinstance(raw_coin, str) or not raw_coin:
        return None
    if raw_coin.startswith("@"):
        return None

    match = re.match(r"^([a-z]+)", raw_coin.lower())
    if not match:
        return None

    prefix = match.group(1)
    return prefix if prefix in DEPLOYER_FEE_TIERS else None


def _expected_hl_rates_for_coin(
    raw_coin: str,
    estimated_14d_vol: float,
    staking_discount: float,
    referral_discount: float,
    default_taker_rate: float,
    default_maker_rate: float,
) -> tuple[float, float]:
    prefix = _coin_prefix(raw_coin)
    if not prefix:
        return default_taker_rate, default_maker_rate

    tier = get_tier(DEPLOYER_FEE_TIERS[prefix], estimated_14d_vol)
    discount_multiplier = max(0.0, 1.0 - staking_discount - referral_discount)
    return tier["taker"] * discount_multiplier, tier["maker"] * discount_multiplier


def analyze_fees(user_fees_data: dict, portfolio_data: list, fills_data: dict, spot_meta: dict | None, address: str, window: str) -> dict:
    """Analyze fills and compute fee comparison across exchanges."""
    fills = fills_data["fills"]
    spot_asset_labels = _build_spot_asset_labels(spot_meta)

    if not fills:
        return {
            "address": address,
            "error": "No trading history found for this address.",
            "summary": None,
            "hyperliquid": None,
            "comparisons": None,
            "top_coins": [],
            "history_notice": None,
        }

    # ── Parse fills ──────────────────────────────────────────────────────────
    total_volume = 0.0
    taker_volume = 0.0
    maker_volume = 0.0
    taker_fees_paid = 0.0
    maker_fees_paid = 0.0
    total_hl_fees = 0.0
    coin_stats = defaultdict(lambda: {"volume": 0.0, "fees": 0.0, "trades": 0})

    # Stablecoins where fee value ≈ USD (no conversion needed)
    STABLE_FEE_TOKENS = {"USDC", "USDT", "USDT0", "USDH", "USDE", "USDHL", "USDXL", "DAI"}

    for fill in fills:
        px = float(fill.get("px", 0))
        sz = float(fill.get("sz", 0))
        notional = px * sz
        raw_fee = float(fill.get("fee", 0))
        fee_token = fill.get("feeToken", "USDC")
        is_taker = fill.get("crossed", True)
        raw_coin = fill.get("coin", "UNKNOWN")
        coin = spot_asset_labels.get(raw_coin, raw_coin)

        # Convert fee to USD
        if fee_token in STABLE_FEE_TOKENS:
            fee_usd = raw_fee  # already in USD terms (preserve sign for maker rebates)
        else:
            # Non-stable token (e.g. HYPE, PURR) — for spot fills the fee token
            # is the traded asset, so fee * px gives USD value
            fee_usd = raw_fee * px

        total_volume += notional
        total_hl_fees += fee_usd

        if is_taker:
            taker_volume += notional
            taker_fees_paid += fee_usd
        else:
            maker_volume += notional
            maker_fees_paid += fee_usd

        coin_stats[coin]["volume"] += notional
        coin_stats[coin]["fees"] += fee_usd
        coin_stats[coin]["trades"] += 1

    # ── Time period ──────────────────────────────────────────────────────────
    times = [int(f["time"]) for f in fills]
    period_start = min(times)
    period_end = max(times)
    trading_days = max((period_end - period_start) / (86400 * 1000), 1)

    maker_ratio = maker_volume / total_volume if total_volume > 0 else 0
    taker_ratio = taker_volume / total_volume if total_volume > 0 else 0

    # ── HL fee info from userFees API ────────────────────────────────────────
    hl_taker_rate = float(user_fees_data.get("userCrossRate", "0.00045"))
    hl_maker_rate = float(user_fees_data.get("userAddRate", "0.00015"))

    staking_info = user_fees_data.get("activeStakingDiscount")
    staking_discount = 0.0
    staking_tier = "None"
    if staking_info and staking_info.get("discount"):
        staking_discount = float(staking_info["discount"])
        # Determine staking tier name from discount
        for st in reversed(HL_STAKING_TIERS):
            if abs(staking_discount - st["discount"]) < 0.001:
                staking_tier = st["name"]
                break

    referral_discount = float(user_fees_data.get("activeReferralDiscount", "0"))

    # ── Partial-history estimation when HL fill pagination is truncated ─────
    portfolio_volume = _extract_portfolio_volume(portfolio_data, window)
    estimated_missing_volume = 0.0
    estimated_missing_fees = 0.0
    history_estimated = False

    # Derive realized side rates from the actual fills first. This captures
    # HIP-3 deployer markets whose fees differ from the generic userFees API.
    observed_taker_rate = (taker_fees_paid / taker_volume) if taker_volume > 0 else None
    observed_maker_rate = (maker_fees_paid / maker_volume) if maker_volume > 0 else None

    if fills_data.get("truncated"):
        missing_requested_history = window == "all"
        requested_days = WINDOW_TO_DAYS.get(window)
        if requested_days is not None:
            latest_time = period_end
            cutoff = latest_time - (requested_days * 86400 * 1000)
            missing_requested_history = period_start > cutoff
            # If the filtered window still contains every fetched fill, the requested
            # window is dense enough that truncation likely affected it too.
            if len(fills) == len(fills_data["fills"]):
                missing_requested_history = True

        if missing_requested_history:
            taker_weight = taker_ratio if taker_ratio > 0 else 1.0
            maker_weight = maker_ratio if maker_ratio > 0 else 0.0

            if portfolio_volume is not None:
                estimated_missing_volume = max(0.0, portfolio_volume - total_volume)
            elif requested_days is not None and trading_days < requested_days and total_volume > 0:
                estimated_missing_volume = max(0.0, (total_volume / trading_days) * (requested_days - trading_days))

            if estimated_missing_volume > 0:
                estimated_14d_vol = total_volume * (14 / trading_days) if trading_days > 14 else total_volume
                expected_taker_sum = 0.0
                expected_maker_sum = 0.0
                for fill in fills:
                    px = float(fill.get("px", 0))
                    sz = float(fill.get("sz", 0))
                    notional = px * sz
                    exp_taker_rate, exp_maker_rate = _expected_hl_rates_for_coin(
                        raw_coin=fill.get("coin", "UNKNOWN"),
                        estimated_14d_vol=estimated_14d_vol,
                        staking_discount=staking_discount,
                        referral_discount=referral_discount,
                        default_taker_rate=hl_taker_rate,
                        default_maker_rate=hl_maker_rate,
                    )
                    if fill.get("crossed", True):
                        expected_taker_sum += notional * exp_taker_rate
                    else:
                        expected_maker_sum += notional * exp_maker_rate

                fallback_taker_rate = (
                    observed_taker_rate
                    if observed_taker_rate is not None
                    else (expected_taker_sum / taker_volume if taker_volume > 0 else hl_taker_rate)
                )
                fallback_maker_rate = (
                    observed_maker_rate
                    if observed_maker_rate is not None
                    else (expected_maker_sum / maker_volume if maker_volume > 0 else hl_maker_rate)
                )
                estimated_missing_fees = (
                    (estimated_missing_volume * taker_weight * fallback_taker_rate) +
                    (estimated_missing_volume * maker_weight * fallback_maker_rate)
                )
                total_volume += estimated_missing_volume
                taker_volume += estimated_missing_volume * taker_weight
                maker_volume += estimated_missing_volume * maker_weight
                total_hl_fees += estimated_missing_fees
                history_estimated = True

    maker_ratio = maker_volume / total_volume if total_volume > 0 else 0
    taker_ratio = taker_volume / total_volume if total_volume > 0 else 0

    # Determine HL volume tier from fee schedule
    estimated_14d_vol = total_volume * (14 / trading_days) if trading_days > 14 else total_volume
    hl_tier = get_tier(HL_PERP_TIERS, estimated_14d_vol)

    effective_taker_rate = observed_taker_rate if observed_taker_rate is not None else hl_taker_rate
    effective_maker_rate = observed_maker_rate if observed_maker_rate is not None else hl_maker_rate

    # ── Hypothetical fees on other exchanges ─────────────────────────────────
    # Estimate 30-day volume for Binance/Bybit tier matching
    estimated_30d_vol = total_volume * (30 / trading_days) if trading_days > 30 else total_volume

    # Lighter: always $0
    lighter_fees = 0.0

    # Binance
    binance_tier = get_tier(BINANCE_TIERS, estimated_30d_vol)
    binance_fees = (taker_volume * binance_tier["taker"]) + (maker_volume * binance_tier["maker"])
    binance_fees_bnb = binance_fees * 0.90  # 10% BNB discount

    # Bybit
    bybit_tier = get_tier(BYBIT_TIERS, estimated_30d_vol)
    bybit_fees = (taker_volume * bybit_tier["taker"]) + (maker_volume * bybit_tier["maker"])

    # ── Top coins by volume ──────────────────────────────────────────────────
    top_coins = sorted(
        [
            {"coin": coin, "volume": stats["volume"], "fees": stats["fees"], "trades": stats["trades"]}
            for coin, stats in coin_stats.items()
        ],
        key=lambda x: x["volume"],
        reverse=True,
    )[:15]

    # ── Build response ───────────────────────────────────────────────────────
    return {
        "address": address,
        "summary": {
            "total_volume": round(total_volume, 2),
            "total_trades": len(fills),
            "taker_volume": round(taker_volume, 2),
            "maker_volume": round(maker_volume, 2),
            "maker_ratio": round(maker_ratio, 4),
            "taker_ratio": round(taker_ratio, 4),
            "period_start": period_start,
            "period_end": period_end,
            "trading_days": round(trading_days, 1),
        },
        "hyperliquid": {
            "total_fees_paid": round(total_hl_fees, 2),
            "contains_estimated_history": history_estimated,
            "effective_taker_rate": effective_taker_rate,
            "effective_maker_rate": effective_maker_rate,
            "tier": hl_tier["name"],
            "staking_tier": staking_tier,
            "staking_discount": staking_discount,
            "referral_discount": referral_discount,
        },
        "history_notice": (
            {
                "estimated": True,
                "message": (
                    "Part of this address's trading history could not be fetched from the Hyperliquid API. "
                    "The remaining fees were estimated from the observed maker/taker activity in the fetched history."
                ),
            }
            if history_estimated
            else None
        ),
        "comparisons": {
            "lighter": {
                "name": "Lighter",
                "color": "#4a7aff",
                "total_fees": 0.0,
                "tier": "Zero Fees",
                "taker_rate": 0.0,
                "maker_rate": 0.0,
                "savings_vs_hl": round(total_hl_fees, 2),
            },
            "binance": {
                "name": "Binance",
                "color": "#f0b90b",
                "total_fees": round(binance_fees, 2),
                "total_fees_bnb": round(binance_fees_bnb, 2),
                "tier": binance_tier["name"],
                "taker_rate": binance_tier["taker"],
                "maker_rate": binance_tier["maker"],
                "diff_vs_hl": round(total_hl_fees - binance_fees, 2),
            },
            "bybit": {
                "name": "Bybit",
                "color": "#f7a600",
                "total_fees": round(bybit_fees, 2),
                "tier": bybit_tier["name"],
                "taker_rate": bybit_tier["taker"],
                "maker_rate": bybit_tier["maker"],
                "diff_vs_hl": round(total_hl_fees - bybit_fees, 2),
            },
        },
        "top_coins": top_coins,
    }


def simulate_fees(estimated_volume: float, taker_ratio: float, window: str) -> dict:
    """Compute hypothetical fees without wallet lookup."""
    trading_days = SIMULATION_DAYS.get(window, 30)
    taker_volume = estimated_volume * taker_ratio
    maker_volume = estimated_volume - taker_volume
    maker_ratio = 1 - taker_ratio

    estimated_14d_vol = estimated_volume * (14 / trading_days) if trading_days > 14 else estimated_volume
    estimated_30d_vol = estimated_volume * (30 / trading_days) if trading_days > 30 else estimated_volume

    hl_tier = get_tier(HL_PERP_TIERS, estimated_14d_vol)
    hl_taker_rate = hl_tier["taker"]
    hl_maker_rate = hl_tier["maker"]
    total_hl_fees = (taker_volume * hl_taker_rate) + (maker_volume * hl_maker_rate)

    binance_tier = get_tier(BINANCE_TIERS, estimated_30d_vol)
    binance_fees = (taker_volume * binance_tier["taker"]) + (maker_volume * binance_tier["maker"])
    binance_fees_bnb = binance_fees * 0.90

    bybit_tier = get_tier(BYBIT_TIERS, estimated_30d_vol)
    bybit_fees = (taker_volume * bybit_tier["taker"]) + (maker_volume * bybit_tier["maker"])

    return {
        "mode": "simulate",
        "summary": {
            "total_volume": round(estimated_volume, 2),
            "total_trades": 0,
            "taker_volume": round(taker_volume, 2),
            "maker_volume": round(maker_volume, 2),
            "maker_ratio": round(maker_ratio, 4),
            "taker_ratio": round(taker_ratio, 4),
            "period_start": 0,
            "period_end": 0,
            "trading_days": trading_days,
        },
        "hyperliquid": {
            "total_fees_paid": round(total_hl_fees, 2),
            "contains_estimated_history": False,
            "effective_taker_rate": hl_taker_rate,
            "effective_maker_rate": hl_maker_rate,
            "tier": hl_tier["name"],
            "staking_tier": "None",
            "staking_discount": 0.0,
            "referral_discount": 0.0,
        },
        "history_notice": {
            "estimated": True,
            "message": "Simulation based on your estimated volume and taker-maker mix.",
        },
        "comparisons": {
            "lighter": {
                "name": "Lighter",
                "color": "#4a7aff",
                "total_fees": 0.0,
                "tier": "Zero Fees",
                "taker_rate": 0.0,
                "maker_rate": 0.0,
                "savings_vs_hl": round(total_hl_fees, 2),
            },
            "binance": {
                "name": "Binance",
                "color": "#f0b90b",
                "total_fees": round(binance_fees, 2),
                "total_fees_bnb": round(binance_fees_bnb, 2),
                "tier": binance_tier["name"],
                "taker_rate": binance_tier["taker"],
                "maker_rate": binance_tier["maker"],
                "diff_vs_hl": round(total_hl_fees - binance_fees, 2),
            },
            "bybit": {
                "name": "Bybit",
                "color": "#f7a600",
                "total_fees": round(bybit_fees, 2),
                "tier": bybit_tier["name"],
                "taker_rate": bybit_tier["taker"],
                "maker_rate": bybit_tier["maker"],
                "diff_vs_hl": round(total_hl_fees - bybit_fees, 2),
            },
        },
        "top_coins": [],
    }
