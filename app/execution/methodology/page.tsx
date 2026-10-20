import type { Metadata } from "next";
import { headers } from "next/headers";
import { Section, Shell } from "@/execution/components";
import { getMeta } from "@/execution/data";
import { DIRECTIONS, WINDOW_LABELS, WINDOW_ORDER, coverageText } from "@/execution/format";
import type { Direction } from "@/execution/types";

export const metadata: Metadata = {
  title: "Methodology | tradingfees.wtf",
  description: "How the execution leaderboards replay real orders on the other venue's order book.",
};

const fmtStamp = (iso: string) => iso.replace("T", " ").replace(/(\+00:00|Z)$/, " UTC");

export default async function Methodology() {
  headers(); // render per request: the dataset isn't reachable at build time
  const meta = await getMeta();
  const hl = meta.directions.hl_to_lighter;
  const lighter = meta.directions.lighter_to_hl;
  const maxBps = meta.max_replay_slippage_bps;
  const directions = (Object.keys(DIRECTIONS) as Direction[]).filter((d) => meta.directions[d]);
  return (
    <Shell subtitle="how every number on the leaderboards is computed">
      <Section label="the idea">
        <div className="ex-prose">
          <p>
            We take <b>real taker orders</b> from one venue and replay each of them, at the same millisecond, against
            the <b>other venue&apos;s historical order book</b>. For every order:{" "}
            <b>saved = fee difference + price difference</b>. Positive means cheaper on Lighter, negative cheaper on
            Hyperliquid — in both directions.
          </p>
          <ul>
            <li>
              <b>Fee difference</b>: Hyperliquid venue fee − Lighter venue fee. Front-end fees (Hyperliquid builder
              codes, Lighter integrator fees) are left out on both sides.
            </li>
            <li>
              <b>Price difference, mid-adjusted</b> (the default): each venue&apos;s fill is measured against its own
              mid price just before the order, and the two execution costs are compared. The standing price gap
              between the venues drops out.
            </li>
            <li>
              <b>Price difference, raw</b> (switch &ldquo;price&rdquo; to raw): (Hyperliquid average price − Lighter
              average price) × size for a buy, the reverse for a sell. Includes any standing price gap between the
              venues.
            </li>
            <li>
              Basis points are over <b>compared volume</b>: the taker volume that was replayed and compared.
            </li>
          </ul>
        </div>
      </Section>

      <Section label="not compared">
        <div className="ex-prose">
          <ul>
            <li>
              <b>Liquidations</b>: never compared; profiles list their volume separately.
            </li>
            <li>
              <b>Book too thin</b>: if the other venue&apos;s book would fill the order more than {maxBps} bps from its
              mid, or couldn&apos;t fill it completely, the order is not compared; profiles list that volume
              separately.
            </li>
            <li>
              <b>Other</b>: coins not listed on both venues, moments without usable book data, and replays whose
              price doesn&apos;t match the order&apos;s (a sanity check on the market mapping).
            </li>
            <li>
              <b>Not modelled</b>: latency, and the order&apos;s impact on later orders — each order is replayed on its
              own against the book as it was.
            </li>
          </ul>
        </div>
      </Section>

      {hl && (
        <Section label="Hyperliquid traders on Lighter">
          <div className="ex-prose">
            <ul>
              <li>
                <b>Orders</b>: Hyperliquid perp taker fills from the node fill archive, grouped into orders by wallet,
                order id and coin. Each TWAP slice is its own order.
              </li>
              <li>
                <b>Hyperliquid fee</b>: the venue fee actually paid on each fill (incl. HIP-3 deployer fees and the
                wallet&apos;s discounts), without builder fees. Priority gas is not counted.
              </li>
              <li>
                <b>Lighter fee</b>: 0 — Lighter&apos;s standard account charges no trading fees.
              </li>
              <li>
                <b>Lighter price</b>: the order walked through Lighter&apos;s full L2 order book (Tardis) at the same
                millisecond, like a market order.
              </li>
              <li>
                <b>Mids</b>: Hyperliquid&apos;s is the last quote before the order (Tardis); Lighter&apos;s is the mid of
                the book the order is replayed on. Without a Hyperliquid quote before the order, that order&apos;s
                mid-adjusted price difference is its raw one.
              </li>
            </ul>
          </div>
        </Section>
      )}

      {lighter && (
        <Section label="Lighter traders vs Hyperliquid">
          <div className="ex-prose">
            <ul>
              <li>
                <b>Orders</b>: Lighter perp taker orders, with the venue fee actually paid (without integrator fees).
              </li>
              <li>
                <b>Hyperliquid fee</b>: Hyperliquid&apos;s base taker fee at the tier the wallet&apos;s own 14-day
                volume would reach, times the market&apos;s HIP-3 fee multiplier where it applies. No staking or
                referral discounts.
              </li>
              <li>
                <b>Hyperliquid price</b>: the order walked through Hyperliquid&apos;s book at the same moment: Tardis
                5- and 20-level snapshots, and 0xArchive&apos;s full-depth book when the order needs deeper levels.
              </li>
              <li>
                <b>Mids</b>: Lighter&apos;s is the last quote before the order (Tardis, available from 2026-04-17);
                Hyperliquid&apos;s is the mid of the book the order is replayed on. Without a Lighter quote before the
                order, that order&apos;s mid-adjusted price difference is its raw one.
              </li>
            </ul>
          </div>
        </Section>
      )}

      <Section label="data coverage">
        <div className="ex-prose">
          <p>
            Windows (7, 30 and 90 days) end on the last processed day; history is kept for 90 days. Only days
            computed with the current rules are included, so a window can cover fewer days than its name; each
            view shows the days it actually covers. A window covering the same days as a shorter one is not
            offered.
          </p>
          <ul>
            {directions.map((d) => {
              const dm = meta.directions[d]!;
              return (
                <li key={d}>
                  <b>{DIRECTIONS[d].title}</b>: {dm.first_day} → {dm.last_day} ({dm.days_with_data} day{dm.days_with_data === 1 ? "" : "s"} with data),
                  updated {fmtStamp(dm.updated_at)}.
                  <ul>
                    {WINDOW_ORDER.filter((k) => dm.windows[k] && !dm.windows[k]!.duplicate_of).map((k) => (
                      <li key={k}>
                        {WINDOW_LABELS[k]}: {coverageText(dm.windows[k]!)}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          <p className="ex-small ex-muted">Dataset generated {fmtStamp(meta.generated_at)}.</p>
        </div>
      </Section>

      <Section label="leaderboards and profiles">
        <div className="ex-prose">
          <ul>
            <li>
              Every wallet with compared volume is ranked by its total over the window, cheapest on Lighter first.
              Headlines show the net over all wallets, next to what the wallets that came out ahead saved and what
              the others would have paid more.
            </li>
            <li>Profiles show every coin a wallet traded, including the ones where the other venue was cheaper.</li>
            <li>
              Tags describe a wallet&apos;s Hyperliquid activity over the last 7 days, so they appear on Hyperliquid
              rows only.
            </li>
            <li>
              Names are the display names wallets set themselves on the Hyperliquid leaderboard, or Hyperliquid
              vault names.
            </li>
          </ul>
        </div>
      </Section>
    </Shell>
  );
}
