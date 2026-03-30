(function () {
    "use strict";

    // ── DOM refs ────────────────────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);
    const addressInput = $("address-input");
    const simulateToggleBtn = $("simulate-toggle-btn");
    const simulatePanel = $("simulate-panel");
    const simulateVolumeInput = $("simulate-volume");
    const simulateMixInput = $("simulate-mix");
    const simulateMixReadout = $("simulate-mix-readout");
    const runSimulateBtn = $("run-simulate-btn");
    const timeWindowSelect = $("time-window");
    const analyzeBtn = $("analyze-btn");
    const loadingSection = $("loading-section");
    const resultsSection = $("results-section");
    const hlDetailsCard = $("hl-details");
    const coinsCard = $("coins-card");
    const hint = $("hint");
    const themeSwitch = $("theme-switch");
    const themeSwitchLabel = $("theme-switch-label");
    const shareToast = $("share-toast");

    let data = null;
    let currentMode = "analyze";
    let shareToastTimer = null;
    let openShareMenu = null;
    const VALID_THEMES = ["light", "dark"];
    const VALID_WINDOWS = ["all", "7d", "30d", "90d", "1yr"];
    const saved = localStorage.getItem("tfw_theme");
    const savedWindow = localStorage.getItem("tfw_window");
    let currentTheme = VALID_THEMES.includes(saved) ? saved : "light";
    let currentWindow = VALID_WINDOWS.includes(savedWindow) ? savedWindow : "all";

    // ── Theme ───────────────────────────────────────────────────────────────
    function applyTheme(t) {
        currentTheme = t;
        document.documentElement.setAttribute("data-theme", t);
        themeSwitchLabel.textContent = t === "light" ? "dark" : "light";
        localStorage.setItem("tfw_theme", t);
    }
    themeSwitch.addEventListener("click", () => {
        applyTheme(currentTheme === "light" ? "dark" : "light");
    });
    applyTheme(currentTheme);

    // ── Helpers ─────────────────────────────────────────────────────────────
    function formatUSDFull(val) {
        if (val == null) return "$0.00";
        const sign = val < 0 ? "-" : "";
        return sign + "$" + Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatVolume(val) {
        if (val == null) return "$0";
        if (val >= 1_000_000_000) return "$" + (val / 1_000_000_000).toFixed(2) + "B";
        if (val >= 1_000_000) return "$" + (val / 1_000_000).toFixed(2) + "M";
        if (val >= 1_000) return "$" + (val / 1_000).toFixed(1) + "K";
        return "$" + val.toFixed(0);
    }

    function formatPct(val) { return (val * 100).toFixed(1) + "%"; }
    function formatBps(val) {
        const bps = (val || 0) * 10000;
        const rounded = Math.round(bps * 100) / 100;
        return rounded.toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }) + " bps";
    }
    function formatNum(val) { return val.toLocaleString("en-US"); }

    function formatDate(ms) {
        return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    function showHint(msg, type) {
        hint.textContent = msg;
        hint.className = "hint " + (type || "");
    }

    function clearHint() {
        hint.textContent = "";
        hint.className = "hint";
    }

    function showShareToast(message) {
        if (!shareToast) return;
        shareToast.textContent = message;
        shareToast.classList.add("is-visible");
        clearTimeout(shareToastTimer);
        shareToastTimer = setTimeout(() => {
            shareToast.classList.remove("is-visible");
        }, 2200);
    }

    function updateSimulateMixReadout() {
        const takerPct = Number(simulateMixInput.value || 0);
        const makerPct = 100 - takerPct;
        simulateMixReadout.textContent = `${takerPct}% taker / ${makerPct}% maker`;
    }

    function parseSimulateVolumeInput() {
        const raw = simulateVolumeInput.value.replace(/,/g, "").replace(/[^\d.]/g, "");
        return Number(raw);
    }

    function formatSimulateVolumeInput() {
        const raw = simulateVolumeInput.value.replace(/,/g, "").replace(/[^\d]/g, "");
        if (!raw) {
            simulateVolumeInput.value = "";
            return;
        }
        simulateVolumeInput.value = Number(raw).toLocaleString("en-US");
    }

    function setSimulationPanelOpen(isOpen) {
        simulatePanel.style.display = isOpen ? "" : "none";
        simulateToggleBtn.textContent = isOpen ? "Hide" : "Simulate";
    }

    function applyTimeWindow(windowKey) {
        currentWindow = VALID_WINDOWS.includes(windowKey) ? windowKey : "all";
        timeWindowSelect.value = currentWindow;
        localStorage.setItem("tfw_window", currentWindow);
    }

    function getThemePalette() {
        const styles = getComputedStyle(document.documentElement);
        const readVar = (name) => styles.getPropertyValue(name).trim();
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

    function buildExportFrame(contentEl, options = {}) {
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

    function blobFromCanvas(canvas) {
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

    async function renderExportCanvas(el) {
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);

        try {
            return await html2canvas(el, { backgroundColor: getThemePalette().bg, scale: 2, useCORS: true, logging: false });
        } finally {
            document.body.removeChild(el);
        }
    }

    function isValidAddress(addr) {
        return /^0x[a-fA-F0-9]{40}$/.test(addr);
    }

    function setShareMenuOpen(menuKey) {
        const menus = [
            { key: "overview", actionsEl: $("overview-share-actions"), controlsEl: $("overview-share-controls"), toggleEl: $("toggle-overview-share") },
            { key: "bar-chart", actionsEl: $("bar-chart-share-actions"), controlsEl: $("bar-chart-share-controls"), toggleEl: $("toggle-bar-chart-share") },
        ];
        openShareMenu = menuKey;
        for (const menu of menus) {
            const isOpen = menu.key === menuKey;
            menu.controlsEl.classList.toggle("is-open", isOpen);
            menu.actionsEl.setAttribute("aria-hidden", isOpen ? "false" : "true");
            menu.toggleEl.setAttribute("aria-expanded", isOpen ? "true" : "false");
        }
    }

    function closeShareMenus() {
        openShareMenu = null;
        setShareMenuOpen(null);
    }

    async function exportImage(buildImage) {
        const el = buildImage();
        const canvas = await renderExportCanvas(el);
        return blobFromCanvas(canvas);
    }

    async function copyImage(buildImage, button) {
        const blob = await exportImage(buildImage);
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        if (button) {
            button.classList.add("copied");
            setTimeout(() => button.classList.remove("copied"), 1500);
        }
        showShareToast("image copied");
    }

    async function downloadImage(buildImage, filename) {
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

    // ── Analyze ─────────────────────────────────────────────────────────────
    addressInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") analyze();
    });
    analyzeBtn.addEventListener("click", analyze);
    simulateToggleBtn.addEventListener("click", () => setSimulationPanelOpen(simulatePanel.style.display === "none"));
    runSimulateBtn.addEventListener("click", runSimulation);
    simulateMixInput.addEventListener("input", updateSimulateMixReadout);
    simulateVolumeInput.addEventListener("input", formatSimulateVolumeInput);
    timeWindowSelect.addEventListener("change", () => {
        applyTimeWindow(timeWindowSelect.value);
        if (data && resultsSection.style.display !== "none") {
            if (currentMode === "simulate") {
                runSimulation();
            } else {
                analyze();
            }
        }
    });
    applyTimeWindow(currentWindow);
    updateSimulateMixReadout();
    setSimulationPanelOpen(false);
    closeShareMenus();
    document.addEventListener("click", (event) => {
        if (!event.target.closest(".share-controls")) closeShareMenus();
    });

    async function analyze() {
        const address = addressInput.value.trim();
        if (!isValidAddress(address)) {
            showHint("enter a valid address (0x followed by 40 hex characters)", "error");
            return;
        }
        clearHint();
        showLoading();
        currentMode = "analyze";

        try {
            const resp = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ address, window: currentWindow }),
            });
            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.detail || "analysis failed");
            }
            data = await resp.json();

            if (data.error) {
                hideLoading();
                showHint(data.error, "error");
                return;
            }

            const url = new URL(window.location);
            url.searchParams.set("address", address);
            url.searchParams.set("window", currentWindow);
            url.searchParams.delete("mode");
            history.replaceState(null, "", url);

            renderResults(data);
        } catch (e) {
            hideLoading();
            showHint(e.message, "error");
        }
    }

    async function runSimulation() {
        const estimatedVolume = parseSimulateVolumeInput();
        const takerRatio = Number(simulateMixInput.value) / 100;

        if (!Number.isFinite(estimatedVolume) || estimatedVolume <= 0) {
            showHint("enter an estimated volume greater than 0", "error");
            return;
        }

        clearHint();
        showLoading();
        currentMode = "simulate";

        try {
            const resp = await fetch("/api/simulate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    estimated_volume: estimatedVolume,
                    taker_ratio: takerRatio,
                    window: currentWindow,
                }),
            });
            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.detail || "simulation failed");
            }

            data = await resp.json();

            const url = new URL(window.location);
            url.searchParams.delete("address");
            url.searchParams.set("window", currentWindow);
            url.searchParams.set("mode", "simulate");
            history.replaceState(null, "", url);

            renderResults(data);
        } catch (e) {
            hideLoading();
            showHint(e.message, "error");
        }
    }

    function showLoading() {
        loadingSection.style.display = "";
        resultsSection.style.display = "none";
    }

    function hideLoading() {
        loadingSection.style.display = "none";
    }

    // ── Render ──────────────────────────────────────────────────────────────
    function renderResults(d) {
        hideLoading();
        resultsSection.style.display = "";
        renderOverview(d);
        renderBarChart(d);
        renderHL(d);
        const isSimulation = d.mode === "simulate";
        coinsCard.style.display = isSimulation ? "none" : "";
        hlDetailsCard.style.display = "";
        if (!isSimulation) renderCoins(d.top_coins);
    }

    // ── Fees Overview (merged hero + comparisons) ───────────────────────────
    function exchDiffHTML(exch, key) {
        if (key === "lighter") {
            return `<div class="overview-exch-diff diff-positive">${formatUSDFull(exch.savings_vs_hl)} saved</div>`;
        }
        const diff = exch.diff_vs_hl;
        if (diff > 0) return `<div class="overview-exch-diff diff-negative">Hyperliquid cost ${formatUSDFull(diff)} more</div>`;
        if (diff < 0) return `<div class="overview-exch-diff diff-positive">Hyperliquid saved ${formatUSDFull(Math.abs(diff))}</div>`;
        return `<div class="overview-exch-diff" style="color:var(--text-dim)">same cost</div>`;
    }

    function historyNoticeHTML(d) {
        if (!d.history_notice || !d.history_notice.estimated) return "";
        if (d.mode === "simulate") {
            return `
                <div class="history-note">
                    <span>simulation estimate</span>
                </div>
            `;
        }
        const msg = d.history_notice.message.replace(/"/g, "&quot;");
        return `
            <div class="history-note">
                <span>part of this history was estimated</span>
                <button class="history-note-tip" type="button" title="${msg}" aria-label="${msg}">i</button>
            </div>
        `;
    }

    function renderOverview(d) {
        const el = $("fees-overview-content");
        const hl = d.hyperliquid;
        const lighter = d.comparisons.lighter;
        const binance = d.comparisons.binance;
        const bybit = d.comparisons.bybit;

        el.innerHTML = `
            <div class="overview-hero">
                <div class="overview-label">Total fees paid on Hyperliquid</div>
                <div class="overview-amount">${formatUSDFull(hl.total_fees_paid)}</div>
                <div class="overview-sub">${formatVolume(d.summary.total_volume)} volume across ${formatNum(d.summary.total_trades)} trades</div>
                ${historyNoticeHTML(d)}
            </div>
            <div class="overview-grid">
                <div class="overview-grid-label">The same activity would have cost you:</div>
                <div class="overview-exch">
                    <div class="overview-exch-name" style="color:var(--lighter)">lighter</div>
                    <div class="overview-exch-fees">${formatUSDFull(lighter.total_fees)}</div>
                    <div class="overview-exch-rates">taker: ${formatBps(lighter.taker_rate)} &middot; maker: ${formatBps(lighter.maker_rate)}</div>
                    ${exchDiffHTML(lighter, "lighter")}
                </div>
                <div class="overview-exch">
                    <div class="overview-exch-name" style="color:var(--binance)">binance</div>
                    <div class="overview-exch-fees">${formatUSDFull(binance.total_fees)}</div>
                    <div class="overview-exch-rates">taker: ${formatBps(binance.taker_rate)} &middot; maker: ${formatBps(binance.maker_rate)}</div>
                    ${exchDiffHTML(binance, "binance")}
                </div>
                <div class="overview-exch">
                    <div class="overview-exch-name" style="color:var(--bybit)">bybit</div>
                    <div class="overview-exch-fees">${formatUSDFull(bybit.total_fees)}</div>
                    <div class="overview-exch-rates">taker: ${formatBps(bybit.taker_rate)} &middot; maker: ${formatBps(bybit.maker_rate)}</div>
                    ${exchDiffHTML(bybit, "bybit")}
                </div>
            </div>
        `;

        $("toggle-overview-share").onclick = (event) => {
            event.stopPropagation();
            setShareMenuOpen(openShareMenu === "overview" ? null : "overview");
        };
        $("download-overview").onclick = (event) => {
            event.stopPropagation();
            downloadOverview(d);
        };
        $("copy-overview").onclick = (event) => {
            event.stopPropagation();
            copyOverview(d);
        };
    }

    // ── Overview Share Image ────────────────────────────────────────────────
    function buildOverviewImage(d) {
        const theme = getThemePalette();
        const hl = d.hyperliquid;
        const exchanges = [
            { name: "Lighter", color: theme.lighter, data: d.comparisons.lighter, key: "lighter" },
            { name: "Binance", color: theme.binance, data: d.comparisons.binance, key: "binance" },
            { name: "Bybit", color: theme.bybit, data: d.comparisons.bybit, key: "bybit" },
        ];

        function exchDiff(exch, key) {
            if (key === "lighter") return `<span style="color:${theme.green}">${formatUSDFull(exch.savings_vs_hl)} saved</span>`;
            const diff = exch.diff_vs_hl;
            if (diff > 0) return `<span style="color:${theme.red}">Hyperliquid +${formatUSDFull(diff)}</span>`;
            if (diff < 0) return `<span style="color:${theme.green}">Hyperliquid -${formatUSDFull(Math.abs(diff))}</span>`;
            return `<span style="color:${theme.textMuted}">same</span>`;
        }

        let exchHTML = "";
        for (let i = 0; i < exchanges.length; i++) {
            const ex = exchanges[i];
            const sep = i < exchanges.length - 1 ? `border-right:1px solid ${theme.border};padding-right:16px;margin-right:16px;` : "";
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
            <div style="font-size:11px;color:${theme.textDim};margin-top:8px;margin-bottom:20px">${formatVolume(d.summary.total_volume)} volume across ${formatNum(d.summary.total_trades)} trades</div>
            <div style="font-size:10px;font-weight:500;color:${theme.textMuted};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px">The same activity would have cost you:</div>
            <div style="border-top:1px solid ${theme.border};padding-top:16px;display:flex">
                ${exchHTML}
            </div>
        `;
        return buildExportFrame(content);
    }

    async function copyOverview(d) {
        const btn = $("copy-overview");

        try {
            await copyImage(() => buildOverviewImage(d), btn);
            closeShareMenus();
        } catch (e) {
            console.error("Failed to copy overview:", e);
            showHint("unable to copy image", "error");
        }
    }

    async function downloadOverview(d) {
        try {
            await downloadImage(() => buildOverviewImage(d), "tradingfees-overview.png");
            closeShareMenus();
        } catch (e) {
            console.error("Failed to download overview:", e);
            showHint("unable to download image", "error");
        }
    }

    // ── HL Details ──────────────────────────────────────────────────────────
    function renderHL(d) {
        const hl = d.hyperliquid;
        const summary = d.summary;
        const card = $("hl-details");
        const stakingText = hl.staking_tier !== "None"
            ? `${hl.staking_tier} (${(hl.staking_discount * 100).toFixed(0)}% off)`
            : "none";
        const referralText = hl.referral_discount > 0
            ? `${(hl.referral_discount * 100).toFixed(0)}% off`
            : "none";
        const makerPct = summary.maker_ratio || 0;
        const takerPct = summary.taker_ratio || 0;
        const blendedRate = (makerPct * hl.effective_maker_rate) + (takerPct * hl.effective_taker_rate);

        card.innerHTML = `
            <div class="section-label">Hyperliquid fee details</div>
            <div class="hl-grid">
                <div class="hl-cell">
                    <div class="hl-cell-label">fee tier</div>
                    <div class="hl-cell-value">${hl.tier}</div>
                </div>
                <div class="hl-cell">
                    <div class="hl-cell-label">taker rate</div>
                    <div class="hl-cell-value">${formatBps(hl.effective_taker_rate)}</div>
                </div>
                <div class="hl-cell">
                    <div class="hl-cell-label">maker rate</div>
                    <div class="hl-cell-value">${formatBps(hl.effective_maker_rate)}</div>
                </div>
                <div class="hl-cell">
                    <div class="hl-cell-label">taker orders</div>
                    <div class="hl-cell-value">${formatPct(takerPct)}</div>
                </div>
                <div class="hl-cell">
                    <div class="hl-cell-label">maker orders</div>
                    <div class="hl-cell-value">${formatPct(makerPct)}</div>
                </div>
                <div class="hl-cell">
                    <div class="hl-cell-label">blended rate</div>
                    <div class="hl-cell-value">${formatBps(blendedRate)}</div>
                </div>
                <div class="hl-cell">
                    <div class="hl-cell-label">staking</div>
                    <div class="hl-cell-value">${stakingText}</div>
                </div>
                <div class="hl-cell">
                    <div class="hl-cell-label">referral</div>
                    <div class="hl-cell-value">${referralText}</div>
                </div>
                <div class="hl-cell">
                    <div class="hl-cell-label">total fees</div>
                    <div class="hl-cell-value" style="color:var(--hyperliquid)">${formatUSDFull(hl.total_fees_paid)}</div>
                </div>
            </div>
            ${data.mode !== "simulate" && data.history_notice?.estimated ? `<div class="history-note history-note-inline"><span>includes an estimate for unfetchable older history</span><button class="history-note-tip" type="button" title="${data.history_notice.message.replace(/"/g, "&quot;")}" aria-label="${data.history_notice.message.replace(/"/g, "&quot;")}">i</button></div>` : ""}
        `;
    }

    // ── Bar Chart ───────────────────────────────────────────────────────────
    const EXCHANGE_COLORS = {
        Hyperliquid: "#50e3c2",
        Binance: "#f0b90b",
        Bybit: "#f7a600",
        Lighter: "#4a7aff",
    };

    function getBarItems(d) {
        return [
            { label: "Hyperliquid", fees: d.hyperliquid.total_fees_paid, color: EXCHANGE_COLORS.Hyperliquid },
            { label: "Binance", fees: d.comparisons.binance.total_fees, color: EXCHANGE_COLORS.Binance },
            { label: "Bybit", fees: d.comparisons.bybit.total_fees, color: EXCHANGE_COLORS.Bybit },
            { label: "Lighter", fees: 0, color: EXCHANGE_COLORS.Lighter },
        ].sort((a, b) => a.fees - b.fees);
    }

    function renderBarChart(d) {
        const container = $("bar-chart");
        container.innerHTML = "";

        const items = getBarItems(d);
        const maxFees = Math.max(...items.map((i) => i.fees), 1);

        for (const item of items) {
            const pct = (item.fees / maxFees) * 100;
            const row = document.createElement("div");
            row.className = "bar-row";
            row.innerHTML = `
                <div class="bar-label" style="color:${item.color}">${item.label}</div>
                <div class="bar-track">
                    <div class="bar-fill" style="width:${Math.max(pct, 0.5)}%;background:${item.color};opacity:0.65"></div>
                </div>
                <div class="bar-value">${formatUSDFull(item.fees)}</div>
            `;
            container.appendChild(row);
        }

        $("toggle-bar-chart-share").onclick = (event) => {
            event.stopPropagation();
            setShareMenuOpen(openShareMenu === "bar-chart" ? null : "bar-chart");
        };
        $("download-bar-chart").onclick = (event) => {
            event.stopPropagation();
            downloadBarChart(d);
        };
        $("copy-bar-chart").onclick = (event) => {
            event.stopPropagation();
            copyBarChart(d);
        };
    }

    function buildBarChartImage(d) {
        const theme = getThemePalette();
        const items = getBarItems(d);
        const maxFees = Math.max(...items.map((i) => i.fees), 1);
        const vol = formatVolume(d.summary.total_volume);
        const trades = formatNum(d.summary.total_trades);
        const days = Math.round(d.summary.trading_days);

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

    async function copyBarChart(d) {
        const btn = $("copy-bar-chart");

        try {
            await copyImage(() => buildBarChartImage(d), btn);
            closeShareMenus();
        } catch (e) {
            console.error("Failed to copy bar chart:", e);
            showHint("unable to copy image", "error");
        }
    }

    async function downloadBarChart(d) {
        try {
            await downloadImage(() => buildBarChartImage(d), "tradingfees-comparison.png");
            closeShareMenus();
        } catch (e) {
            console.error("Failed to download bar chart:", e);
            showHint("unable to download image", "error");
        }
    }

    // ── Coins Table ─────────────────────────────────────────────────────────
    function renderCoins(coins) {
        const container = $("coins-table");
        if (!coins || coins.length === 0) {
            container.innerHTML = '<p style="color:var(--text-dim);font-size:0.75rem">no trade data</p>';
            return;
        }

        const totalVol = coins.reduce((s, c) => s + c.volume, 0);

        let html = `
            <div class="coins-table-wrap">
                <table class="coins-table">
                    <thead><tr>
                        <th>asset</th><th>volume</th><th>fees</th><th>trades</th><th>%</th>
                    </tr></thead>
                    <tbody>
        `;
        for (const c of coins) {
            const pct = totalVol > 0 ? ((c.volume / totalVol) * 100).toFixed(1) : "0.0";
            html += `<tr>
                <td><span class="coin-name">${c.coin}</span></td>
                <td>${formatVolume(c.volume)}</td>
                <td>${formatUSDFull(c.fees)}</td>
                <td>${formatNum(c.trades)}</td>
                <td>${pct}%</td>
            </tr>`;
        }
        html += "</tbody></table></div>";
        container.innerHTML = html;
    }

    // ── Init ────────────────────────────────────────────────────────────────
    const params = new URLSearchParams(window.location.search);
    const preAddr = params.get("address");
    const preWindow = params.get("window");
    if (VALID_WINDOWS.includes(preWindow)) applyTimeWindow(preWindow);
    if (preAddr && isValidAddress(preAddr)) {
        addressInput.value = preAddr;
        analyze();
    }
})();
