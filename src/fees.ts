/** Fee tier definitions and comparison engine. */

export interface Tier {
  name: string;
  min_volume: number;
  taker: number;
  maker: number;
}

export interface StakingTier {
  name: string;
  min_hype: number;
  discount: number;
}

const WINDOW_TO_PORTFOLIO_KEY: Record<string, string> = {
  "7d": "week",
  "30d": "month",
  all: "allTime",
};

const WINDOW_TO_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1yr": 365,
};

const SIMULATION_DAYS: Record<string, number> = {
  all: 30,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1yr": 365,
};

// Hyperliquid perp tiers (14-day weighted volume)
const HL_PERP_TIERS: Tier[] = [
  { name: "Tier 0 (<$5M)", min_volume: 0, taker: 0.00045, maker: 0.00015 },
  { name: "Tier 1 (>$5M)", min_volume: 5_000_000, taker: 0.0004, maker: 0.00012 },
  { name: "Tier 2 (>$25M)", min_volume: 25_000_000, taker: 0.00035, maker: 0.00008 },
  { name: "Tier 3 (>$100M)", min_volume: 100_000_000, taker: 0.0003, maker: 0.00004 },
  { name: "Tier 4 (>$500M)", min_volume: 500_000_000, taker: 0.00028, maker: 0.0 },
  { name: "Tier 5 (>$2B)", min_volume: 2_000_000_000, taker: 0.00025, maker: 0.0 },
  { name: "Tier 6 (>$7B)", min_volume: 7_000_000_000, taker: 0.00024, maker: 0.0 },
];

const HL_STAKING_TIERS: StakingTier[] = [
  { name: "None", min_hype: 0, discount: 0.0 },
  { name: "Wood", min_hype: 10, discount: 0.05 },
  { name: "Bronze", min_hype: 100, discount: 0.1 },
  { name: "Silver", min_hype: 1_000, discount: 0.15 },
  { name: "Gold", min_hype: 10_000, discount: 0.2 },
  { name: "Platinum", min_hype: 100_000, discount: 0.3 },
  { name: "Diamond", min_hype: 500_000, discount: 0.4 },
];

const STANDARD_HIP3_TIERS: Tier[] = HL_PERP_TIERS.map((t) => ({
  name: t.name,
  min_volume: t.min_volume,
  taker: t.taker * 2,
  maker: t.maker * 2,
}));

const GROWTH_HIP3_TIERS: Tier[] = HL_PERP_TIERS.map((t) => ({
  name: t.name,
  min_volume: t.min_volume,
  taker: t.taker * 0.2,
  maker: t.maker * 0.2,
}));

const STANDARD_ALIGNED_HIP3_TIERS: Tier[] = HL_PERP_TIERS.map((t) => ({
  name: t.name,
  min_volume: t.min_volume,
  taker: t.taker * 1.8,
  maker: t.maker * 1.8,
}));

const GROWTH_ALIGNED_HIP3_TIERS: Tier[] = HL_PERP_TIERS.map((t) => ({
  name: t.name,
  min_volume: t.min_volume,
  taker: t.taker * 0.18,
  maker: t.maker * 0.18,
}));

const HYENA_TIERS: Tier[] = HL_PERP_TIERS.map((t) => ({
  name: t.name,
  min_volume: t.min_volume,
  taker: t.taker * 1.11,
  maker: t.maker * 1.11,
}));

// Binance Futures USDT-M (30-day volume)
const BINANCE_TIERS: Tier[] = [
  { name: "VIP 0", min_volume: 0, maker: 0.0002, taker: 0.0005 },
  { name: "VIP 1 (>$15M)", min_volume: 15_000_000, maker: 0.00016, taker: 0.0004 },
  { name: "VIP 2 (>$50M)", min_volume: 50_000_000, maker: 0.00014, taker: 0.00035 },
  { name: "VIP 3 (>$100M)", min_volume: 100_000_000, maker: 0.00012, taker: 0.00032 },
  { name: "VIP 4 (>$250M)", min_volume: 250_000_000, maker: 0.0001, taker: 0.0003 },
  { name: "VIP 5 (>$500M)", min_volume: 500_000_000, maker: 0.00008, taker: 0.00027 },
  { name: "VIP 6 (>$1B)", min_volume: 1_000_000_000, maker: 0.00006, taker: 0.00025 },
  { name: "VIP 7 (>$2.5B)", min_volume: 2_500_000_000, maker: 0.00004, taker: 0.00022 },
  { name: "VIP 8 (>$5B)", min_volume: 5_000_000_000, maker: 0.00002, taker: 0.0002 },
  { name: "VIP 9 (>$10B)", min_volume: 10_000_000_000, maker: 0.0, taker: 0.00017 },
];

