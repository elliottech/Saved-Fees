import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CopyLink, WalletSearch } from "@/execution/client";
import { DailyChart, MeasureToggle, NotComparedLines, Section, Shell, Stat, Tags } from "@/execution/components";
import { ADDRESS_RE, getMeta, getWallet } from "@/execution/data";
import { SITE_URL } from "@/execution/layout";
import {
  DEFAULT_MEASURE,
  DEFAULT_WINDOW,
  DIRECTIONS,
  MEASURE_HELP,
  MEASURE_LABELS,
  WINDOW_LABELS,
  coinSlug,
  coverageText,
  fmtBps,
  fmtInt,
  fmtPx,
  fmtTime,
  fmtUsd,
  isMeasure,
  isZero,
  outcomeText,
  pick,
  pickBps,
  pickPx,
  resolveWindow,
  shortAddr,
  signClass,
  windowLabel,
  windowOptions,
} from "@/execution/format";
import type { Direction, DirectionMeta, Measure, WalletDirection, WalletOrder, WindowKey } from "@/execution/types";

interface Props {
  params: { address: string };
  searchParams: { window?: string; measure?: string };
}

/** Query string carrying the viewer's window / measure (defaults omitted). */
function viewQuery(window: string | undefined, measure: Measure): string {
  const q = new URLSearchParams();
  if (window && window !== DEFAULT_WINDOW) q.set("window", window);
  if (measure !== DEFAULT_MEASURE) q.set("measure", measure);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const address = params.address.toLowerCase();
  if (!ADDRESS_RE.test(address)) return { title: "Wallet | tradingfees.wtf" };
  const wallet = await getWallet(address);
  if (!wallet) return { title: `${shortAddr(address)} | tradingfees.wtf`, robots: { index: false } };
  const who = wallet.name ?? shortAddr(address);
  const measure: Measure = isMeasure(searchParams.measure) ? searchParams.measure : DEFAULT_MEASURE;
  // The card shows the window the viewer picked (30 days by default), never a hand-picked one.
  const q = new URLSearchParams({ address, window: searchParams.window ?? DEFAULT_WINDOW, measure });
  const og = `/api/execution/og?${q}`;
  return {
    title: `${who} — execution cost | tradingfees.wtf`,
    description: `What ${who}'s real orders would have cost on the other venue.`,
    openGraph: { images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [og] },
  };
}

