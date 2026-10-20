import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NavSelect, WalletSearch } from "@/execution/client";
import {
  LeaderboardTable,
  MeasureToggle,
  NotComparedLines,
  Pager,
  Section,
  Shell,
  SplitStats,
  Stat,
} from "@/execution/components";
import { getCoinLeaderboard, getCoins, getLeaderboard, getMeta } from "@/execution/data";
import {
  DEFAULT_MEASURE,
  DEFAULT_WINDOW,
  DIRECTIONS,
  MEASURE_LABELS,
  coverageText,
  fmtBps,
  fmtInt,
  fmtUsd,
  isDirection,
  isMeasure,
  isSummary,
  isWindow,
  coinSides,
  pick,
  pickBps,
  resolveWindow,
  signClass,
  windowLabel,
  windowOptions,
} from "@/execution/format";
import type { Direction, Measure, WindowKey } from "@/execution/types";

const VIEW_SIZE = 100;

interface Props {
  params: { direction: string };
  searchParams: { window?: string; coin?: string; page?: string; show?: string; measure?: string };
}

export function generateMetadata({ params, searchParams }: Props): Metadata {
  if (!isDirection(params.direction)) return {};
  const info = DIRECTIONS[params.direction];
  // The card: this direction, the viewer's window (the route resolves duplicates) and measure.
  const q = new URLSearchParams({ direction: params.direction });
  if (isWindow(searchParams.window)) q.set("window", searchParams.window);
  if (isMeasure(searchParams.measure)) q.set("measure", searchParams.measure);
  const og = `/api/execution/og?${q}`;
  return {
    title: `${info.title} — leaderboard | tradingfees.wtf`,
    description: `${info.question}. Every wallet ranked.`,
    openGraph: { images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [og] },
  };
}

export default async function Leaderboard({ params, searchParams }: Props) {
  if (!isDirection(params.direction)) notFound();
  const direction: Direction = params.direction;
  const meta = await getMeta();
  const dm = meta.directions[direction];
  if (!dm) notFound();

  const window = resolveWindow(dm, searchParams.window);
  const w = window ? dm.windows[window] : undefined;
  if (!window || !isSummary(w)) notFound();
  const measure: Measure = isMeasure(searchParams.measure) ? searchParams.measure : DEFAULT_MEASURE;
  const saversOnly = searchParams.show === "savers";
  const coins = (await getCoins(direction)).filter((c) => c.window === window);
  const coin = coins.find((c) => c.slug === searchParams.coin) ?? null;
  const s = w[measure];

  const wallets = coin ? coin.wallets : w.wallets;
  const positive = coin ? (measure === "mid" ? coin.positive_wallets_mid : coin.positive_wallets) : s.positive_wallets;
  // Shown 100 at a time; the data files hold meta.page_size ranks each.
  const pages = Math.max(1, Math.ceil((saversOnly ? positive : wallets) / VIEW_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(searchParams.page)) || 1));
  const firstRank = (page - 1) * VIEW_SIZE + 1;
  const lbPage = Math.ceil(firstRank / meta.page_size);
  const lbRows = coin
    ? await getCoinLeaderboard(direction, window, measure, coin, lbPage)
    : ((await getLeaderboard(direction, window, measure, "all", lbPage))?.rows ?? []);
  const rows = lbRows.filter(
    (r) => r.rank >= firstRank && r.rank < firstRank + VIEW_SIZE && (!saversOnly || r.rank <= positive),
  );

  const href = (
    p: Partial<{ window: WindowKey; coin: string | null; page: number; savers: boolean; measure: Measure }>,
  ) => {
    const q = new URLSearchParams();
    const win = p.window ?? window;
    const c = p.coin === undefined ? coin?.slug : p.coin;
    const sv = p.savers ?? saversOnly;
    const m = p.measure ?? measure;
    if (win !== DEFAULT_WINDOW) q.set("window", win);
    if (c) q.set("coin", c);
    if (p.page && p.page > 1) q.set("page", String(p.page));
    if (sv) q.set("show", "savers");
    if (m !== DEFAULT_MEASURE) q.set("measure", m);
    const qs = q.toString();
    return `/execution/${direction}${qs ? `?${qs}` : ""}`;
  };

  const info = DIRECTIONS[direction];
  const other = (Object.keys(DIRECTIONS) as Direction[]).find((d) => d !== direction && meta.directions[d]);
  const coinTotal = coin ? pick(coin, measure) : null;

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
            options={windowOptions(dm).map((k) => ({
              value: k,
              label: windowLabel(k, dm.windows[k]),
              href: href({ window: k, page: 1, coin: null }),
            }))}
          />
          <NavSelect
            label="coin"
            value={coin?.slug ?? ""}
            options={[
              { value: "", label: "all coins", href: href({ coin: null, page: 1 }) },
              ...coins.map((c) => ({ value: c.slug, label: c.coin, href: href({ coin: c.slug, page: 1 }) })),
            ]}
          />
          <Link className="action-btn ex-small-btn" href={href({ savers: !saversOnly, page: 1 })}>
            {saversOnly ? "show every wallet" : "only wallets cheaper on Lighter"}
          </Link>
        </div>
        <MeasureToggle measure={measure} href={(m) => href({ measure: m, page: 1 })} />
        <p className="ex-coverage">{coverageText(w)}</p>
        <div className="ex-stats">
          {coin ? (
            <>
              <Stat
                label="net, all wallets"
                value={fmtUsd(coinTotal, true)}
                sub={fmtBps(pickBps(coin, measure))}
                tone={signClass(coinTotal)}
              />
              <SplitStats s={coinSides(coin, measure)} wallets={coin.wallets} />
              <Stat label="volume compared" value={fmtUsd(coin.replayed_notional)} />
            </>
          ) : (
            <>
              <Stat
                label="net, all wallets"
                value={fmtUsd(s.total_usd, true)}
                sub={`${fmtBps(s.total_bps)} on ${fmtUsd(w.replayed_notional)} compared`}
                tone={signClass(s.total_usd)}
              />
              <SplitStats s={s} wallets={w.wallets} />
            </>
          )}
        </div>
        {!coin && (
          <NotComparedLines nc={w.not_compared} target={info.target} maxBps={meta.max_replay_slippage_bps} />
        )}
        <p className="ex-muted ex-small">
          {saversOnly
            ? `The ${fmtInt(positive)} wallets that came out cheaper on Lighter, best first.`
            : `All ${fmtInt(wallets)} wallets, cheapest on Lighter first.`}{" "}
          Net = venue fee difference + price difference ({MEASURE_LABELS[measure]}); bps over compared volume.
        </p>
        <LeaderboardTable rows={rows} publicTags={meta.public_tags} measure={measure} showTopCoin={!coin} />
        <Pager page={page} pages={pages} href={(p) => href({ page: p })} />
      </Section>
    </Shell>
  );
}