// Bybit Linear Perpetuals (30-day volume)
const BYBIT_TIERS: Tier[] = [
  { name: "VIP 0", min_volume: 0, maker: 0.0002, taker: 0.00055 },
  { name: "VIP 1 (>$10M)", min_volume: 10_000_000, maker: 0.00018, taker: 0.0004 },
  { name: "VIP 2 (>$25M)", min_volume: 25_000_000, maker: 0.00016, taker: 0.000375 },
  { name: "VIP 3 (>$50M)", min_volume: 50_000_000, maker: 0.00014, taker: 0.00035 },
  { name: "VIP 4 (>$100M)", min_volume: 100_000_000, maker: 0.00012, taker: 0.00032 },
  { name: "VIP 5 (>$250M)", min_volume: 250_000_000, maker: 0.0001, taker: 0.00032 },
  { name: "Supreme VIP (>$500M)", min_volume: 500_000_000, maker: 0.0, taker: 0.0003 },
];

const DEPLOYER_FEE_TIERS: Record<string, Tier[]> = {
  flx: STANDARD_HIP3_TIERS,
  xyz: STANDARD_HIP3_TIERS,
  km: GROWTH_ALIGNED_HIP3_TIERS,
  cash: GROWTH_HIP3_TIERS,
  vntl: STANDARD_ALIGNED_HIP3_TIERS,
  hyna: HYENA_TIERS,
};

function getTier(tiers: Tier[], volume: number): Tier {
  let matched = tiers[0]!;
  for (const tier of tiers) {
    if (volume >= tier.min_volume) {
      matched = tier;
    }
  }
  return matched;
}

function extractPortfolioVolume(
  portfolioData: unknown[],
  window: string
): number | null {
  const key = WINDOW_TO_PORTFOLIO_KEY[window];
  if (!key) return null;

  for (const bucket of portfolioData ?? []) {
    if (!Array.isArray(bucket) || bucket.length !== 2) continue;
    if (bucket[0] !== key || typeof bucket[1] !== "object" || bucket[1] === null) continue;
    const vlm = (bucket[1] as Record<string, unknown>).vlm;
    const val = Number(vlm);
    if (!isNaN(val)) return val;
    return null;
  }
  return null;
}

function buildSpotAssetLabels(spotMeta: Record<string, unknown> | null): Record<string, string> {
  const labels: Record<string, string> = {};
  if (!spotMeta || typeof spotMeta !== "object") return labels;

  const tokens = spotMeta.tokens;
  const universe = spotMeta.universe;
  if (!Array.isArray(tokens) || !Array.isArray(universe)) return labels;

  const tokenNames: (string | null)[] = [];
  for (const token of tokens) {
    if (typeof token === "object" && token !== null) {
      const name = (token as Record<string, unknown>).name;
      tokenNames.push(typeof name === "string" && name ? name : null);
    } else {
      tokenNames.push(null);
    }
  }

  for (let idx = 0; idx < universe.length; idx++) {
    const market = universe[idx];
    if (typeof market !== "object" || market === null) continue;
    const m = market as Record<string, unknown>;

    let label = m.name as string | undefined;
    const tokenIndexes = m.tokens;
    if (Array.isArray(tokenIndexes) && tokenIndexes.length > 0) {
      const baseIdx = tokenIndexes[0] as number;
      if (typeof baseIdx === "number" && baseIdx >= 0 && baseIdx < tokenNames.length) {
        const baseName = tokenNames[baseIdx];
        if (baseName) label = baseName;
      }
    }

    if (typeof label === "string" && label) {
      labels[`@${idx}`] = label;
    }
  }

  return labels;
}

function coinPrefix(rawCoin: string): string | null {
  if (!rawCoin || rawCoin.startsWith("@")) return null;
  const match = rawCoin.toLowerCase().match(/^([a-z]+)/);
  if (!match?.[1]) return null;
  return match[1] in DEPLOYER_FEE_TIERS ? match[1] : null;
}

