import type { Metadata } from "next";
import "@/styles.css";
import "@/execution/execution.css";

/** Absolute base for the share-image URLs in page metadata. */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://tradingfees.wtf"),
};

/** Applies the saved theme before first paint (the toggle keeps it in sync after). */
const THEME_SCRIPT =
  "try{var t=localStorage.getItem('tfw_theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      {children}
    </>
  );
}
