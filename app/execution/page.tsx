import type { Metadata } from "next";
import Link from "next/link";
import { WalletSearch } from "@/execution/client";
import {
  DailyChart,
  LeaderboardTable,
  MeasureToggle,
  NotComparedLines,
  Section,
  Shell,
  SplitStats,
  Stat,
} from "@/execution/components";
import { getLeaderboard, getMarketDaily, getMeta } from "@/execution/data";
import {
  DEFAULT_MEASURE,
  DIRECTIONS,
  MEASURE_LABELS,
  WINDOW_LABELS,
  coverageText,
  fmtBps,
  fmtUsd,
  isMeasure,
  isSummary,
  pick,
  resolveWindow,
  signClass,
} from "@/execution/format";
import type { Direction, Measure } from "@/execution/types";

export const metadata: Metadata = {
  title: "Execution leaderboards | tradingfees.wtf",
  description:
    "Every Hyperliquid and Lighter taker order replayed on the other venue's order book: which venue was cheaper, wallet by wallet.",
  openGraph: { images: [{ url: "/api/execution/og", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", images: ["/api/execution/og"] },
};

interface Props {
  searchParams: { measure?: string };
}

async function DirectionBlock({ direction, measure }: { direction: Direction; measure: Measure }) {
  const meta = await getMeta();
  const dm = meta.directions[direction];
  const windowKey = dm && resolveWindow(dm);
  const w = windowKey ? dm?.windows[windowKey] : undefined;
  if (!dm || !windowKey || !isSummary(w)) return null;
  const s = w[measure];
  const [page, daily] = await Promise.all([
    getLeaderboard(direction, windowKey, measure, "all", 1),
    getMarketDaily(direction),
  ]);
  const info = DIRECTIONS[direction];
  const top = (page?.rows ?? []).filter((r) => (pick(r, measure) ?? 0) > 0).slice(0, 10);
  const q = measure === DEFAULT_MEASURE ? "" : `&measure=${measure}`;
  return (
    <>
      <Section label={`${info.title} · ${WINDOW_LABELS[windowKey].toLowerCase()}`}>
        <p className="ex-lead">{info.question}.</p>
        <p className="ex-coverage">{coverageText(w)}</p>
        <div className="ex-stats">
          <Stat
            label="net, all wallets"
            value={fmtUsd(s.total_usd, true)}
            sub={`${fmtBps(s.total_bps)} on ${fmtUsd(w.replayed_notional)} compared`}
            tone={signClass(s.total_usd)}
          />
          <SplitStats s={s} wallets={w.wallets} />
          <Stat label="median wallet" value={fmtUsd(s.median_usd, true)} tone={signClass(s.median_usd)} />
        </div>
        <div className="ex-split">
          <span>
            fee difference <b className={signClass(w.fee_saved_usd)}>{fmtUsd(w.fee_saved_usd, true)}</b>
          </span>
          <span>
            price difference ({MEASURE_LABELS[measure]}) <b className={signClass(s.px_usd)}>{fmtUsd(s.px_usd, true)}</b>
          </span>
        </div>
        <NotComparedLines nc={w.not_compared} target={info.target} maxBps={meta.max_replay_slippage_bps} />
      </Section>
      <Section
        label={`cheapest on Lighter · ${WINDOW_LABELS[windowKey].toLowerCase()}`}
        right={
          <Link className="ex-more" href={`/execution/${direction}?window=${windowKey}${q}`}>
            full leaderboard →
          </Link>
        }
      >
        <LeaderboardTable rows={top} publicTags={meta.public_tags} measure={measure} />
      </Section>
      <Section label={`all wallets combined, per day · ${w.first_day} → ${w.last_day}`}>
        <DailyChart
          days={daily
            .filter((d) => d.day >= w.first_day && d.day <= w.last_day)
            .map((d) => ({ day: d.day, total: pick(d, measure) ?? 0 }))}
        />
      </Section>
    </>
  );
}

export default async function ExecutionHome({ searchParams }: Props) {
  const measure: Measure = isMeasure(searchParams.measure) ? searchParams.measure : DEFAULT_MEASURE;
  const meta = await getMeta();
  const directions = (Object.keys(DIRECTIONS) as Direction[]).filter((d) => meta.directions[d]);
  return (
    <Shell subtitle="real orders, replayed on the other venue's order book — fees and execution price included">
      <section className="input-section">
        <WalletSearch />
      </section>
      <MeasureToggle
        measure={measure}
        href={(m) => (m === DEFAULT_MEASURE ? "/execution" : `/execution?measure=${m}`)}
      />
      {directions.map((d) => (
        <DirectionBlock key={d} direction={d} measure={measure} />
      ))}
    </Shell>
  );
}
