import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "./client";
import {
  MEASURES,
  MEASURE_HELP,
  MEASURE_LABELS,
  fmtBps,
  fmtInt,
  fmtUsd,
  fmtWallets,
  pick,
  pickBps,
  pickPx,
  shortAddr,
  signClass,
  tagText,
  tagValue,
} from "./format";
import type { LeaderboardRow, Measure, NotCompared, Sides, Tag } from "./types";

export function Shell({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="page ex-page">
      <header>
        <div className="header-row">
          <h1>
            <Link href="/execution" className="ex-home-link">
              tradingfees.wtf
            </Link>
          </h1>
          <ThemeToggle />
        </div>
        <nav className="ex-nav">
          <Link href="/">fee calculator</Link>
          <Link href="/execution">execution leaderboards</Link>
          <Link href="/execution/methodology">methodology</Link>
        </nav>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </header>
      {children}
      <footer className="ex-footer">
        Replays of real orders against historical order books — see the{" "}
        <Link href="/execution/methodology">methodology</Link>.
      </footer>
    </div>
  );
}

export function Section({ label, children, right }: { label: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="section-block">
      <div className="ex-section-head">
        <div className="section-label">{label}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Tags({ tags, publicTags }: { tags: Tag[]; publicTags: Record<string, string> }) {
  if (!tags.length) return null;
  return (
    <span className="ex-tags">
      {tags.map((t) => {
        const value = tagValue(t);
        const help = publicTags[t[0]] ?? "";
        return (
          <span
            key={`${t[0]}:${t[2] ?? ""}`}
            className="ex-tag"
            title={value ? `${help} (${value})` : help}
            aria-label={`${tagText(t)}: ${help}${value ? ` (${value})` : ""}`}
            tabIndex={0}
          >
            {tagText(t)}
          </span>
        );
      })}
    </span>
  );
}

/** The tags' explanations as text (tooltips aren't reachable on touch screens). */
export function TagLegend({ tags, publicTags }: { tags: Tag[]; publicTags: Record<string, string> }) {
  if (!tags.length) return null;
  return (
    <details className="ex-tag-legend">
      <summary>what the tags mean · Hyperliquid activity, last 7 days</summary>
      <ul>
        {tags.map((t) => {
          const value = tagValue(t);
          return (
            <li key={`${t[0]}:${t[2] ?? ""}`}>
              <b>{tagText(t)}</b>: {publicTags[t[0]] ?? ""}
              {value ? ` (${value})` : ""}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function WalletCell({ address, name }: { address: string; name: string | null }) {
  return (
    <Link href={`/wallet/${address}`} className="ex-wallet">
      {name ? (
        <>
          <span className="ex-wallet-name">{name}</span>
          <span className="ex-muted">{shortAddr(address)}</span>
        </>
      ) : (
        <span>{shortAddr(address)}</span>
      )}
    </Link>
  );
}

/** Mid-adjusted / raw price switch (links, so it works without client JS). */
export function MeasureToggle({ measure, href }: { measure: Measure; href: (m: Measure) => string }) {
  return (
    <nav className="ex-tabs ex-measure" aria-label="price measure">
      <span className="ex-muted">price:</span>
      {MEASURES.map((m) =>
        m === measure ? (
          <b key={m} title={MEASURE_HELP[m]} aria-current="true">
            {MEASURE_LABELS[m]}
          </b>
        ) : (
          <Link key={m} href={href(m)} title={MEASURE_HELP[m]}>
            {MEASURE_LABELS[m]}
          </Link>
        ),
      )}
    </nav>
  );
}

/** "Not compared" volume: shown next to the totals, never inside them. */
export function NotComparedLines({
  nc,
  target,
  maxBps,
}: {
  nc: NotCompared | undefined;
  target: string;
  maxBps: number;
}) {
  if (!nc) return null;
  const lines: [string, number][] = [
    ["Liquidations", nc.liquidation_notional],
    [`Book too thin on ${target} (fill > ${maxBps} bps from mid, or not fully filled)`, nc.thin_notional],
    ["Other (coin not on both venues, no book data, price mismatch)", nc.other_notional],
  ];
  const shown = lines.filter(([, v]) => v >= 0.5);
  if (!shown.length) return null;
  return (
    <ul className="ex-not-compared">
      {shown.map(([label, v]) => (
        <li key={label}>
          {label}: <b>{fmtUsd(v)}</b> <span className="ex-muted">(not compared)</span>
        </li>
      ))}
    </ul>
  );
}

export function LeaderboardTable({
  rows,
  publicTags,
  measure,
  showTopCoin = true,
}: {
  rows: LeaderboardRow[];
  publicTags: Record<string, string>;
  measure: Measure;
  showTopCoin?: boolean;
}) {
  if (!rows.length) return <p className="ex-muted">No wallets in this view.</p>;
  return (
    <div className="ex-table-wrap">
      <table className="ex-table">
        <thead>
          <tr>
            <th>#</th>
            <th>wallet</th>
            <th className="num" title="fee difference + price difference; positive = cheaper on Lighter">net</th>
            <th className="num" title="saved / compared volume">bps</th>
            <th className="num ex-hide-sm" title="Hyperliquid venue fee − Lighter venue fee">fees</th>
            <th className="num ex-hide-sm" title={MEASURE_HELP[measure]}>price</th>
            <th className="num ex-hide-sm" title="compared taker volume">volume</th>
            {showTopCoin && <th className="ex-hide-sm">top coin</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.address}>
              <td className="ex-muted">{fmtInt(r.rank)}</td>
              <td>
                <WalletCell address={r.address} name={r.name} />
                <Tags tags={r.tags} publicTags={publicTags} />
              </td>
              <td className={`num ${signClass(pick(r, measure))}`}>{fmtUsd(pick(r, measure), true)}</td>
              <td className={`num ${signClass(pickBps(r, measure))}`}>{fmtBps(pickBps(r, measure))}</td>
              <td className={`num ex-hide-sm ${signClass(r.fee_saved_usd)}`}>{fmtUsd(r.fee_saved_usd, true)}</td>
              <td className={`num ex-hide-sm ${signClass(pickPx(r, measure))}`}>{fmtUsd(pickPx(r, measure), true)}</td>
              <td className="num ex-hide-sm">{fmtUsd(r.replayed_notional)}</td>
              {showTopCoin && <td className="ex-hide-sm">{r.top_coin ?? "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The wallets on each side of zero: "saved by X wallets" / "cost Y wallets more". Amounts are shown unsigned —
 * the label says which way — in the side's colour; an empty side reads "—".
 */
export function SplitStats({ s, wallets }: { s: Sides; wallets: number }) {
  return (
    <>
      <Stat
        label={s.positive_wallets ? `saved by ${fmtWallets(s.positive_wallets)}` : "saved by no wallet"}
        value={s.positive_wallets ? fmtUsd(Math.abs(s.positive_total_usd)) : "—"}
        sub={`cheaper on Lighter · of ${fmtWallets(wallets)}`}
        tone={s.positive_wallets ? "ex-pos" : ""}
      />
      <Stat
        label={s.negative_wallets ? `cost ${fmtWallets(s.negative_wallets)} more` : "cost no wallet more"}
        value={s.negative_wallets ? fmtUsd(Math.abs(s.negative_total_usd)) : "—"}
        sub={`cheaper on Hyperliquid · of ${fmtWallets(wallets)}`}
        tone={s.negative_wallets ? "ex-neg" : ""}
      />
    </>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="ex-stat">
      <div className="ex-stat-label">{label}</div>
      <div className={`ex-stat-value ${tone ?? ""}`}>{value}</div>
      {sub && <div className="ex-stat-sub">{sub}</div>}
    </div>
  );
}

const DAY_MS = 86_400_000;
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);

/**
 * Daily bars (green / red) on a date axis — days without data stay empty — with the
 * cumulative total as a step line. Pure SVG, no client JS.
 */
export function DailyChart({
  days,
  label = "Daily totals",
  gapText = "without data",
}: {
  days: { day: string; total: number }[];
  label?: string;
  /** "N days <gapText>" under the chart. */
  gapText?: string;
}) {
  if (!days.length) return <p className="ex-muted">No data.</p>;
  const W = 640;
  const H = 180;
  const PAD = 4;
  const d0 = dayNum(days[0].day);
  const span = dayNum(days[days.length - 1].day) - d0 + 1;
  const missing = span - days.length;
  let run = 0;
  const cum = days.map((d) => (run += d.total));
  const lo = Math.min(0, ...days.map((d) => d.total), ...cum);
  const hi = Math.max(0, ...days.map((d) => d.total), ...cum);
  const range = hi - lo || 1;
  const y = (v: number) => PAD + ((hi - v) / range) * (H - 2 * PAD);
  const bw = (W - 2 * PAD) / span;
  const x = (d: string) => PAD + bw * (dayNum(d) - d0);
  // Flat through days without data, then a step at each day.
  const line = days
    .map((d, i) => {
      const xc = x(d.day) + bw / 2;
      const prev = i ? `L${xc.toFixed(1)},${y(cum[i - 1]).toFixed(1)} ` : `M${xc.toFixed(1)},${y(0).toFixed(1)} `;
      return `${prev}L${xc.toFixed(1)},${y(cum[i]).toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="ex-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="ex-chart-zero" />
        {days.map((d, i) => {
          const top = y(Math.max(0, d.total));
          const h = Math.max(1, Math.abs(y(d.total) - y(0)));
          return (
            <rect
              key={d.day}
              x={x(d.day) + bw * 0.12}
              width={Math.max(1, bw * 0.76)}
              y={top}
              height={h}
              className={d.total >= 0 ? "ex-bar-pos" : "ex-bar-neg"}
            >
              <title>{`${d.day}: ${fmtUsd(d.total, true)} (cumulative ${fmtUsd(cum[i], true)})`}</title>
            </rect>
          );
        })}
        <path d={line} className="ex-chart-line" />
      </svg>
      <div className="ex-chart-axis">
        <span>{days[0].day}</span>
        <span>
          cumulative <b className={signClass(cum[cum.length - 1])}>{fmtUsd(cum[cum.length - 1], true)}</b>
          {missing > 0 && <span>{` · ${missing} day${missing === 1 ? "" : "s"} ${gapText}`}</span>}
        </span>
        <span>{days[days.length - 1].day}</span>
      </div>
    </div>
  );
}

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  const nums = Array.from(new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages]))
    .filter((p) => p >= 1 && p <= pages)
    .sort((a, b) => a - b);
  return (
    <nav className="ex-pager" aria-label="pagination">
      {page > 1 && <Link href={href(page - 1)}>← prev</Link>}
      {nums.map((p, i) => (
        <span key={p}>
          {i > 0 && nums[i - 1] !== p - 1 && <span className="ex-muted">…</span>}
          {p === page ? <b aria-current="page">{p}</b> : <Link href={href(p)}>{p}</Link>}
        </span>
      ))}
      {page < pages && <Link href={href(page + 1)}>next →</Link>}
    </nav>
  );
}