function expectedHlRatesForCoin(
  rawCoin: string,
  estimated14dVol: number,
  stakingDiscount: number,
  referralDiscount: number,
  defaultTakerRate: number,
  defaultMakerRate: number
): [number, number] {
  const prefix = coinPrefix(rawCoin);
  if (!prefix) return [defaultTakerRate, defaultMakerRate];

  const tier = getTier(DEPLOYER_FEE_TIERS[prefix]!, estimated14dVol);
  const discountMultiplier = Math.max(0.0, 1.0 - stakingDiscount - referralDiscount);
  return [tier.taker * discountMultiplier, tier.maker * discountMultiplier];
}

// Fill type from Hyperliquid API
export interface Fill {
  px: string;
  sz: string;
  fee: string;
  feeToken?: string;
  crossed?: boolean;
  coin: string;
  time: string | number;
  tid?: string;
}

export interface FillsData {
  fills: Fill[];
  truncated: boolean;
}

export interface ExchangeComparison {
  name: string;
  color: string;
  total_fees: number;
  total_fees_bnb?: number;
  tier: string;
  taker_rate: number;
  maker_rate: number;
  savings_vs_hl?: number;
  diff_vs_hl?: number;
}

export interface CoinStat {
  coin: string;
  volume: number;
  fees: number;
  trades: number;
}

export interface AnalyzeResult {
  address: string;
  error?: string;
  mode?: string;
  window?: string;
  summary: {
    total_volume: number;
    total_trades: number;
    taker_volume: number;
    maker_volume: number;
    maker_ratio: number;
    taker_ratio: number;
    period_start: number;
    period_end: number;
    trading_days: number;
  } | null;
  hyperliquid: {
    total_fees_paid: number;
    contains_estimated_history: boolean;
    effective_taker_rate: number;
    effective_maker_rate: number;
    tier: string;
    staking_tier: string;
    staking_discount: number;
    referral_discount: number;
  } | null;
  history_notice: {
    estimated: boolean;
    message: string;
  } | null;
  comparisons: {
    lighter: ExchangeComparison;
    binance: ExchangeComparison;
    bybit: ExchangeComparison;
  } | null;
  top_coins: CoinStat[];
}

const STABLE_FEE_TOKENS = new Set([
  "USDC", "USDT", "USDT0", "USDH", "USDE", "USDHL", "USDXL", "DAI",
]);

const WINDOW_MS: Record<string, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  "1yr": 365 * 24 * 60 * 60 * 1000,
};

export { WINDOW_MS };

/**
 * Produce an instant estimated AnalyzeResult using only userFees + portfolio
 * (no fills required). This lets us show numbers in <200ms while fills load.
 */
