import type { Metadata } from "next";
import App from "@/App";
import "@/styles.css";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const address =
    typeof params.address === "string" ? params.address.trim().toLowerCase() : "";
  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(address);

  if (isValidAddress) {
    const ogImageUrl = `/api/og-image?address=${encodeURIComponent(address)}`;
    return {
      title: "Trading Fee Analysis | tradingfees.wtf",
      description:
        "See the trading fees for this address on Hyperliquid vs Lighter, Binance, and Bybit.",
      openGraph: {
        title: "Trading Fee Analysis | tradingfees.wtf",
        description:
          "See the trading fees for this address on Hyperliquid vs Lighter, Binance, and Bybit.",
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
          },
        ],
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: "Trading Fee Analysis | tradingfees.wtf",
        description:
          "See the trading fees for this address on Hyperliquid vs Lighter, Binance, and Bybit.",
        images: [ogImageUrl],
      },
    };
  }

  const defaultOgImage = "/api/og-image";
  return {
    title: "tradingfees.wtf",
    description:
      "See how much you're paying in trading fees. Compare Hyperliquid fees to Lighter, Binance, and Bybit.",
    openGraph: {
      title: "tradingfees.wtf",
      description:
        "See how much you're paying in trading fees. Compare Hyperliquid fees to Lighter, Binance, and Bybit.",
      images: [
        {
          url: defaultOgImage,
          width: 1200,
          height: 630,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "tradingfees.wtf",
      description:
        "See how much you're paying in trading fees. Compare Hyperliquid fees to Lighter, Binance, and Bybit.",
      images: [defaultOgImage],
    },
  };
}

export default function Page() {
  return <App />;
}