function OrdersTable({
  orders,
  info,
  measure,
}: {
  orders: WalletOrder[];
  info: (typeof DIRECTIONS)[Direction];
  measure: Measure;
}) {
  if (!orders.length) return <p className="ex-muted">No compared orders stored.</p>;
  return (
    <div className="ex-table-wrap">
      <table className="ex-table">
        <thead>
          <tr>
            <th>time</th>
            <th>coin</th>
            <th className="num">size</th>
            <th className="num ex-hide-sm">HL price</th>
            <th className="num ex-hide-sm">Lighter price</th>
            <th className="num ex-hide-sm" title="Hyperliquid venue fee − Lighter venue fee">
              fees
            </th>
            <th className="num ex-hide-sm" title={MEASURE_HELP[measure]}>
              price
            </th>
            <th className="num" title="fee difference + price difference; positive = cheaper on Lighter">
              saved
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={`${o.time_ms}:${o.coin}:${o.side}:${o.notional}:${o.total_usd}`}>
              <td className="ex-nowrap">{fmtTime(o.time_ms)}</td>
              <td>
                {o.coin} <span className={o.side === "B" ? "ex-pos" : "ex-neg"}>{o.side === "B" ? "buy" : "sell"}</span>
                {o.twap && <span className="ex-tag">TWAP</span>}
              </td>
              <td className="num">
                {fmtUsd(o.notional)}
                {o.coverage < 0.999 && (
                  <span
                    className="ex-muted"
                    title={`${info.target}'s book filled ${(o.coverage * 100).toFixed(1)}% of the order; the comparison covers that part`}
                  >
                    {" "}
                    ({(o.coverage * 100).toFixed(0)}%)
                  </span>
                )}
              </td>
              <td className="num ex-hide-sm" title={o.hl_mid ? `HL mid before the order: ${fmtPx(o.hl_mid)}` : undefined}>
                {fmtPx(o.hl_vwap)}
              </td>
              <td className="num ex-hide-sm" title={o.l_mid ? `Lighter mid before the order: ${fmtPx(o.l_mid)}` : undefined}>
                {fmtPx(o.l_vwap)}
              </td>
              <td className={`num ex-hide-sm ${signClass(o.fee_saved_usd)}`}>{fmtUsd(o.fee_saved_usd, true)}</td>
              <td className={`num ex-hide-sm ${signClass(pickPx(o, measure))}`}>{fmtUsd(pickPx(o, measure), true)}</td>
              <td className={`num ${signClass(pick(o, measure))}`}>{fmtUsd(pick(o, measure), true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DirectionPanel({
  address,
  direction,
  dm,
  data,
  requested,
  measure,
}: {
  address: string;
  direction: Direction;
  dm: DirectionMeta;
  data: WalletDirection;
  requested: string | undefined;
  measure: Measure;
}) {
  const info = DIRECTIONS[direction];
  const available = windowOptions(dm).filter((k) => data.windows[k]);
  const resolved = resolveWindow(dm, requested);
  const win: WindowKey | undefined = resolved && data.windows[resolved] ? resolved : available[available.length - 1];
  const w = win ? data.windows[win] : undefined;
  const cover = win ? dm.windows[win] : undefined;
  if (!win || !w || !cover) return null;
  const m = w[measure];
  const coins = data.coins.filter((c) => c.window === win);
  const best = measure === "mid" ? data.best_mid : data.best;
  const worst = measure === "mid" ? data.worst_mid : data.worst;
  const lbQuery = new URLSearchParams({ window: win, page: String(Math.ceil(m.rank / 100)) });
  if (measure !== DEFAULT_MEASURE) lbQuery.set("measure", measure);
  return (
    <>
      <Section
        label={info.title}
        right={
          <nav className="ex-tabs">
            {available.map((k) =>
              k === win ? (
                <b key={k}>{windowLabel(k, dm.windows[k])}</b>
              ) : (
                <Link key={k} href={`/wallet/${address}${viewQuery(k, measure)}`}>
                  {windowLabel(k, dm.windows[k])}
                </Link>
              ),
            )}
          </nav>
        }
      >
        <p className="ex-coverage">{coverageText(cover)}</p>
        <div className="overview-hero">
          <div className="overview-label">{outcomeText(direction, m.total_usd)}</div>
          <div className={`overview-amount ${signClass(m.total_usd)}`}>
            {isZero(m.total_usd) ? "$0" : fmtUsd(Math.abs(m.total_usd))}
          </div>
          <div className="overview-sub">
            {fmtBps(m.total_bps)} on {fmtUsd(w.replayed_notional)} compared volume · rank{" "}
            <Link href={`/execution/${direction}?${lbQuery}`}>#{fmtInt(m.rank)}</Link> of {fmtInt(w.of)} ·{" "}
            {MEASURE_LABELS[measure]}
          </div>
        </div>
        <div className="ex-stats">
          <Stat
            label="fee difference"
            value={fmtUsd(w.fee_saved_usd, true)}
            tone={signClass(w.fee_saved_usd)}
            sub={`${fmtUsd(w.fee_paid_usd)} paid on ${info.source}`}
          />
          <Stat
            label="price difference"
            value={fmtUsd(m.px_usd, true)}
            tone={signClass(m.px_usd)}
            sub={`${fmtBps(m.px_bps)} · ${MEASURE_LABELS[measure]}`}
          />
          <Stat
            label="orders"
            value={fmtInt(w.orders)}
            sub={`${w.active_days} active day${w.active_days === 1 ? "" : "s"} · ${w.coins} coin${w.coins === 1 ? "" : "s"}`}
          />
          <Stat label={`all ${info.source} taker volume`} value={fmtUsd(w.taker_notional)} sub="compared or not" />
        </div>
        <NotComparedLines nc={w.not_compared} target={info.target} />
      </Section>

      <Section label={`per coin · ${WINDOW_LABELS[win].toLowerCase()}`}>
        <div className="ex-table-wrap">
          <table className="ex-table">
            <thead>
              <tr>
                <th>coin</th>
                <th className="num" title="fee difference + price difference; positive = cheaper on Lighter">
                  saved
                </th>
                <th className="num" title="saved / compared volume">
                  bps
                </th>
                <th className="num ex-hide-sm" title="Hyperliquid venue fee − Lighter venue fee">
                  fees
                </th>
                <th className="num ex-hide-sm" title={MEASURE_HELP[measure]}>
                  price
                </th>
                <th className="num" title="compared taker volume">
                  volume
                </th>
                <th className="num ex-hide-sm">orders</th>
                <th className="num ex-hide-sm">coin rank</th>
              </tr>
            </thead>
            <tbody>
              {coins.map((c) => {
                const q = new URLSearchParams({ window: win, coin: coinSlug(c.coin) });
                if (measure !== DEFAULT_MEASURE) q.set("measure", measure);
                return (
                  <tr key={c.coin}>
                    <td>
                      <Link href={`/execution/${direction}?${q}`}>{c.coin}</Link>
                    </td>
                    <td className={`num ${signClass(pick(c, measure))}`}>{fmtUsd(pick(c, measure), true)}</td>
                    <td className={`num ${signClass(pickBps(c, measure))}`}>{fmtBps(pickBps(c, measure))}</td>
                    <td className={`num ex-hide-sm ${signClass(c.fee_saved_usd)}`}>{fmtUsd(c.fee_saved_usd, true)}</td>
                    <td className={`num ex-hide-sm ${signClass(pickPx(c, measure))}`}>
                      {fmtUsd(pickPx(c, measure), true)}
                    </td>
                    <td className="num">{fmtUsd(c.replayed_notional)}</td>
                    <td className="num ex-hide-sm">{fmtInt(c.orders)}</td>
                    <td className="num ex-hide-sm ex-muted">
                      {fmtInt(measure === "mid" ? c.rank_mid : c.rank)} / {fmtInt(c.of)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section label={`per day · ${dm.first_day} → ${dm.last_day}`}>
        <DailyChart days={data.daily.map((d) => ({ day: d.day, total: pick(d, measure) ?? 0 }))} />
      </Section>

      <Section label="best orders · compared orders, every published day">
        <OrdersTable orders={best} info={info} measure={measure} />
      </Section>
      <Section label="worst orders · compared orders, every published day">
        <OrdersTable orders={worst} info={info} measure={measure} />
      </Section>
    </>
  );
}

export default async function WalletPage({ params, searchParams }: Props) {
  const address = params.address.toLowerCase();
  if (!ADDRESS_RE.test(address)) notFound();
  const measure: Measure = isMeasure(searchParams.measure) ? searchParams.measure : DEFAULT_MEASURE;
  if (address !== params.address) permanentRedirect(`/wallet/${address}${viewQuery(searchParams.window, measure)}`);
  const [meta, wallet] = await Promise.all([getMeta(), getWallet(address)]);

  if (!wallet) {
    return (
      <Shell>
        <section className="input-section">
          <WalletSearch />
        </section>
        <Section label="wallet not found">
          <p className="ex-lead">{`${shortAddr(address)} has no compared taker orders in the published days.`}</p>
          <p className="ex-muted ex-small">
            Only taker orders in coins listed on both venues are compared; liquidations and orders the other
            venue&apos;s book couldn&apos;t absorb are left out, and wallets that only provide liquidity don&apos;t
            appear.
          </p>
        </Section>
      </Shell>
    );
  }

  const directions = (Object.keys(DIRECTIONS) as Direction[]).filter(
    (d) => wallet.directions[d] && meta.directions[d],
  );
  const shareUrl = `${SITE_URL}/wallet/${wallet.address}${viewQuery(searchParams.window, measure)}`;
  return (
    <Shell>
      <section className="ex-wallet-head">
        <div>
          <h2>{wallet.name ?? shortAddr(wallet.address)}</h2>
          <div className="ex-muted ex-small ex-break">{wallet.address}</div>
          {wallet.tags.length > 0 && (
            <div className="ex-small ex-muted">
              <Tags tags={wallet.tags} publicTags={meta.public_tags} />{" "}
              <span title="Tags describe the wallet's Hyperliquid activity over the last 7 days">
                · Hyperliquid activity, last 7 days
              </span>
            </div>
          )}
        </div>
        <div className="ex-wallet-actions">
          <CopyLink />
          <a
            className="action-btn ex-small-btn"
            target="_blank"
            rel="noreferrer"
            href={`https://x.com/intent/tweet?url=${encodeURIComponent(shareUrl)}`}
          >
            share on X
          </a>
        </div>
      </section>
      <MeasureToggle
        measure={measure}
        href={(m) => `/wallet/${wallet.address}${viewQuery(searchParams.window, m)}`}
      />
      {directions.map((d) => (
        <DirectionPanel
          key={d}
          address={wallet.address}
          direction={d}
          dm={meta.directions[d]!}
          data={wallet.directions[d]!}
          requested={searchParams.window}
          measure={measure}
        />
      ))}
    </Shell>
  );
}
