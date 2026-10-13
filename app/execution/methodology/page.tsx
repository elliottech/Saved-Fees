import type { Metadata } from "next";
import { headers } from "next/headers";
import { Section, Shell } from "@/execution/components";
import { getMeta } from "@/execution/data";

export const metadata: Metadata = {
  title: "Methodology | tradingfees.wtf",
  description: "How the execution leaderboards replay real orders on the other venue's order book.",
};

export default async function Methodology() {
  headers(); // render per request: the dataset isn't reachable at build time
  const meta = await getMeta();
  const hl = meta.directions.hl_to_lighter;
  const lighter = meta.directions.lighter_to_hl;
  return (
    <Shell subtitle="how every number on the leaderboards is computed">
      <Section label="the idea">
        <div className="ex-prose">
          <p>
            Fee tables only tell half the story: a cheaper venue is only cheaper if its order book fills you at a
            similar price. So we take <b>real taker orders</b> from one venue and replay each of them, at the same
            millisecond, against the <b>other venue&apos;s historical order book</b>.
          </p>
          <p>
            For every order: <b>saved = fee difference + price difference</b>, in both directions. A positive number
            means the order was (or would have been) cheaper on Lighter; a negative one, cheaper on Hyperliquid.
          </p>
          <ul>
            <li>
              <b>Fee difference</b>: Hyperliquid fee − Lighter fee for the order. One of the two is the fee actually
              paid, the other the fee that venue would have charged.
            </li>
            <li>
              <b>Price difference</b>: what the fill cost on Hyperliquid&apos;s book minus what it cost on
              Lighter&apos;s, for the same size: (Hyperliquid average price − Lighter average price) × size for a
              buy, the reverse for a sell. One side is the real fill, the other comes from walking the other
              venue&apos;s book level by level, so large orders pay for depth here.
            </li>
          </ul>
        </div>
      </Section>

      {hl && (
        <Section label="Hyperliquid traders on Lighter">
          <div className="ex-prose">
            <ul>
              <li>
                <b>Orders</b>: every Hyperliquid perp taker fill from the node fill archive, grouped into orders by
                wallet, order id and coin. Each TWAP slice counts as its own order; liquidations are included.
              </li>
              <li>
                <b>Hyperliquid fee</b>: the fee actually paid on each fill, including builder (front-end) and
                deployer fees. Priority gas, paid separately in HYPE, is not counted.
              </li>
              <li>
                <b>Lighter fee</b>: 0 — Lighter&apos;s standard account charges no trading fees.
              </li>
              <li>
                <b>Lighter price</b>: the order is walked through Lighter&apos;s full order book at the same
                millisecond (historical data from Tardis), like a market order capped at 50% from mid. If
                Lighter&apos;s book couldn&apos;t fill the whole size, only the filled part is compared.
              </li>
              <li>
                <b>Coins</b>: only coins listed on both venues; orders without a usable Lighter book at that moment
                are left out.
              </li>
              <li>
                <b>Not modelled</b>: latency and market impact on later orders — each order is replayed on its own.
              </li>
              <li>
                <b>Data</b>: {hl.first_day} → {hl.last_day}, updated daily.
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
                <b>Orders</b>: every Lighter perp taker order, with the fee actually paid.
              </li>
              <li>
                <b>Hyperliquid fee</b>: Hyperliquid&apos;s base fee schedule at the tier the wallet&apos;s own
                14-day volume would reach, with the market&apos;s HIP-3 fee multiplier where it applies. No staking
                or referral discounts.
              </li>
              <li>
                <b>Hyperliquid price</b>: the order walked through Hyperliquid&apos;s full order book at the same
                moment.
              </li>
              <li>
                <b>Data</b>: {lighter.first_day} → {lighter.last_day}, updated daily.
              </li>
            </ul>
          </div>
        </Section>
      )}

      <Section label="leaderboards and profiles">
        <div className="ex-prose">
          <ul>
            <li>
              Wallets are ranked by total dollars saved over the window (7, 30, 90 days or all stored days, all
              ending on the last processed day). The default view lists wallets with a positive total (cheaper on Lighter); &ldquo;show
              every wallet&rdquo; lists everyone.
            </li>
            <li>Profiles show every coin a wallet traded, including the ones where the other venue was worse.</li>
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
