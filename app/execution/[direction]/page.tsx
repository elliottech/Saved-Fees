import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NavSelect, WalletSearch } from "@/execution/client";
import { LeaderboardTable, Pager, Section, Shell, Stat } from "@/execution/components";
import { getCoins, getLeaderboard, getMeta } from "@/execution/data";
import { DIRECTIONS, WINDOW_LABELS, fmtBps, fmtInt, fmtUsd, isDirection, isWindow, signClass } from "@/execution/format";
import type { Direction, WindowKey } from "@/execution/types";

export const revalidate = 300;

const VIEW_SIZE = 100;

interface Props {
  params: { direction: string };
  searchParams: { window?: string; coin?: string; page?: string; show?: string };
}

export function generateMetadata({ params }: Props): Metadata {
  if (!isDirection(params.direction)) return {};
  const info = DIRECTIONS[params.direction];
  return {
    title: `${info.title} — leaderboard | tradingfees.wtf`,
    description: `${info.question}. Every wallet ranked.`,
  };
}

export default async function Leaderboard({ params, searchParams }: Props) {
  if (!isDirection(params.direction)) notFound();
  const direction: Direction = params.direction;
  const meta = await getMeta();
  const dm = meta.directions[direction];
  if (!dm) notFound();

  const window: WindowKey = isWindow(searchParams.window) && dm.windows[searchParams.window] ? searchParams.window : "30d";
  const showAll = searchParams.show === "all";
  const coins = (await getCoins(direction)).filter((c) => c.window === window);
  const coin = coins.find((c) => c.slug === searchParams.coin) ?? null;
  const scope = coin?.slug ?? "all";

  const w = dm.windows[window];
  if (!w) notFound();
  const wallets = coin ? coin.wallets : w.wallets;
  const positive = coin ? coin.positive_wallets : w.positive_wallets;
  // Shown 100 at a time; the data files hold meta.page_size (1000) ranks each.
  const pages = Math.max(1, Math.ceil((showAll ? wallets : positive) / VIEW_SIZE));
  const page = Math.min(pages, Math.max(1, Number(searchParams.page) || 1));
  const firstRank = (page - 1) * VIEW_SIZE + 1;
  const lb = await getLeaderboard(direction, window, scope, Math.ceil(firstRank / meta.page_size));
  const rows = (lb?.rows ?? []).filter(
    (r) => r.rank >= firstRank && r.rank < firstRank + VIEW_SIZE && (showAll || r.rank <= positive),
  );

  const href = (p: Partial<{ window: string; coin: string | null; page: number; show: boolean }>) => {
    const q = new URLSearchParams();
    const win = p.window ?? window;
    const c = p.coin === undefined ? coin?.slug : p.coin;
    const s = p.show ?? showAll;
    if (win !== "30d") q.set("window", win);
    if (c) q.set("coin", c);
    if (p.page && p.page > 1) q.set("page", String(p.page));
    if (s) q.set("show", "all");
    const qs = q.toString();
    return `/execution/${direction}${qs ? `?${qs}` : ""}`;
  };

  const info = DIRECTIONS[direction];
  const other = (Object.keys(DIRECTIONS) as Direction[]).find((d) => d !== direction && meta.directions[d]);

  return (
    <Shell subtitle={`${info.question}.`}>
      <section className="input-section">
        <WalletSearch />
      </section>

      <Section
        label={coin ? `${info.short} · ${coin.coin}` : info.title}
        right={
          other && (
            <Link className="ex-more" href={`/execution/${other}`}>
              {DIRECTIONS[other].short} →
            </Link>
          )
        }
      >
        <div className="ex-controls">
          <NavSelect
            label="window"
            value={window}
            options={(meta.windows as WindowKey[])
              .filter((k) => dm.windows[k])
              .map((k) => ({ value: k, label: WINDOW_LABELS[k], href: href({ window: k, page: 1, coin: null }) }))}
          />
          <NavSelect
            label="coin"
            value={coin?.slug ?? ""}
            options={[
              { value: "", label: "all coins", href: href({ coin: null, page: 1 }) },
              ...coins.map((c) => ({ value: c.slug, label: c.coin, href: href({ coin: c.slug, page: 1 }) })),
            ]}
          />
          <Link className="action-btn ex-small-btn" href={href({ show: !showAll, page: 1 })}>
            {showAll ? "savers only" : "show every wallet"}
          </Link>
        </div>
        <div className="ex-stats">
          {coin ? (
            <>
              <Stat label="wallets" value={fmtInt(coin.wallets)} sub={`${fmtInt(coin.positive_wallets)} saved`} />
              <Stat label="all wallets, net" value={fmtUsd(coin.total_usd, true)} sub={fmtBps(coin.total_bps)} tone={signClass(coin.total_usd)} />
              <Stat label="volume replayed" value={fmtUsd(coin.replayed_notional)} />
            </>
          ) : (
            <>
              <Stat label="saved by savers" value={fmtUsd(w.positive_total_usd)} sub={`${fmtInt(w.positive_wallets)} of ${fmtInt(w.wallets)} wallets`} tone="ex-pos" />
              <Stat label="all wallets, net" value={fmtUsd(w.total_usd, true)} sub={fmtBps(w.total_bps)} tone={signClass(w.total_usd)} />
              <Stat label="volume replayed" value={fmtUsd(w.replayed_notional)} sub={`${w.start} → ${w.end}`} />
            </>
          )}
        </div>
        <p className="ex-muted ex-small">
          {showAll
            ? `All ${fmtInt(wallets)} wallets, best to worst.`
            : `The ${fmtInt(positive)} wallets that would have saved, best first.`}{" "}
          Saved = fee difference + execution price difference.
        </p>
        <LeaderboardTable rows={rows} publicTags={meta.public_tags} showTopCoin={!coin} />
        <Pager page={page} pages={pages} href={(p) => href({ page: p })} />
      </Section>
    </Shell>
  );
}
