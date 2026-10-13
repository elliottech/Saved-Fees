"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Same storage key as the fee calculator, so the theme follows the visitor across pages. */
export function ThemeToggle() {
  // null until the saved choice is read, so the default never overwrites it.
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("tfw_theme");
    } catch {}
    setTheme(saved === "dark" ? "dark" : "light");
  }, []);
  useEffect(() => {
    if (!theme) return;
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("tfw_theme", theme);
    } catch {}
  }, [theme]);
  return (
    <button
      className="theme-switch"
      type="button"
      title="Switch theme"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      <span>{theme === "dark" ? "light" : "dark"}</span>
    </button>
  );
}

/** Address → wallet page; anything else searches public names. */
export function WalletSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ term: string; hits: { name: string; address: string }[] }>({
    term: "",
    hits: [],
  });
  const [error, setError] = useState("");
  const term = q.trim();
  const hits = result.term === term ? result.hits : [];

  useEffect(() => {
    if (term.length < 2 || term.startsWith("0x")) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/execution/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        setResult({ term, hits: res.ok ? await res.json() : [] });
      } catch {
        if (!ctrl.signal.aborted) setResult({ term, hits: [] });
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [term]);

  const go = () => {
    if (ADDRESS_RE.test(term)) {
      router.push(`/wallet/${term.toLowerCase()}`);
    } else if (hits.length) {
      router.push(`/wallet/${hits[0].address}`);
    } else {
      setError("Enter a full 0x address or a public name");
    }
  };

  return (
    <div className="ex-search">
      <div className="input-row">
        <input
          id="address-input"
          type="text"
          placeholder="0x… address or name"
          aria-label="Wallet address or public name"
          spellCheck={false}
          autoComplete="off"
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") go();
          }}
        />
        <button className="search-btn" type="button" onClick={go}>
          look up
        </button>
      </div>
      {error && <p className="hint error">{error}</p>}
      {hits.length > 0 && (
        <ul className="ex-search-hits">
          {hits.map((h) => (
            <li key={h.address}>
              <a href={`/wallet/${h.address}`}>
                <span>{h.name}</span>
                <span className="ex-muted">{`${h.address.slice(0, 6)}…${h.address.slice(-4)}`}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A <select> that navigates on change (window / coin pickers). */
export function NavSelect({
  value,
  options,
  label,
}: {
  value: string;
  options: { value: string; label: string; href: string }[];
  label: string;
}) {
  const router = useRouter();
  return (
    <label className="ex-select">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => {
          const opt = options.find((o) => o.value === e.target.value);
          if (opt) router.push(opt.href);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CopyLink({ text = "copy link" }: { text?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="action-btn ex-small-btn"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? "copied" : text}
    </button>
  );
}
