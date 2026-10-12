import type { Metadata } from "next";
import Link from "next/link";
import { CopyLink, WalletSearch } from "@/execution/client";
import { DailyChart, Section, Shell, Stat, Tags } from "@/execution/components";
import { ADDRESS_RE, getMeta, getWallet } from "@/execution/data";
import {
  DIRECTIONS,
  WINDOW_LABELS,
  fmtBps,
  fmtInt,
  fmtPx,
  fmtTime,
  fmtUsd,
  isWindow,
  shortAddr,
  signClass,
} from "@/execution/format";
import type { Direction, WalletDirection, WalletOrder, WindowKey } from "@/execution/types";

export const revalidate = 300;

interface Props {
  params: { address: string };
  searchParams: { window?: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const address = params.address.toLowerCase();
  if (!ADDRESS_RE.test(address)) return { title: "Wallet | tradingfees.wtf" };
  const wallet = await getWallet(address);
  const who = wallet?.name ?? shortAddr(address);
  const og = `/api/execution/og?address=${address}`;
  return {
    title: `${who} — execution cost | tradingfees.wtf`,
    description: `What ${who}'s real orders would have cost on the other venue.`,
    openGraph: { images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [og] },
  };
}

function OrdersTable({ orders, info }: { orders: WalletOrder[]; info: (typeof DIRECTIONS)[Direction] }) {
  if (!orders.length) return <p className="ex-muted">No replayed orders stored.</p>;
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
            <th className="num ex-hide-sm">fees</th>
            <th className="num ex-hide-sm">price</th>
            <th className="num">saved</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={`${o.time_ms}:${o.coin}:${o.notional}:${o.total_usd}`}>
              <td className="ex-nowrap">{fmtTime(o.time_ms)}</td>
              <td>
                {o.coin} <span className={o.side === "B" ? "ex-pos" : "ex-neg"}>{o.side === "B" ? "buy" : "sell"}</span>
                {o.twap && <span className="ex-tag">TWAP</span>}
                {o.is_liquidation && <span className="ex-tag">liq</span>}
              </td>
              <td className="num">
                {fmtUsd(o.notional)}
                {o.coverage < 0.999 && (
                  <span className="ex-muted" title={`${info.target}'s book filled ${(o.coverage * 100).toFixed(1)}% of the order; the comparison covers that part`}>
                    {" "}
                    ({(o.coverage * 100).toFixed(0)}%)
                  </span>
                )}
              </td>
              <td className="num ex-hide-sm">{fmtPx(o.hl_vwap)}</td>
              <td className="num ex-hide-sm">{fmtPx(o.l_vwap)}</td>
              <td className={`num ex-hide-sm ${signClass(o.fee_saved_usd)}`}>{fmtUsd(o.fee_saved_usd, true)}</td>
              <td className={`num ex-hide-sm ${signClass(o.px_usd)}`}>{fmtUsd(o.px_usd, true)}</td>
              <td className={`num ${signClass(o.total_usd)}`}>{fmtUsd(o.total_usd, true)}</td>
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
  data,
  window,
}: {
  address: string;
  direction: Direction;
  data: WalletDirection;
  window: WindowKey;
}) {
  const info = DIRECTIONS[direction];
  const available = (["7d", "30d", "90d", "all"] as WindowKey[]).filter((k) => data.windows[k]);
  const win = data.windows[window] ? window : available[available.length - 1];
  const w = data.windows[win];
  if (!w) return null;
  const coins = data.coins.filter((c) => c.window === win);
  return (
    <>
      <Section
        label={info.title}
        right={
          <nav className="ex-tabs">
            {available.map((k) =>
              k === win ? (
                <b key={k}>{WINDOW_LABELS[k]}</b>
              ) : (
                <Link key={k} href={`/wallet/${address}?window=${k}`}>
                  {WINDOW_LABELS[k]}
                </Link>
              ),
            )}
          </nav>
        }
      >
        <div className="overview-hero">
          <div className="overview-label">
            {w.total_usd >= 0 ? `would have saved on ${info.target}` : `would have paid more on ${info.target}`}
          </div>
          <div className={`overview-amount ${signClass(w.total_usd)}`}>{fmtUsd(Math.abs(w.total_usd))}</div>
          <div className="overview-sub">
            {fmtBps(w.total_bps)} on {fmtUsd(w.replayed_notional)} of taker volume · rank{" "}
            <Link href={`/execution/${direction}?window=${win}&show=all&page=${Math.ceil(w.rank / 100)}`}>
              #{fmtInt(w.rank)}
            </Link>{" "}
            of {fmtInt(w.of)}
          </div>
        </div>
        <div className="ex-stats">
          <Stat label="fee difference" value={fmtUsd(w.fee_saved_usd, true)} tone={signClass(w.fee_saved_usd)} sub={`${fmtUsd(w.fee_paid_usd)} paid on ${info.source}`} />
          <Stat label="price difference" value={fmtUsd(w.px_usd, true)} tone={signClass(w.px_usd)} sub="execution vs the other book" />
          <Stat label="orders" value={fmtInt(w.orders)} sub={`${w.active_days} active day${w.active_days === 1 ? "" : "s"} · ${w.coins} coin${w.coins === 1 ? "" : "s"}`} />
          <Stat
            label={`all ${info.source} taker volume`}
            value={fmtUsd(w.taker_notional)}
            sub="incl. coins not on both venues"
          />
        </div>
      </Section>

      <Section label={`per coin · ${WINDOW_LABELS[win].toLowerCase()}`}>
        <div className="ex-table-wrap">
          <table className="ex-table">
            <thead>
              <tr>
                <th>coin</th>
                <th className="num">saved</th>
                <th className="num">bps</th>
                <th className="num ex-hide-sm">fees</th>
                <th className="num ex-hide-sm">price</th>
                <th className="num">volume</th>
                <th className="num ex-hide-sm">orders</th>
                <th className="num ex-hide-sm">coin rank</th>
              </tr>
            </thead>
            <tbody>
              {coins.map((c) => (
                <tr key={c.coin}>
                  <td>
                    <Link href={`/execution/${direction}?window=${win}&coin=${c.coin.replace(":", "_")}`}>{c.coin}</Link>
                  </td>
                  <td className={`num ${signClass(c.total_usd)}`}>{fmtUsd(c.total_usd, true)}</td>
                  <td className={`num ${signClass(c.total_bps)}`}>{fmtBps(c.total_bps)}</td>
                  <td className={`num ex-hide-sm ${signClass(c.fee_saved_usd)}`}>{fmtUsd(c.fee_saved_usd, true)}</td>
                  <td className={`num ex-hide-sm ${signClass(c.px_usd)}`}>{fmtUsd(c.px_usd, true)}</td>
                  <td className="num">{fmtUsd(c.replayed_notional)}</td>
                  <td className="num ex-hide-sm">{fmtInt(c.orders)}</td>
                  <td className="num ex-hide-sm ex-muted">
                    {fmtInt(c.rank)} / {fmtInt(c.of)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section label="per day · every stored day">
        <DailyChart days={data.daily} />
      </Section>

      <Section label="best orders · every stored day">
        <OrdersTable orders={data.best} info={info} />
      </Section>
      <Section label="worst orders · every stored day">
        <OrdersTable orders={data.worst} info={info} />
      </Section>
    </>
  );
}

export default async function WalletPage({ params, searchParams }: Props) {
  const address = params.address.toLowerCase();
  const window: WindowKey = isWindow(searchParams.window) ? searchParams.window : "30d";
  const [meta, wallet] = await Promise.all([getMeta(), ADDRESS_RE.test(address) ? getWallet(address) : null]);

  if (!wallet) {
    return (
      <Shell>
        <section className="input-section">
          <WalletSearch />
        </section>
        <Section label="wallet not found">
          <p className="ex-lead">
            {ADDRESS_RE.test(address)
              ? `${shortAddr(address)} has no replayed taker orders in the stored days.`
              : "That isn't a valid 0x address."}
          </p>
          <p className="ex-muted ex-small">
            Only taker orders in coins listed on both venues are replayed; wallets that only provide liquidity
            don't appear.
          </p>
        </Section>
      </Shell>
    );
  }

  const directions = (Object.keys(DIRECTIONS) as Direction[]).filter((d) => wallet.directions[d]);
  return (
    <Shell>
      <section className="ex-wallet-head">
        <div>
          <h2>{wallet.name ?? shortAddr(wallet.address)}</h2>
          <div className="ex-muted ex-small ex-break">{wallet.address}</div>
          <Tags tags={wallet.tags} publicTags={meta.public_tags} />
        </div>
        <div className="ex-wallet-actions">
          <CopyLink />
          <a
            className="action-btn ex-small-btn"
            target="_blank"
            rel="noreferrer"
            href={`https://x.com/intent/tweet?url=${encodeURIComponent(`https://tradingfees.wtf/wallet/${wallet.address}`)}`}
          >
            share on X
          </a>
        </div>
      </section>
      {directions.map((d) => (
        <DirectionPanel key={d} address={wallet.address} direction={d} data={wallet.directions[d]!} window={window} />
      ))}
    </Shell>
  );
}