export function estimateFromUserFees(
  userFeesData: Record<string, unknown>,
  portfolioData: unknown[],
  address: string,
  window: string
): AnalyzeResult | null {
  const hlTakerRate = Number(userFeesData.userCrossRate || "0.00045");
  const hlMakerRate = Number(userFeesData.userAddRate || "0.00015");

  // Derive taker/maker ratio from dailyUserVlm (covers ~14 days)
  const dailyUserVlm = userFeesData.dailyUserVlm as
    | { userCross: string; userAdd: string }[]
    | undefined;
  let takerRatio = 0.7; // default assumption
  if (dailyUserVlm && dailyUserVlm.length > 0) {
    let crossSum = 0;
    let addSum = 0;
    for (const d of dailyUserVlm) {
      crossSum += Number(d.userCross || 0);
      addSum += Number(d.userAdd || 0);
    }
    const total = crossSum + addSum;
    if (total > 0) takerRatio = crossSum / total;
  }

  // Get total volume from portfolio for the selected window
  const totalVolume = extractPortfolioVolume(portfolioData, window);
  if (totalVolume === null || totalVolume <= 0) return null;

  const takerVolume = totalVolume * takerRatio;
  const makerVolume = totalVolume * (1 - takerRatio);

  // Staking info
  const stakingInfo = userFeesData.activeStakingDiscount as Record<string, unknown> | null;
  let stakingDiscount = 0;
  let stakingTier = "None";
  if (stakingInfo?.discount) {
    stakingDiscount = Number(stakingInfo.discount);
    for (const st of [...HL_STAKING_TIERS].reverse()) {
      if (Math.abs(stakingDiscount - st.discount) < 0.001) {
        stakingTier = st.name;
        break;
      }
    }
  }
  const referralDiscount = Number(userFeesData.activeReferralDiscount || "0");

  const totalHlFees = takerVolume * hlTakerRate + makerVolume * hlMakerRate;

  // Volume tiers
  const requestedDays = WINDOW_TO_DAYS[window] ?? 365;
  const estimated14dVol = requestedDays > 14 ? totalVolume * (14 / requestedDays) : totalVolume;
  const estimated30dVol = requestedDays > 30 ? totalVolume * (30 / requestedDays) : totalVolume;
  const hlTier = getTier(HL_PERP_TIERS, estimated14dVol);

  const binanceTier = getTier(BINANCE_TIERS, estimated30dVol);
  const binanceFees = takerVolume * binanceTier.taker + makerVolume * binanceTier.maker;
  const binanceFeesBnb = binanceFees * 0.9;

  const bybitTier = getTier(BYBIT_TIERS, estimated30dVol);
  const bybitFees = takerVolume * bybitTier.taker + makerVolume * bybitTier.maker;

  return {
    address,
    mode: "estimate",
    window,
    summary: {
      total_volume: Math.round(totalVolume * 100) / 100,
      total_trades: 0,
      taker_volume: Math.round(takerVolume * 100) / 100,
      maker_volume: Math.round(makerVolume * 100) / 100,
      maker_ratio: Math.round((1 - takerRatio) * 10000) / 10000,
      taker_ratio: Math.round(takerRatio * 10000) / 10000,
      period_start: 0,
      period_end: Date.now(),
      trading_days: requestedDays,
    },
    hyperliquid: {
      total_fees_paid: Math.round(totalHlFees * 100) / 100,
      contains_estimated_history: true,
      effective_taker_rate: hlTakerRate,
      effective_maker_rate: hlMakerRate,
      tier: hlTier.name,
      staking_tier: stakingTier,
      staking_discount: stakingDiscount,
      referral_discount: referralDiscount,
    },
    history_notice: {
      estimated: true,
      message: "Estimated from aggregated volume data. Exact numbers loading...",
    },
    comparisons: {
      lighter: {
        name: "Lighter",
        color: "#4a7aff",
        total_fees: 0,
        tier: "Zero Fees",
        taker_rate: 0,
        maker_rate: 0,
        savings_vs_hl: Math.round(totalHlFees * 100) / 100,
      },
      binance: {
        name: "Binance",
        color: "#f0b90b",
        total_fees: Math.round(binanceFees * 100) / 100,
        total_fees_bnb: Math.round(binanceFeesBnb * 100) / 100,
        tier: binanceTier.name,
        taker_rate: binanceTier.taker,
        maker_rate: binanceTier.maker,
        diff_vs_hl: Math.round((totalHlFees - binanceFees) * 100) / 100,
      },
      bybit: {
        name: "Bybit",
        color: "#f7a600",
        total_fees: Math.round(bybitFees * 100) / 100,
        tier: bybitTier.name,
        taker_rate: bybitTier.taker,
        maker_rate: bybitTier.maker,
        diff_vs_hl: Math.round((totalHlFees - bybitFees) * 100) / 100,
      },
    },
    top_coins: [],
  };
}

export function filterFillsByWindow(fills: Fill[], window: string): Fill[] {
  if (window === "all" || fills.length === 0) return fills;
  const ms = WINDOW_MS[window];
  if (!ms) return fills;
  const latestTime = Math.max(...fills.map((f) => Number(f.time)));
  const cutoff = latestTime - ms;
  return fills.filter((f) => Number(f.time) >= cutoff);
}

