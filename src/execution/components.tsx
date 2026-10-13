import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "./client";
import { fmtBps, fmtInt, fmtUsd, shortAddr, signClass, tagText, tagValue } from "./format";
import type { LeaderboardRow, Tag } from "./types";

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
          <span key={`${t[0]}:${t[2] ?? ""}`} className="ex-tag" title={value ? `${help} (${value})` : help}>
            {tagText(t)}
          </span>
        );
      })}
    </span>
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

export function LeaderboardTable({
  rows,
  publicTags,
  showTopCoin = true,
}: {
  rows: LeaderboardRow[];
  publicTags: Record<string, string>;
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
            <th className="num" title="fee difference + price difference; positive = cheaper on Lighter">saved</th>
            <th className="num">bps</th>
            <th className="num ex-hide-sm" title="Hyperliquid fee − Lighter fee">fees</th>
            <th className="num ex-hide-sm" title="cost on Hyperliquid's book − cost on Lighter's">price</th>
            <th className="num ex-hide-sm">volume</th>
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
              <td className={`num ${signClass(r.total_usd)}`}>{fmtUsd(r.total_usd, true)}</td>
              <td className={`num ${signClass(r.total_bps)}`}>{fmtBps(r.total_bps)}</td>
              <td className={`num ex-hide-sm ${signClass(r.fee_saved_usd)}`}>{fmtUsd(r.fee_saved_usd, true)}</td>
              <td className={`num ex-hide-sm ${signClass(r.px_usd)}`}>{fmtUsd(r.px_usd, true)}</td>
              <td className="num ex-hide-sm">{fmtUsd(r.replayed_notional)}</td>
              {showTopCoin && <td className="ex-hide-sm">{r.top_coin ?? "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

/** Daily bars (green / red) with the cumulative total as a line. Pure SVG, no client JS. */
export function DailyChart({ days }: { days: { day: string; total_usd: number }[] }) {
  if (!days.length) return <p className="ex-muted">No data.</p>;
  const W = 640;
  const H = 180;
  const PAD = 4;
  let run = 0;
  const cum = days.map((d) => (run += d.total_usd));
  const lo = Math.min(0, ...days.map((d) => d.total_usd), ...cum);
  const hi = Math.max(0, ...days.map((d) => d.total_usd), ...cum);
  const span = hi - lo || 1;
  const y = (v: number) => PAD + ((hi - v) / span) * (H - 2 * PAD);
  const bw = (W - 2 * PAD) / days.length;
  const line = cum
    .map((v, i) => `${i ? "L" : "M"}${(PAD + bw * (i + 0.5)).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  return (
    <div className="ex-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Daily savings">
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="ex-chart-zero" />
        {days.map((d, i) => {
          const top = y(Math.max(0, d.total_usd));
          const h = Math.max(1, Math.abs(y(d.total_usd) - y(0)));
          return (
            <rect
              key={d.day}
              x={PAD + bw * i + bw * 0.12}
              width={Math.max(1, bw * 0.76)}
              y={top}
              height={h}
              className={d.total_usd >= 0 ? "ex-bar-pos" : "ex-bar-neg"}
            >
              <title>{`${d.day}: ${fmtUsd(d.total_usd, true)} (cumulative ${fmtUsd(cum[i], true)})`}</title>
            </rect>
          );
        })}
        <path d={line} className="ex-chart-line" />
      </svg>
      <div className="ex-chart-axis">
        <span>{days[0].day}</span>
        <span>
          cumulative <b className={signClass(cum[cum.length - 1])}>{fmtUsd(cum[cum.length - 1], true)}</b>
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
