import type { Metadata } from "next";
import "@/styles.css";
import "./execution.css";

export const SITE_URL = (process.env.SITE_URL ?? "https://tradingfees.wtf").replace(/\/$/, "");

/** Absolute base for the share-image URLs in page metadata. */
export const layoutMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

/** Applies the saved theme before first paint (the toggle keeps it in sync after). */
const THEME_SCRIPT =
  "try{var t=localStorage.getItem('tfw_theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}";

export function ExecutionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      {children}
    </>
  );
}