export function analyzeFees(
  userFeesData: Record<string, unknown>,
  portfolioData: unknown[],
  fillsData: FillsData,
  spotMeta: Record<string, unknown> | null,
  address: string,
  window: string
): AnalyzeResult {
  const fills = fillsData.fills;
  const spotAssetLabels = buildSpotAssetLabels(spotMeta);

  if (fills.length === 0) {
    return {
      address,
      error: "No trading history found for this address.",
      summary: null,
      hyperliquid: null,
      comparisons: null,
      top_coins: [],
      history_notice: null,
    };
  }

  // Parse fills
  let totalVolume = 0;
  let takerVolume = 0;
  let makerVolume = 0;
  let takerFeesPaid = 0;
  let makerFeesPaid = 0;
  let totalHlFees = 0;
  const coinStats: Record<string, { volume: number; fees: number; trades: number }> = {};

  for (const fill of fills) {
    const px = Number(fill.px || 0);
    const sz = Number(fill.sz || 0);
    const notional = px * sz;
    const rawFee = Number(fill.fee || 0);
    const feeToken = fill.feeToken || "USDC";
    const isTaker = fill.crossed !== false;
    const rawCoin = fill.coin || "UNKNOWN";
    const coin = spotAssetLabels[rawCoin] || rawCoin;

    // Convert fee to USD
    const feeUsd = STABLE_FEE_TOKENS.has(feeToken) ? rawFee : rawFee * px;

    totalVolume += notional;
    totalHlFees += feeUsd;

    if (isTaker) {
      takerVolume += notional;
      takerFeesPaid += feeUsd;
    } else {
      makerVolume += notional;
      makerFeesPaid += feeUsd;
    }

    if (!coinStats[coin]) {
      coinStats[coin] = { volume: 0, fees: 0, trades: 0 };
    }
    coinStats[coin].volume += notional;
    coinStats[coin].fees += feeUsd;
    coinStats[coin].trades += 1;
  }

  // Time period
  const times = fills.map((f) => Number(f.time));
  const periodStart = Math.min(...times);
  const periodEnd = Math.max(...times);
  let tradingDays = Math.max((periodEnd - periodStart) / (86400 * 1000), 1);

  let makerRatio = totalVolume > 0 ? makerVolume / totalVolume : 0;
  let takerRatio = totalVolume > 0 ? takerVolume / totalVolume : 0;

  // HL fee info
  const hlTakerRate = Number(userFeesData.userCrossRate || "0.00045");
  const hlMakerRate = Number(userFeesData.userAddRate || "0.00015");

  const stakingInfo = userFeesData.activeStakingDiscount as Record<string, unknown> | null;
  let stakingDiscount = 0;
  let stakingTier = "None";
  if (stakingInfo?.discount) {
    stakingDiscount = Number(stakingInfo.discount);
    for (const st of [...HL_STAKING_TIERS].reverse()) {
      if (Math.abs(stakingDiscount - st.discount) < 0.001) {
        stakingTier = st.name;
        break;
      }
    }
  }

  const referralDiscount = Number(userFeesData.activeReferralDiscount || "0");

  // Partial-history estimation
  const portfolioVolume = extractPortfolioVolume(portfolioData, window);
  let estimatedMissingVolume = 0;
  let estimatedMissingFees = 0;
  let historyEstimated = false;

  const observedTakerRate = takerVolume > 0 ? takerFeesPaid / takerVolume : null;
  const observedMakerRate = makerVolume > 0 ? makerFeesPaid / makerVolume : null;

  if (fillsData.truncated) {
    let missingRequestedHistory = window === "all";
    const requestedDays = WINDOW_TO_DAYS[window];
    if (requestedDays !== undefined) {
      const latestTime = periodEnd;
      const cutoff = latestTime - requestedDays * 86400 * 1000;
      missingRequestedHistory = periodStart > cutoff;
      if (fills.length === fillsData.fills.length) {
        missingRequestedHistory = true;
      }
    }

    if (missingRequestedHistory) {
      const takerWeight = takerRatio > 0 ? takerRatio : 1.0;
      const makerWeight = makerRatio > 0 ? makerRatio : 0.0;

      if (portfolioVolume !== null) {
        estimatedMissingVolume = Math.max(0, portfolioVolume - totalVolume);
      } else if (requestedDays !== undefined && tradingDays < requestedDays && totalVolume > 0) {
        estimatedMissingVolume = Math.max(0, (totalVolume / tradingDays) * (requestedDays - tradingDays));
      }

      if (estimatedMissingVolume > 0) {
        const estimated14dVol = tradingDays > 14 ? totalVolume * (14 / tradingDays) : totalVolume;
        let expectedTakerSum = 0;
        let expectedMakerSum = 0;
        for (const fill of fills) {
          const px = Number(fill.px || 0);
          const sz = Number(fill.sz || 0);
          const notional = px * sz;
          const [expTakerRate, expMakerRate] = expectedHlRatesForCoin(
            fill.coin || "UNKNOWN",
            estimated14dVol,
            stakingDiscount,
            referralDiscount,
            hlTakerRate,
            hlMakerRate
          );
          if (fill.crossed !== false) {
            expectedTakerSum += notional * expTakerRate;
          } else {
            expectedMakerSum += notional * expMakerRate;
          }
        }

        const fallbackTakerRate =
          observedTakerRate !== null
            ? observedTakerRate
            : takerVolume > 0
              ? expectedTakerSum / takerVolume
              : hlTakerRate;
        const fallbackMakerRate =
          observedMakerRate !== null
            ? observedMakerRate
            : makerVolume > 0
              ? expectedMakerSum / makerVolume
              : hlMakerRate;

        estimatedMissingFees =
          estimatedMissingVolume * takerWeight * fallbackTakerRate +
          estimatedMissingVolume * makerWeight * fallbackMakerRate;
        totalVolume += estimatedMissingVolume;
        takerVolume += estimatedMissingVolume * takerWeight;
        makerVolume += estimatedMissingVolume * makerWeight;
        totalHlFees += estimatedMissingFees;
        historyEstimated = true;
      }
    }
  }

  // Portfolio floor: never show less volume/fees than what portfolio data reports.
  // This handles the case where fills are incomplete (e.g. 500M fetched out of 30B
  // actual volume) — we use portfolio volume as the floor and scale fees up.
  if (portfolioVolume !== null && portfolioVolume > totalVolume && totalVolume > 0) {
    const scaleFactor = portfolioVolume / totalVolume;
    totalVolume = portfolioVolume;
    takerVolume *= scaleFactor;
    makerVolume *= scaleFactor;
    totalHlFees *= scaleFactor;
    historyEstimated = true;
  }

  makerRatio = totalVolume > 0 ? makerVolume / totalVolume : 0;
  takerRatio = totalVolume > 0 ? takerVolume / totalVolume : 0;

  // Determine HL volume tier
  const estimated14dVol = tradingDays > 14 ? totalVolume * (14 / tradingDays) : totalVolume;
  const hlTier = getTier(HL_PERP_TIERS, estimated14dVol);

  const effectiveTakerRate = observedTakerRate !== null ? observedTakerRate : hlTakerRate;
  const effectiveMakerRate = observedMakerRate !== null ? observedMakerRate : hlMakerRate;

  // Hypothetical fees on other exchanges
  const estimated30dVol = tradingDays > 30 ? totalVolume * (30 / tradingDays) : totalVolume;

  // Lighter: always $0
  const lighterFees = 0;

  // Binance
  const binanceTier = getTier(BINANCE_TIERS, estimated30dVol);
  const binanceFees = takerVolume * binanceTier.taker + makerVolume * binanceTier.maker;
  const binanceFeesBnb = binanceFees * 0.9;

  // Bybit
  const bybitTier = getTier(BYBIT_TIERS, estimated30dVol);
  const bybitFees = takerVolume * bybitTier.taker + makerVolume * bybitTier.maker;

  // Top coins by volume
  const topCoins = Object.entries(coinStats)
    .map(([coin, stats]) => ({
      coin,
      volume: stats.volume,
      fees: stats.fees,
      trades: stats.trades,
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 15);

  return {
    address,
    summary: {
      total_volume: Math.round(totalVolume * 100) / 100,
      total_trades: fills.length,
      taker_volume: Math.round(takerVolume * 100) / 100,
      maker_volume: Math.round(makerVolume * 100) / 100,
      maker_ratio: Math.round(makerRatio * 10000) / 10000,
      taker_ratio: Math.round(takerRatio * 10000) / 10000,
      period_start: periodStart,
      period_end: periodEnd,
      trading_days: Math.round(tradingDays * 10) / 10,
    },
    hyperliquid: {
      total_fees_paid: Math.round(totalHlFees * 100) / 100,
      contains_estimated_history: historyEstimated,
      effective_taker_rate: effectiveTakerRate,
      effective_maker_rate: effectiveMakerRate,
      tier: hlTier.name,
      staking_tier: stakingTier,
      staking_discount: stakingDiscount,
      referral_discount: referralDiscount,
    },
    history_notice: historyEstimated
      ? {
          estimated: true,
          message:
            "Complete trade history exceeds what the Hyperliquid API can return. " +
            "Volume and fees are based on portfolio data; trade count reflects fetched trades only.",
        }
      : null,
    comparisons: {
      lighter: {
        name: "Lighter",
        color: "#4a7aff",
        total_fees: 0,
        tier: "Zero Fees",
        taker_rate: 0,
        maker_rate: 0,
        savings_vs_hl: Math.round(totalHlFees * 100) / 100,
      },
      binance: {
        name: "Binance",
        color: "#f0b90b",
        total_fees: Math.round(binanceFees * 100) / 100,
        total_fees_bnb: Math.round(binanceFeesBnb * 100) / 100,
        tier: binanceTier.name,
        taker_rate: binanceTier.taker,
        maker_rate: binanceTier.maker,
        diff_vs_hl: Math.round((totalHlFees - binanceFees) * 100) / 100,
      },
      bybit: {
        name: "Bybit",
        color: "#f7a600",
        total_fees: Math.round(bybitFees * 100) / 100,
        tier: bybitTier.name,
        taker_rate: bybitTier.taker,
        maker_rate: bybitTier.maker,
        diff_vs_hl: Math.round((totalHlFees - bybitFees) * 100) / 100,
      },
    },
    top_coins: topCoins,
  };
}

export function simulateFees(
  estimatedVolume: number,
  takerRatio: number,
  window: string
): AnalyzeResult {
  const tradingDays = SIMULATION_DAYS[window] ?? 30;
  const takerVolume = estimatedVolume * takerRatio;
  const makerVolume = estimatedVolume - takerVolume;
  const makerRatio = 1 - takerRatio;

  const estimated14dVol = tradingDays > 14 ? estimatedVolume * (14 / tradingDays) : estimatedVolume;
  const estimated30dVol = tradingDays > 30 ? estimatedVolume * (30 / tradingDays) : estimatedVolume;

  const hlTier = getTier(HL_PERP_TIERS, estimated14dVol);
  const hlTakerRate = hlTier.taker;
  const hlMakerRate = hlTier.maker;
  const totalHlFees = takerVolume * hlTakerRate + makerVolume * hlMakerRate;

  const binanceTier = getTier(BINANCE_TIERS, estimated30dVol);
  const binanceFees = takerVolume * binanceTier.taker + makerVolume * binanceTier.maker;
  const binanceFeesBnb = binanceFees * 0.9;

  const bybitTier = getTier(BYBIT_TIERS, estimated30dVol);
  const bybitFees = takerVolume * bybitTier.taker + makerVolume * bybitTier.maker;

  return {
    address: "",
    mode: "simulate",
    summary: {
      total_volume: Math.round(estimatedVolume * 100) / 100,
      total_trades: 0,
      taker_volume: Math.round(takerVolume * 100) / 100,
      maker_volume: Math.round(makerVolume * 100) / 100,
      maker_ratio: Math.round(makerRatio * 10000) / 10000,
      taker_ratio: Math.round(takerRatio * 10000) / 10000,
      period_start: 0,
      period_end: 0,
      trading_days: tradingDays,
    },
    hyperliquid: {
      total_fees_paid: Math.round(totalHlFees * 100) / 100,
      contains_estimated_history: false,
      effective_taker_rate: hlTakerRate,
      effective_maker_rate: hlMakerRate,
      tier: hlTier.name,
      staking_tier: "None",
      staking_discount: 0,
      referral_discount: 0,
    },
    history_notice: {
      estimated: true,
      message: "Simulation based on your estimated volume and taker-maker mix.",
    },
    comparisons: {
      lighter: {
        name: "Lighter",
        color: "#4a7aff",
        total_fees: 0,
        tier: "Zero Fees",
        taker_rate: 0,
        maker_rate: 0,
        savings_vs_hl: Math.round(totalHlFees * 100) / 100,
      },
      binance: {
        name: "Binance",
        color: "#f0b90b",
        total_fees: Math.round(binanceFees * 100) / 100,
        total_fees_bnb: Math.round(binanceFeesBnb * 100) / 100,
        tier: binanceTier.name,
        taker_rate: binanceTier.taker,
        maker_rate: binanceTier.maker,
        diff_vs_hl: Math.round((totalHlFees - binanceFees) * 100) / 100,
      },
      bybit: {
        name: "Bybit",
        color: "#f7a600",
        total_fees: Math.round(bybitFees * 100) / 100,
        tier: bybitTier.name,
        taker_rate: bybitTier.taker,
        maker_rate: bybitTier.maker,
        diff_vs_hl: Math.round((totalHlFees - bybitFees) * 100) / 100,
      },
    },
    top_coins: [],
  };
}
