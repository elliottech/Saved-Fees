import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "tradingfees.wtf",
  description:
    "See how much you're paying in trading fees. Compare Hyperliquid fees to Lighter, Binance, and Bybit.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script
          src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
          defer
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
