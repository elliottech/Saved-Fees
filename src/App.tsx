import { useState, useRef, useCallback, useEffect } from "react";
import {
  analyzeFees,
  simulateFees,
  filterFillsByWindow,
  type AnalyzeResult,
  type ExchangeComparison,
} from "./fees";
import {
  fetchUserFees,
  fetchPortfolio,
  fetchSpotMeta,
  fetchAllFills,
} from "./hyperliquid";

// ── Formatting helpers ─────────────────────────────────────────────────────
function formatUSDFull(val: number | null | undefined): string {
  if (val == null) return "$0.00";
  const sign = val < 0 ? "-" : "";
  return (
    sign +
    "$" +
    Math.abs(val).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatVolume(val: number | null | undefined): string {
  if (val == null) return "$0";
  if (val >= 1_000_000_000) return "$" + (val / 1_000_000_000).toFixed(2) + "B";
  if (val >= 1_000_000) return "$" + (val / 1_000_000).toFixed(2) + "M";
  if (val >= 1_000) return "$" + (val / 1_000).toFixed(1) + "K";
  return "$" + val.toFixed(0);
}

function formatPct(val: number): string {
  return (val * 100).toFixed(1) + "%";
}

function formatBps(val: number | undefined): string {
  const bps = (val || 0) * 10000;
  const rounded = Math.round(bps * 100) / 100;
  return (
    rounded.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }) + " bps"
  );
}

function formatNum(val: number): string {
  return val.toLocaleString("en-US");
}

function isValidAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

const VALID_THEMES = ["light", "dark"] as const;
const VALID_WINDOWS = ["all", "7d", "30d", "90d", "1yr"] as const;
type Theme = (typeof VALID_THEMES)[number];
type TimeWindow = (typeof VALID_WINDOWS)[number];

function getThemePalette() {
  const styles = getComputedStyle(document.documentElement);
  const readVar = (name: string) => styles.getPropertyValue(name).trim();
  return {
    bg: readVar("--bg"),
    bgSurface: readVar("--bg-surface"),
    bgInput: readVar("--bg-input"),
    border: readVar("--border"),
    radius: readVar("--radius"),
    text: readVar("--text"),
    textDim: readVar("--text-dim"),
    textMuted: readVar("--text-muted"),
    green: readVar("--green"),
    red: readVar("--red"),
    lighter: readVar("--lighter"),
    hyperliquid: readVar("--hyperliquid"),
    binance: readVar("--binance"),
    bybit: readVar("--bybit"),
    glassStart: readVar("--glass-start"),
    glassEnd: readVar("--glass-end"),
  };
}

// ── Share image helpers ────────────────────────────────────────────────────
function buildExportFrame(
  contentEl: HTMLElement,
  options: { outerPadding?: number; innerPadding?: number } = {}
): HTMLElement {
  const theme = getThemePalette();
  const outerPadding = options.outerPadding || 26;
  const innerPadding = options.innerPadding || 24;

  const outer = document.createElement("div");
  outer.style.cssText = `
    display:inline-block;
    background:${theme.bg};
    padding:${outerPadding}px;
    border-radius:${theme.radius};
  `;

  const frame = document.createElement("div");
  frame.style.cssText = `
    background:linear-gradient(135deg, ${theme.glassStart} 0%, ${theme.glassEnd} 100%);
    border:1px solid ${theme.border};
    border-radius:${theme.radius};
    padding:${innerPadding}px;
    box-shadow:0 18px 48px rgba(0, 0, 0, 0.18);
  `;

  frame.appendChild(contentEl);
  outer.appendChild(frame);
  return outer;
}

async function renderExportCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  el.style.position = "fixed";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  try {
    return await window.html2canvas(el, {
      backgroundColor: getThemePalette().bg,
      scale: 2,
      useCORS: true,
      logging: false,
    });
  } finally {
    document.body.removeChild(el);
  }
}

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("failed to generate image"));
    }, "image/png");
  });
}

async function exportImage(buildImage: () => HTMLElement): Promise<Blob> {
  const el = buildImage();
  const canvas = await renderExportCanvas(el);
  return blobFromCanvas(canvas);
}

