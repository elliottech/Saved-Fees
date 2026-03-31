import type { Metadata } from "next";
import { headers } from "next/headers";
import App from "@/App";
import "@/styles.css";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function getBaseUrl(headersList: Headers): string {
  const host = headersList.get("x-forwarded-host") || headersList.get("host") || "howmuchfeeipaid.wtf";
  const proto = headersList.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const headersList = await headers();
  const baseUrl = getBaseUrl(headersList);

  const address =
    typeof params.address === "string" ? params.address.trim().toLowerCase() : "";
  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(address);

  if (isValidAddress) {
    const ogImageUrl = `${baseUrl}/api/og-image?address=${encodeURIComponent(address)}`;
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

  const defaultOgImage = `${baseUrl}/api/og-image`;
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
