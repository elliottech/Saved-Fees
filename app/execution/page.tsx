import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { WalletSearch } from "@/execution/client";
import { DailyChart, LeaderboardTable, Section, Shell, Stat } from "@/execution/components";
import { getLeaderboard, getMarketDaily, getMeta } from "@/execution/data";
import { DIRECTIONS, fmtBps, fmtInt, fmtUsd, signClass } from "@/execution/format";
import type { Direction } from "@/execution/types";

export const metadata: Metadata = {
  title: "Execution leaderboards | tradingfees.wtf",
  description:
    "Every Hyperliquid and Lighter taker order replayed on the other venue's order book: who would have saved, and how much.",
  openGraph: { images: [{ url: "/api/execution/og", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", images: ["/api/execution/og"] },
};

const HOME_WINDOW = "30d";

async function DirectionBlock({ direction }: { direction: Direction }) {
  const meta = await getMeta();
  const dm = meta.directions[direction];
  const w = dm?.windows[HOME_WINDOW] ?? dm?.windows.all;
  if (!dm || !w) return null;
  const windowKey = dm.windows[HOME_WINDOW] ? HOME_WINDOW : "all";
  const [page, daily] = await Promise.all([
    getLeaderboard(direction, windowKey, "all", 1),
    getMarketDaily(direction),
  ]);
  const info = DIRECTIONS[direction];
  const top = (page?.rows ?? []).filter((r) => r.total_usd > 0).slice(0, 10);
  return (
    <>
      <Section
        label={info.title}
        right={<span className="ex-muted ex-small">{`${w.start} → ${w.end}`}</span>}
      >
        <p className="ex-lead">{info.question}.</p>
        <div className="ex-stats">
          <Stat
            label="saved by savers"
            value={fmtUsd(w.positive_total_usd)}
            sub={`${fmtInt(w.positive_wallets)} of ${fmtInt(w.wallets)} wallets`}
            tone="ex-pos"
          />
          <Stat label="all wallets, net" value={fmtUsd(w.total_usd, true)} sub={fmtBps(w.total_bps)} tone={signClass(w.total_usd)} />
          <Stat label="median wallet" value={fmtUsd(w.median_usd, true)} tone={signClass(w.median_usd)} />
          <Stat label="volume replayed" value={fmtUsd(w.replayed_notional)} />
        </div>
        <div className="ex-split">
          <span>
            fee difference <b className={signClass(w.fee_saved_usd)}>{fmtUsd(w.fee_saved_usd, true)}</b>
          </span>
          <span>
            price difference <b className={signClass(w.px_usd)}>{fmtUsd(w.px_usd, true)}</b>
          </span>
        </div>
      </Section>
      <Section
        label={`top savers · ${w.start} → ${w.end}`}
        right={
          <Link className="ex-more" href={`/execution/${direction}?window=${windowKey}`}>
            full leaderboard →
          </Link>
        }
      >
        <LeaderboardTable rows={top} publicTags={meta.public_tags} />
      </Section>
      <Section label="all wallets combined, per day">
        <DailyChart days={daily} />
      </Section>
    </>
  );
}

export default async function ExecutionHome() {
  headers(); // render per request: the dataset isn't reachable at build time
  const meta = await getMeta();
  const directions = (Object.keys(DIRECTIONS) as Direction[]).filter((d) => meta.directions[d]);
  return (
    <Shell subtitle="real orders, replayed on the other venue's order book — fees and execution price included">
      <section className="input-section">
        <WalletSearch />
      </section>
      {directions.map((d) => (
        <DirectionBlock key={d} direction={d} />
      ))}
    </Shell>
  );
}