async function copyImage(buildImage: () => HTMLElement): Promise<void> {
  const blob = await exportImage(buildImage);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

async function downloadImage(
  buildImage: () => HTMLElement,
  filename: string
): Promise<void> {
  const blob = await exportImage(buildImage);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ── Overview image builder ──────────────────────────────────────────────────
function buildOverviewImage(d: AnalyzeResult): HTMLElement {
  const theme = getThemePalette();
  const hl = d.hyperliquid!;
  const exchanges = [
    { name: "Lighter", color: theme.lighter, data: d.comparisons!.lighter, key: "lighter" },
    { name: "Binance", color: theme.binance, data: d.comparisons!.binance, key: "binance" },
    { name: "Bybit", color: theme.bybit, data: d.comparisons!.bybit, key: "bybit" },
  ];

  function exchDiff(exch: ExchangeComparison, key: string): string {
    if (key === "lighter")
      return `<span style="color:${theme.green}">${formatUSDFull(exch.savings_vs_hl)} saved</span>`;
    const diff = exch.diff_vs_hl ?? 0;
    if (diff > 0)
      return `<span style="color:${theme.red}">Hyperliquid +${formatUSDFull(diff)}</span>`;
    if (diff < 0)
      return `<span style="color:${theme.green}">Hyperliquid -${formatUSDFull(Math.abs(diff))}</span>`;
    return `<span style="color:${theme.textMuted}">same</span>`;
  }

  let exchHTML = "";
  for (let i = 0; i < exchanges.length; i++) {
    const ex = exchanges[i]!;
    const sep =
      i < exchanges.length - 1
        ? `border-right:1px solid ${theme.border};padding-right:16px;margin-right:16px;`
        : "";
    exchHTML += `
      <div style="flex:1;${sep}">
        <div style="font-size:11px;font-weight:700;color:${ex.color};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">${ex.name}</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:4px;font-variant-numeric:tabular-nums;color:${theme.text}">${formatUSDFull(ex.data.total_fees)}</div>
        <div style="font-size:10px;color:${theme.textMuted};margin-bottom:6px;white-space:nowrap">taker: ${formatBps(ex.data.taker_rate)} &middot; maker: ${formatBps(ex.data.maker_rate)}</div>
        <div style="font-size:11px;font-weight:600">${exchDiff(ex.data, ex.key)}</div>
      </div>
    `;
  }

  const content = document.createElement("div");
  content.style.cssText = `
    width: 620px;
    font-family: 'JetBrains Mono', monospace;
    color: ${theme.text};
  `;
  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div style="font-size:10px;font-weight:500;color:${theme.textMuted};text-transform:uppercase;letter-spacing:0.1em">total fees paid on hyperliquid</div>
      <div style="font-size:10px;color:${theme.textMuted};letter-spacing:0.08em">tradingfees.wtf</div>
    </div>
    <div style="font-size:30px;font-weight:800;letter-spacing:-0.03em;line-height:1">${formatUSDFull(hl.total_fees_paid)}</div>
    <div style="font-size:11px;color:${theme.textDim};margin-top:8px;margin-bottom:20px">${formatVolume(d.summary!.total_volume)} volume across ${formatNum(d.summary!.total_trades)} trades</div>
    <div style="font-size:10px;font-weight:500;color:${theme.textMuted};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px">The same activity would have cost you:</div>
    <div style="border-top:1px solid ${theme.border};padding-top:16px;display:flex">
      ${exchHTML}
    </div>
  `;
  return buildExportFrame(content);
}

// ── Bar chart image builder ──────────────────────────────────────────────────
function getBarItems(d: AnalyzeResult) {
  return [
    { label: "Hyperliquid", fees: d.hyperliquid!.total_fees_paid, color: "#50e3c2" },
    { label: "Binance", fees: d.comparisons!.binance.total_fees, color: "#f0b90b" },
    { label: "Bybit", fees: d.comparisons!.bybit.total_fees, color: "#f7a600" },
    { label: "Lighter", fees: 0, color: "#4a7aff" },
  ].sort((a, b) => a.fees - b.fees);
}

function buildBarChartImage(d: AnalyzeResult): HTMLElement {
  const theme = getThemePalette();
  const items = getBarItems(d);
  const maxFees = Math.max(...items.map((i) => i.fees), 1);
  const vol = formatVolume(d.summary!.total_volume);
  const trades = formatNum(d.summary!.total_trades);
  const days = Math.round(d.summary!.trading_days);

  const content = document.createElement("div");
  content.style.cssText = `
    width: 620px;
    font-family: 'JetBrains Mono', monospace;
    color: ${theme.text};
  `;

  let barsHTML = "";
  for (const item of items) {
    const pct = Math.max((item.fees / maxFees) * 100, 1);
    barsHTML += `
      <div style="display:flex;align-items:center;margin-bottom:10px">
        <div style="width:100px;font-size:12px;font-weight:600;color:${item.color};flex-shrink:0">${item.label}</div>
        <div style="flex:1;height:28px;background:${theme.bgInput};border-radius:4px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${item.color};opacity:0.65;border-radius:4px"></div>
        </div>
        <div style="width:100px;text-align:right;font-size:12px;font-weight:600;padding-left:12px;font-variant-numeric:tabular-nums;color:${theme.textDim}">${formatUSDFull(item.fees)}</div>
      </div>
    `;
  }

  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div style="font-size:12px;font-weight:600;color:${theme.textMuted};text-transform:uppercase;letter-spacing:0.1em">fee comparison</div>
      <div style="font-size:10px;color:${theme.textMuted};letter-spacing:0.08em">tradingfees.wtf</div>
    </div>
    ${barsHTML}
    <div style="border-top:1px solid ${theme.border};margin-top:8px;padding-top:12px;display:flex;justify-content:space-between;font-size:10px;color:${theme.textMuted}">
      <span>Volume: ${vol}</span>
      <span>${trades} trades</span>
      <span>${days} days</span>
    </div>
  `;
  return buildExportFrame(content);
}

// ── Share menu icons ──────────────────────────────────────────────────────
const DownloadIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

const CopyIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ShareIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.59 13.51 15.42 17.49" />
    <path d="M15.41 6.51 8.59 10.49" />
  </svg>
);

// ── ShareControls component ──────────────────────────────────────────────
function ShareControls({
  id,
  isOpen,
  onToggle,
  onDownload,
  onCopy,
}: {
  id: string;
  isOpen: boolean;
  onToggle: () => void;
  onDownload: () => void;
  onCopy: () => void;
}) {
  return (
    <div className={`share-controls ${isOpen ? "is-open" : ""}`}>
      <div
        className="share-action-list"
        aria-hidden={!isOpen}
      >
        <button
          className="share-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          title="Download image"
          aria-label="Download image"
          type="button"
        >
          <DownloadIcon />
        </button>
        <button
          className="share-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
          title="Copy image"
          aria-label="Copy image"
          type="button"
        >
          <CopyIcon />
        </button>
      </div>
      <button
        className="copy-icon-btn"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        title="Share image"
        aria-expanded={isOpen}
        aria-label="Share image"
        type="button"
      >
        <ShareIcon />
      </button>
    </div>
  );
}

// ── ExchDiff component ──────────────────────────────────────────────────────
function ExchDiffDisplay({
  exch,
  exchKey,
}: {
  exch: ExchangeComparison;
  exchKey: string;
}) {
  if (exchKey === "lighter") {
    return (
      <div className="overview-exch-diff diff-positive">
        {formatUSDFull(exch.savings_vs_hl)} saved
      </div>
    );
  }
  const diff = exch.diff_vs_hl ?? 0;
  if (diff > 0)
    return (
      <div className="overview-exch-diff diff-negative">
        Hyperliquid cost {formatUSDFull(diff)} more
      </div>
    );
  if (diff < 0)
    return (
      <div className="overview-exch-diff diff-positive">
        Hyperliquid saved {formatUSDFull(Math.abs(diff))}
      </div>
    );
  return (
    <div className="overview-exch-diff" style={{ color: "var(--text-dim)" }}>
      same cost
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("tfw_theme");
    return VALID_THEMES.includes(saved as Theme) ? (saved as Theme) : "light";
  });
  const [currentWindow, setCurrentWindow] = useState<TimeWindow>(() => {
    const saved = localStorage.getItem("tfw_window");
    return VALID_WINDOWS.includes(saved as TimeWindow) ? (saved as TimeWindow) : "all";
  });
  const [address, setAddress] = useState("");
  const [data, setData] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("fetching trades...");
  const [loadingSub, setLoadingSub] = useState("this may take a moment for active traders");
  const [hint, setHint] = useState<{ msg: string; type: string } | null>(null);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [simulateVolume, setSimulateVolume] = useState("");
  const [simulateMix, setSimulateMix] = useState(50);
  const [currentMode, setCurrentMode] = useState<"analyze" | "simulate">("analyze");
  const [openShareMenu, setOpenShareMenu] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const shareToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("tfw_theme", theme);
  }, [theme]);

  // Save window preference
  useEffect(() => {
    localStorage.setItem("tfw_window", currentWindow);
  }, [currentWindow]);

  // Close share menus on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".share-controls")) {
        setOpenShareMenu(null);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Check URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preAddr = params.get("address");
    const preWindow = params.get("window");
    if (VALID_WINDOWS.includes(preWindow as TimeWindow)) {
      setCurrentWindow(preWindow as TimeWindow);
    }
    if (preAddr && isValidAddress(preAddr)) {
      setAddress(preAddr);
      // Trigger analyze after mount
      setTimeout(() => {
        runAnalyze(preAddr, preWindow && VALID_WINDOWS.includes(preWindow as TimeWindow) ? (preWindow as TimeWindow) : currentWindow);
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showShareToastMsg = useCallback((msg: string) => {
    setShareToast(msg);
    if (shareToastTimer.current) clearTimeout(shareToastTimer.current);
    shareToastTimer.current = setTimeout(() => setShareToast(null), 2200);
  }, []);

  const runAnalyze = useCallback(
    async (addr?: string, win?: TimeWindow) => {
      const targetAddress = addr ?? address;
      const targetWindow = win ?? currentWindow;
      if (!isValidAddress(targetAddress)) {
        setHint({ msg: "enter a valid address (0x followed by 40 hex characters)", type: "error" });
        return;
      }
      setHint(null);
      setLoading(true);
      setLoadingText("fetching trades...");
      setLoadingSub("this may take a moment for active traders");
      setCurrentMode("analyze");

      try {
        const [userFeesData, portfolioData, fillsData, spotMeta] = await Promise.all([
          fetchUserFees(targetAddress),
          fetchPortfolio(targetAddress),
          fetchAllFills(targetAddress, (count) => {
            setLoadingText(`fetched ${count.toLocaleString()} trades...`);
          }),
          fetchSpotMeta(),
        ]);

        const filteredFills = filterFillsByWindow(fillsData.fills, targetWindow);
        const filteredFillsData = { ...fillsData, fills: filteredFills };

        const result = analyzeFees(
          userFeesData,
          portfolioData,
          filteredFillsData,
          spotMeta,
          targetAddress,
          targetWindow
        );
        result.window = targetWindow;

        if (result.error) {
          setLoading(false);
          setHint({ msg: result.error, type: "error" });
          return;
        }

        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.set("address", targetAddress);
        url.searchParams.set("window", targetWindow);
        url.searchParams.delete("mode");
        window.history.replaceState(null, "", url.toString());

        setData(result);
        setLoading(false);
      } catch (e) {
        setLoading(false);
        setHint({ msg: (e as Error).message, type: "error" });
      }
    },
    [address, currentWindow]
  );

  const runSimulation = useCallback(() => {
    const raw = simulateVolume.replace(/,/g, "").replace(/[^\d.]/g, "");
    const estimatedVolume = Number(raw);
    const takerRatio = simulateMix / 100;

    if (!Number.isFinite(estimatedVolume) || estimatedVolume <= 0) {
      setHint({ msg: "enter an estimated volume greater than 0", type: "error" });
      return;
    }
    setHint(null);
    setLoading(true);
    setLoadingText("running simulation...");
    setLoadingSub("");
    setCurrentMode("simulate");

    const result = simulateFees(estimatedVolume, takerRatio, currentWindow);
    result.window = currentWindow;

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.delete("address");
    url.searchParams.set("window", currentWindow);
    url.searchParams.set("mode", "simulate");
    window.history.replaceState(null, "", url.toString());

    setData(result);
    setLoading(false);
  }, [simulateVolume, simulateMix, currentWindow]);

  const handleWindowChange = useCallback(
    (newWindow: TimeWindow) => {
      setCurrentWindow(newWindow);
      if (data) {
        if (currentMode === "simulate") {
          // Re-run simulation with new window (need to schedule after state update)
          setTimeout(() => {
            const raw = simulateVolume.replace(/,/g, "").replace(/[^\d.]/g, "");
            const estimatedVolume = Number(raw);
            if (Number.isFinite(estimatedVolume) && estimatedVolume > 0) {
              const takerRatio = simulateMix / 100;
              const result = simulateFees(estimatedVolume, takerRatio, newWindow);
              result.window = newWindow;
              setData(result);
            }
          }, 0);
        } else {
          runAnalyze(undefined, newWindow);
        }
      }
    },
    [data, currentMode, simulateVolume, simulateMix, runAnalyze]
  );

  const formatSimulateVolume = (val: string) => {
    const raw = val.replace(/,/g, "").replace(/[^\d]/g, "");
    if (!raw) {
      setSimulateVolume("");
      return;
    }
    setSimulateVolume(Number(raw).toLocaleString("en-US"));
  };

  const takerPct = simulateMix;
  const makerPct = 100 - simulateMix;

  const isSimulation = data?.mode === "simulate";

  return (
    <>
      <div className="page">
        {/* Header */}
        <header>
          <div className="header-row">
            <h1>tradingfees.wtf</h1>
            <button
              className="theme-switch"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title="Switch theme"
              type="button"
            >
              <span>{theme === "light" ? "dark" : "light"}</span>
            </button>
          </div>
          <p className="subtitle">
            enter your hyperliquid address to see how much you're paying in fees
          </p>
        </header>

        {/* Input */}
        <section className="input-section">
          <div className="input-row">
            <input
              type="text"
              id="address-input"
              placeholder="0x..."
              spellCheck={false}
              autoComplete="off"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runAnalyze();
              }}
            />
            <button
              className="action-btn"
              type="button"
              onClick={() => setSimulateOpen(!simulateOpen)}
            >
              {simulateOpen ? "Hide" : "Simulate"}
            </button>
            <button
              className="search-btn"
              type="button"
              onClick={() => runAnalyze()}
            >
              Search
            </button>
            <select
              id="time-window"
              aria-label="Select time window"
              value={currentWindow}
              onChange={(e) =>
                handleWindowChange(e.target.value as TimeWindow)
              }
            >
              <option value="all">All</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="1yr">1 year</option>
            </select>
          </div>

          {hint && (
            <p className={`hint ${hint.type}`}>{hint.msg}</p>
          )}

          {simulateOpen && (
            <div className="simulate-panel">
              <div className="simulate-panel-title">simulate activity</div>
              <div className="simulate-grid">
                <div className="simulate-field simulate-field-full">
                  <div className="simulate-label-row">
                    <span className="simulate-label">Order Mix</span>
                    <span className="simulate-mix-readout">
                      {takerPct}% taker / {makerPct}% maker
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={simulateMix}
                    onChange={(e) => setSimulateMix(Number(e.target.value))}
                  />
                  <div className="simulate-range-labels">
                    <span>maker-heavy</span>
                    <span>taker-heavy</span>
                  </div>
                </div>
                <label className="simulate-field">
                  <span className="simulate-label">Estimated Volume</span>
                  <span className="simulate-input-wrap">
                    <span className="simulate-input-prefix">$</span>
                    <input
                      type="text"
                      id="simulate-volume"
                      inputMode="numeric"
                      placeholder="1,000,000"
                      autoComplete="off"
                      value={simulateVolume}
                      onChange={(e) => formatSimulateVolume(e.target.value)}
                    />
                  </span>
                </label>
                <div className="simulate-actions">
                  <button
                    className="search-btn"
                    type="button"
                    onClick={runSimulation}
                  >
                    Run Simulation
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Loading */}
        {loading && (
          <section className="loading-section">
            <div className="loader-bar" />
            <p className="loading-text">{loadingText}</p>
            <p className="loading-sub">{loadingSub}</p>
          </section>
        )}

        {/* Results */}
        {!loading && data && data.summary && data.hyperliquid && data.comparisons && (
          <section className="results">
            {/* Fees Overview */}
            <div className="section-block" style={{ position: "relative" }}>
              <ShareControls
                id="overview"
                isOpen={openShareMenu === "overview"}
                onToggle={() =>
                  setOpenShareMenu(openShareMenu === "overview" ? null : "overview")
                }
                onDownload={async () => {
                  try {
                    await downloadImage(() => buildOverviewImage(data), "tradingfees-overview.png");
                    setOpenShareMenu(null);
                  } catch (e) {
                    setHint({ msg: "unable to download image", type: "error" });
                  }
                }}
                onCopy={async () => {
                  try {
                    await copyImage(() => buildOverviewImage(data));
                    setOpenShareMenu(null);
                    showShareToastMsg("image copied");
                  } catch (e) {
                    setHint({ msg: "unable to copy image", type: "error" });
                  }
                }}
              />
              <div className="overview-hero">
                <div className="overview-label">Total fees paid on Hyperliquid</div>
                <div className="overview-amount">
                  {formatUSDFull(data.hyperliquid.total_fees_paid)}
                </div>
                <div className="overview-sub">
                  {formatVolume(data.summary.total_volume)} volume across{" "}
                  {formatNum(data.summary.total_trades)} trades
                </div>
                {data.history_notice?.estimated && !isSimulation && (
                  <div className="history-note">
                    <span>part of this history was estimated</span>
                    <button
                      className="history-note-tip"
                      type="button"
                      title={data.history_notice.message}
                      aria-label={data.history_notice.message}
                    >
                      i
                    </button>
                  </div>
                )}
                {isSimulation && data.history_notice?.estimated && (
                  <div className="history-note">
                    <span>simulation estimate</span>
                  </div>
                )}
              </div>
              <div className="overview-grid">
                <div className="overview-grid-label">
                  The same activity would have cost you:
                </div>
                {(
                  [
                    { key: "lighter", color: "var(--lighter)", data: data.comparisons.lighter },
                    { key: "binance", color: "var(--binance)", data: data.comparisons.binance },
                    { key: "bybit", color: "var(--bybit)", data: data.comparisons.bybit },
                  ] as const
                ).map((exch) => (
                  <div className="overview-exch" key={exch.key}>
                    <div className="overview-exch-name" style={{ color: exch.color }}>
                      {exch.key}
                    </div>
                    <div className="overview-exch-fees">
                      {formatUSDFull(exch.data.total_fees)}
                    </div>
                    <div className="overview-exch-rates">
                      taker: {formatBps(exch.data.taker_rate)} &middot; maker:{" "}
                      {formatBps(exch.data.maker_rate)}
                    </div>
                    <ExchDiffDisplay exch={exch.data} exchKey={exch.key} />
                  </div>
                ))}
              </div>
            </div>

            {/* Bar Chart */}
            <div className="section-block" style={{ position: "relative" }}>
              <div className="section-label">fee comparison</div>
              <ShareControls
                id="bar-chart"
                isOpen={openShareMenu === "bar-chart"}
                onToggle={() =>
                  setOpenShareMenu(
                    openShareMenu === "bar-chart" ? null : "bar-chart"
                  )
                }
                onDownload={async () => {
                  try {
                    await downloadImage(
                      () => buildBarChartImage(data),
                      "tradingfees-comparison.png"
                    );
                    setOpenShareMenu(null);
                  } catch (e) {
                    setHint({ msg: "unable to download image", type: "error" });
                  }
                }}
                onCopy={async () => {
                  try {
                    await copyImage(() => buildBarChartImage(data));
                    setOpenShareMenu(null);
                    showShareToastMsg("image copied");
                  } catch (e) {
                    setHint({ msg: "unable to copy image", type: "error" });
                  }
                }}
              />
              <div>
                {getBarItems(data).map((item) => {
                  const maxFees = Math.max(
                    ...getBarItems(data).map((i) => i.fees),
                    1
                  );
                  const pct = (item.fees / maxFees) * 100;
                  return (
                    <div className="bar-row" key={item.label}>
                      <div className="bar-label" style={{ color: item.color }}>
                        {item.label}
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${Math.max(pct, 0.5)}%`,
                            background: item.color,
                            opacity: 0.65,
                          }}
                        />
                      </div>
                      <div className="bar-value">{formatUSDFull(item.fees)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* HL Details */}
            <div className="section-block">
              <div className="section-label">Hyperliquid fee details</div>
              <div className="hl-grid">
                <div className="hl-cell">
                  <div className="hl-cell-label">fee tier</div>
                  <div className="hl-cell-value">{data.hyperliquid.tier}</div>
                </div>
                <div className="hl-cell">
                  <div className="hl-cell-label">taker rate</div>
                  <div className="hl-cell-value">
                    {formatBps(data.hyperliquid.effective_taker_rate)}
                  </div>
                </div>
                <div className="hl-cell">
                  <div className="hl-cell-label">maker rate</div>
                  <div className="hl-cell-value">
                    {formatBps(data.hyperliquid.effective_maker_rate)}
                  </div>
                </div>
                <div className="hl-cell">
                  <div className="hl-cell-label">taker orders</div>
                  <div className="hl-cell-value">
                    {formatPct(data.summary.taker_ratio)}
                  </div>
                </div>
                <div className="hl-cell">
                  <div className="hl-cell-label">maker orders</div>
                  <div className="hl-cell-value">
                    {formatPct(data.summary.maker_ratio)}
                  </div>
                </div>
                <div className="hl-cell">
                  <div className="hl-cell-label">blended rate</div>
                  <div className="hl-cell-value">
                    {formatBps(
                      data.summary.maker_ratio * data.hyperliquid.effective_maker_rate +
                        data.summary.taker_ratio * data.hyperliquid.effective_taker_rate
                    )}
                  </div>
                </div>
                <div className="hl-cell">
                  <div className="hl-cell-label">staking</div>
                  <div className="hl-cell-value">
                    {data.hyperliquid.staking_tier !== "None"
                      ? `${data.hyperliquid.staking_tier} (${(data.hyperliquid.staking_discount * 100).toFixed(0)}% off)`
                      : "none"}
                  </div>
                </div>
                <div className="hl-cell">
                  <div className="hl-cell-label">referral</div>
                  <div className="hl-cell-value">
                    {data.hyperliquid.referral_discount > 0
                      ? `${(data.hyperliquid.referral_discount * 100).toFixed(0)}% off`
                      : "none"}
                  </div>
                </div>
                <div className="hl-cell">
                  <div className="hl-cell-label">total fees</div>
                  <div
                    className="hl-cell-value"
                    style={{ color: "var(--hyperliquid)" }}
                  >
                    {formatUSDFull(data.hyperliquid.total_fees_paid)}
                  </div>
                </div>
              </div>
              {!isSimulation && data.history_notice?.estimated && (
                <div className="history-note history-note-inline">
                  <span>includes an estimate for unfetchable older history</span>
                  <button
                    className="history-note-tip"
                    type="button"
                    title={data.history_notice.message}
                    aria-label={data.history_notice.message}
                  >
                    i
                  </button>
                </div>
              )}
            </div>

            {/* Top Coins */}
            {!isSimulation && data.top_coins.length > 0 && (
              <div className="section-block">
                <div className="section-label">Top Traded Assets</div>
                <div className="coins-table-wrap">
                  <table className="coins-table">
                    <thead>
                      <tr>
                        <th>asset</th>
                        <th>volume</th>
                        <th>fees</th>
                        <th>trades</th>
                        <th>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const totalVol = data.top_coins.reduce(
                          (s, c) => s + c.volume,
                          0
                        );
                        return data.top_coins.map((c) => {
                          const pct =
                            totalVol > 0
                              ? ((c.volume / totalVol) * 100).toFixed(1)
                              : "0.0";
                          return (
                            <tr key={c.coin}>
                              <td>
                                <span className="coin-name">{c.coin}</span>
                              </td>
                              <td>{formatVolume(c.volume)}</td>
                              <td>{formatUSDFull(c.fees)}</td>
                              <td>{formatNum(c.trades)}</td>
                              <td>{pct}%</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        <footer>
          <span>
            data from{" "}
            <a href="https://hyperliquid.xyz" target="_blank" rel="noreferrer">
              hyperliquid
            </a>
          </span>
        </footer>
      </div>

      <div
        className={`share-toast ${shareToast ? "is-visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {shareToast}
      </div>
    </>
  );
}
