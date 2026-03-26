import { useState, useRef, useEffect } from 'react'
import './styles.css'

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info'
const MAX_FILL_REQUESTS = 3

type CurrentRates = {
  perp_taker_rate: number
  perp_maker_rate: number
  spot_taker_rate: number
  spot_maker_rate: number
}

type SavingsEstimate = {
  address: string
  window: string
  estimated_hl_fees_paid: number
  estimated_savings: number
  fee_assumption: string
  estimation_mode: string
  current_rates: CurrentRates
  recent_blended_perp_rate: number
  requested_perp_volume: number
  fill_count: number
  fill_requests_used: number
  coverage_note: string
}

const WINDOWS = [
  { value: '1d', label: '1 Day' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'all', label: 'All Time' },
]

// --- Hyperliquid client-side estimation logic (ported from fee-savings-service) ---

function toFloat(value: unknown): number {
  try { return Number(value) || 0 } catch { return 0 }
}

function windowStartMs(win: string, nowMs: number): number {
  const dayMs = 24 * 60 * 60 * 1000
  if (win === '1d') return nowMs - dayMs
  if (win === '7d') return nowMs - 7 * dayMs
  if (win === '30d') return nowMs - 30 * dayMs
  return 0
}

async function hlPost(payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(HL_INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Hyperliquid API error: ${res.status}`)
  return res.json()
}

type PortfolioVolumes = {
  day: number; week: number; month: number; allTime: number
  perpDay: number; perpWeek: number; perpMonth: number; perpAllTime: number
}

function parsePortfolioVolumes(payload: unknown[]): PortfolioVolumes {
  const m: Record<string, number> = {}
  for (const row of payload) {
    if (!Array.isArray(row) || row.length !== 2) continue
    const win = String(row[0])
    if (typeof row[1] === 'object' && row[1] !== null) {
      m[win] = toFloat((row[1] as Record<string, unknown>).vlm)
    }
  }
  return {
    day: m['day'] ?? 0, week: m['week'] ?? 0, month: m['month'] ?? 0, allTime: m['allTime'] ?? 0,
    perpDay: m['perpDay'] ?? 0, perpWeek: m['perpWeek'] ?? 0, perpMonth: m['perpMonth'] ?? 0, perpAllTime: m['perpAllTime'] ?? 0,
  }
}

function getRequestedPerpVolume(vols: PortfolioVolumes, win: string): number {
  if (win === '1d') return vols.perpDay
  if (win === '7d') return vols.perpWeek
  if (win === '30d') return vols.perpMonth
  return vols.perpAllTime
}

type FillSummary = {
  requestsUsed: number; fillCount: number; totalFee: number
  totalNotional: number; crossedNotional: number; restingNotional: number
  oldestMs: number | null; newestMs: number | null; exhausted: boolean
}

async function collectFills(address: string, startMs: number, endMs: number): Promise<FillSummary> {
  const summary: FillSummary = {
    requestsUsed: 0, fillCount: 0, totalFee: 0,
    totalNotional: 0, crossedNotional: 0, restingNotional: 0,
    oldestMs: null, newestMs: null, exhausted: false,
  }
  let nextStart = startMs
  const seen = new Set<string>()

  for (let i = 0; i < MAX_FILL_REQUESTS; i++) {
    const rows = await hlPost({
      type: 'userFillsByTime', user: address,
      startTime: nextStart, endTime: endMs, aggregateByTime: false,
    }) as Record<string, unknown>[]
    summary.requestsUsed++
    if (!Array.isArray(rows) || rows.length === 0) break

    let maxTime: number | null = null
    let newRows = 0
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) continue
      const key = `${row.hash}-${row.oid}-${row.tid}-${row.time}-${row.coin}-${row.px}-${row.sz}-${row.fee}`
      if (seen.has(key)) continue
      seen.add(key)
      newRows++

      const timestamp = Math.floor(toFloat(row.time))
      if (timestamp <= 0) continue

      const notional = toFloat(row.px) * toFloat(row.sz)
      summary.fillCount++
      summary.totalFee += toFloat(row.fee)
      summary.totalNotional += notional
      if (row.crossed === true) summary.crossedNotional += notional
      else summary.restingNotional += notional

      summary.oldestMs = summary.oldestMs === null ? timestamp : Math.min(summary.oldestMs, timestamp)
      summary.newestMs = summary.newestMs === null ? timestamp : Math.max(summary.newestMs, timestamp)
      maxTime = maxTime === null ? timestamp : Math.max(maxTime, timestamp)
    }

    if (rows.length < 2000 || maxTime === null || maxTime >= endMs || newRows === 0) {
      summary.exhausted = true
      break
    }
    nextStart = maxTime + 1
  }
  return summary
}

function hasExactCoverage(fills: FillSummary, startMs: number, perpVol: number): boolean {
  if (!fills.exhausted) return false
  if (perpVol <= 0) return fills.fillCount === 0 || fills.totalNotional <= 1e-9
  if (fills.totalNotional <= 0) return false
  if (Math.abs(fills.totalNotional - perpVol) / perpVol <= 0.01) return true
  if (fills.oldestMs === null) return false
  return fills.oldestMs <= startMs + 1000
}

function windowedRecentVolumes(dailyRows: unknown[], win: string): { cross: number; add: number; fullyCovered: boolean } {
  const requestedDays = win === '1d' ? 1 : 7
  const usable = dailyRows.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
  const subset = usable.slice(-requestedDays)
  return {
    cross: subset.reduce((s, r) => s + toFloat(r.userCross), 0),
    add: subset.reduce((s, r) => s + toFloat(r.userAdd), 0),
    fullyCovered: subset.length === requestedDays,
  }
}

async function estimateSavings(address: string, win: string): Promise<SavingsEstimate> {
  const [userFeesData, portfolioData] = await Promise.all([
    hlPost({ type: 'userFees', user: address }) as Promise<Record<string, unknown>>,
    hlPost({ type: 'portfolio', user: address }) as Promise<unknown[]>,
  ])

  const rates: CurrentRates = {
    perp_taker_rate: toFloat(userFeesData.userCrossRate),
    perp_maker_rate: toFloat(userFeesData.userAddRate),
    spot_taker_rate: toFloat(userFeesData.userSpotCrossRate),
    spot_maker_rate: toFloat(userFeesData.userSpotAddRate),
  }

  const dailyRows = Array.isArray(userFeesData.dailyUserVlm) ? userFeesData.dailyUserVlm as Record<string, unknown>[] : []
  let recentCross = 0, recentAdd = 0
  for (const row of dailyRows) {
    if (typeof row !== 'object' || row === null) continue
    recentCross += toFloat(row.userCross)
    recentAdd += toFloat(row.userAdd)
  }
  const summaryTotal = recentCross + recentAdd
  const summaryBlended = summaryTotal > 0
    ? (recentCross * rates.perp_taker_rate + recentAdd * rates.perp_maker_rate) / summaryTotal
    : rates.perp_taker_rate

  const nowMs = Date.now()
  const startMs = windowStartMs(win, nowMs)
  const fills = await collectFills(address, startMs, nowMs)

  let recentBlended: number
  if (fills.totalNotional > 0) {
    recentBlended = (fills.crossedNotional * rates.perp_taker_rate + fills.restingNotional * rates.perp_maker_rate) / fills.totalNotional
  } else if (summaryTotal > 0) {
    recentBlended = summaryBlended
  } else {
    recentBlended = rates.perp_taker_rate
  }

  const vols = parsePortfolioVolumes(Array.isArray(portfolioData) ? portfolioData : [])
  const perpVol = getRequestedPerpVolume(vols, win)
  const exact = hasExactCoverage(fills, startMs, perpVol)

  let estimatedFees: number
  let mode: string
  let coverageNote: string

  if (exact) {
    estimatedFees = fills.totalFee
    mode = 'exact_from_fill_fees'
    coverageNote = 'Exact fee total from Hyperliquid fills for the requested window.'
  } else if ((win === '1d' || win === '7d') && summaryTotal > 0) {
    const wv = windowedRecentVolumes(dailyRows, win)
    estimatedFees = wv.cross * rates.perp_taker_rate + wv.add * rates.perp_maker_rate
    mode = 'estimate_from_user_fees_daily_breakdown'
    coverageNote = wv.fullyCovered
      ? 'Estimated from userFees daily volume and current perp maker/taker rates.'
      : 'Requested window extends beyond the available userFees daily history.'
  } else {
    estimatedFees = perpVol * recentBlended
    mode = 'portfolio_volume_estimate'
    coverageNote = fills.totalNotional > 0
      ? `Computed from Hyperliquid portfolio perp volume and a blended current perp rate derived from ${fills.fillCount} recent fills across ${fills.requestsUsed} fill request(s).`
      : 'Computed from Hyperliquid portfolio perp volume and a blended current perp rate derived from recent userFees maker/taker mix.'
  }

  return {
    address,
    window: win,
    estimated_hl_fees_paid: estimatedFees,
    estimated_savings: estimatedFees,
    fee_assumption: 'Lighter Standard Accounts: 0 maker / 0 taker',
    estimation_mode: mode,
    current_rates: rates,
    recent_blended_perp_rate: recentBlended,
    requested_perp_volume: perpVol,
    fill_count: fills.fillCount,
    fill_requests_used: fills.requestsUsed,
    coverage_note: coverageNote,
  }
}

function fmtUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function fmtRate(value: number): string {
  return (value * 100).toFixed(4) + '%'
}

function fmtVol(value: number): string {
  return '$' + new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function shortenAddress(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function drawCardImage(
  savings: string,
  address: string,
  windowLabel: string,
  volume: string,
  blendedRate: string,
): Promise<string> {
  const WIDTH = 1080
  const HEIGHT = 1350

  return loadImage('/fee_bg.png').then((background) => {
    const canvas = document.createElement('canvas')
    const ratio = window.devicePixelRatio || 2
    canvas.width = WIDTH * ratio
    canvas.height = HEIGHT * ratio
    canvas.style.width = `${WIDTH}px`
    canvas.style.height = `${HEIGHT}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get canvas context')

    ctx.scale(ratio, ratio)
    ctx.drawImage(background, 0, 0, WIDTH, HEIGHT)

    // "FEES PAID" title
    ctx.fillStyle = '#9ca3af'
    ctx.font = '500 64px Inter'
    ctx.textBaseline = 'middle'
    ctx.fillText('FEES PAID', 127, 345)

    // "TRADING ON HYPERLIQUID"
    ctx.fillStyle = '#9ca3af'
    ctx.font = '500 64px Inter'
    ctx.fillText('TRADING ON HYPERLIQUID', 127, 415)

    // Savings amount
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 96px Inter'
    ctx.fillText(savings, 127, 545)

    // Window label
    ctx.fillStyle = '#9ca3af'
    ctx.font = '500 36px Inter'
    ctx.fillText(`WINDOW: ${windowLabel.toUpperCase()}`, 127, 660)

    // Address
    ctx.fillStyle = '#9ca3af'
    ctx.font = '500 36px Inter'
    ctx.fillText(`ADDRESS: ${address}`, 127, 720)

    // Stats section
    ctx.fillStyle = '#9ca3af'
    ctx.font = '500 36px Inter'
    ctx.fillText('TRADE CRYPTO, STOCKS,', 127, 850)
    ctx.fillText('COMMODITIES WITH', 127, 895)
    ctx.fillStyle = '#ffffff'
    ctx.font = '500 36px Inter'
    ctx.fillText('ZERO FEES', 127, 940)

    // Volume info
    ctx.fillStyle = '#6b7280'
    ctx.font = '400 28px Inter'
    ctx.fillText(`Volume: ${volume}`, 127, 1020)
    ctx.fillText(`Blended Rate: ${blendedRate}`, 127, 1060)

    // Lighter branding at bottom
    return loadImage('/lighter.png').then((logo) => {
      const logoWidth = 180
      const logoHeight = 56
      ctx.drawImage(logo, 127, 1150, logoWidth, logoHeight)

      return canvas.toDataURL('image/png')
    })
  })
}

async function copyImageToClipboard(imgSrc: string): Promise<boolean> {
  try {
    const response = await fetch(imgSrc)
    const blob = await response.blob()
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ])
    return true
  } catch {
    return false
  }
}

function modeLabel(mode: string): string {
  if (mode === 'exact_from_fill_fees') return 'Exact fill fees'
  if (mode === 'estimate_from_user_fees_daily_breakdown') return 'Daily volume estimate'
  return 'Portfolio blended rate'
}

// --- Design components ---

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`card ${className}`}>
      <svg className="corner-mark corner-tl" width="4" height="4" viewBox="0 0 4 4" fill="none">
        <path d="M0 0H4V1H1V4H0V0Z" fill="#2b2b30" />
      </svg>
      <svg className="corner-mark corner-tr" width="4" height="4" viewBox="0 0 4 4" fill="none">
        <path d="M0 0H4V4H3V1H0V0Z" fill="#2b2b30" />
      </svg>
      <svg className="corner-mark corner-bl" width="4" height="4" viewBox="0 0 4 4" fill="none">
        <path d="M0 0H1V3H4V4H0V0Z" fill="#2b2b30" />
      </svg>
      <svg className="corner-mark corner-br" width="4" height="4" viewBox="0 0 4 4" fill="none">
        <path d="M4 0V4H0V3H3V0H4Z" fill="#2b2b30" />
      </svg>
      {children}
    </div>
  )
}

function DataRow({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
  return (
    <tr className={wrap ? 'wrap-row' : undefined}>
      <td>{label}</td>
      <td>{value}</td>
    </tr>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tbody>
      <tr className="section-row">
        <td colSpan={2}>{label}</td>
      </tr>
      {children}
    </tbody>
  )
}

function BreakdownTable({ data }: { data: SavingsEstimate }) {
  return (
    <div className="breakdown">
      <div className="breakdown-header">
        <h2>Breakdown</h2>
        <span className="resolved-addr">
          {shortenAddress(data.address)}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>

          <Section label="Volume">
            <DataRow
              label="Requested perp volume"
              value={fmtVol(data.requested_perp_volume)}
            />
          </Section>

          <Section label="Rates">
            <DataRow
              label="Blended perp rate"
              value={fmtRate(data.recent_blended_perp_rate)}
            />
            <DataRow
              label="Perp taker rate"
              value={fmtRate(data.current_rates.perp_taker_rate)}
            />
            <DataRow
              label="Perp maker rate"
              value={fmtRate(data.current_rates.perp_maker_rate)}
            />
          </Section>

          <Section label="Methodology">
            <DataRow label="Fee assumption" value={data.fee_assumption} />
            <DataRow label="Coverage" value={data.coverage_note} wrap />
          </Section>
        </table>
      </div>
    </div>
  )
}

function App() {
  const [address, setAddress] = useState('')
  const [windowValue, setWindowValue] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SavingsEstimate | null>(null)
  const [cardImage, setCardImage] = useState<string | null>(null)
  const [showCardModal, setShowCardModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const cardImgRef = useRef<HTMLImageElement>(null)

  const syncUrl = (addr: string, win: string) => {
    const params = new URLSearchParams()
    if (addr) params.set('address', addr)
    if (win) params.set('window', win)
    const query = params.toString()
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname
    window.history.replaceState({}, '', nextUrl)
  }

  const fetchEstimate = async (addr: string, win: string) => {
    setLoading(true)
    setError(null)
    setResult(null)
    setCardImage(null)
    setShowCardModal(false)

    try {
      const data = await estimateSavings(addr, win)
      setResult(data)
      syncUrl(addr, win)

      // Auto-generate the shareable card immediately
      const windowLabel = WINDOWS.find(w => w.value === data.window)?.label || data.window
      const img = await drawCardImage(
        fmtUsd(data.estimated_savings),
        shortenAddress(data.address),
        windowLabel,
        fmtVol(data.requested_perp_volume),
        fmtRate(data.recent_blended_perp_rate),
      )
      setCardImage(img)
      setShowCardModal(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  // Read URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const prefillAddress = params.get('address')
    const prefillWindow = params.get('window')
    if (prefillAddress) setAddress(prefillAddress)
    if (prefillWindow && ['1d', '7d', '30d', 'all'].includes(prefillWindow)) {
      setWindowValue(prefillWindow)
    }
    if (prefillAddress) {
      fetchEstimate(prefillAddress, prefillWindow || 'all')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!address.trim()) return
    fetchEstimate(address.trim(), windowValue)
  }

  const handleDownload = () => {
    if (!cardImage) return
    const a = document.createElement('a')
    a.href = cardImage
    a.download = `Lighter_Fee_Savings_${shortenAddress(result?.address || '')}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleCopyImage = async () => {
    if (!cardImage) return
    const ok = await copyImageToClipboard(cardImage)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <>
      <main className="page-shell">
        <div className="header">
          <h1>Fee Savings Estimate</h1>
          <p>
            Estimate Hyperliquid trading fees and compare against Lighter&apos;s
            zero-fee standard accounts.
          </p>
        </div>

        <Card className="main-card">
          <div className="form-card">
            <form className="lookup-form" onSubmit={handleSubmit}>
              <label className="field">
                <span className="field-label">Address</span>
                <input
                  type="text"
                  placeholder="0x..."
                  autoComplete="off"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>

              <label className="field field-small">
                <span className="field-label">Window</span>
                <select value={windowValue} onChange={(e) => setWindowValue(e.target.value)}>
                  {WINDOWS.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>

              <button className="btn" type="submit" disabled={loading}>
                {loading ? 'Loading...' : 'Estimate'}
              </button>
            </form>

            {(loading || error) && (
              <div className={`status${error ? ' status-error' : ''}`}>
                {error || 'Loading...'}
              </div>
            )}
          </div>

          {result && (
            <>
              <hr className="divider" />
              <div className="primary-metric">
                <span className="stat-label">Estimated Savings</span>
                <div className="primary-value-row">
                  <span className="primary-value">
                    {fmtUsd(result.estimated_savings)}
                  </span>
                  <button
                    className="btn btn-share"
                    type="button"
                    onClick={() => setShowCardModal(true)}
                  >
                    Share
                    <svg width="16" height="16" viewBox="0 0 256 256" fill="none">
                      <path d="M176 160a39.89 39.89 0 0 0-28.62 12.09l-46.1-29.63a39.8 39.8 0 0 0 0-28.92l46.1-29.63a40 40 0 1 0-8.66-13.45l-46.1 29.63a40 40 0 1 0 0 55.82l46.1 29.63A40 40 0 1 0 176 160Z" fill="currentColor"/>
                    </svg>
                  </button>
                </div>
                <span className="primary-footnote">
                  {modeLabel(result.estimation_mode)}
                </span>
              </div>
            </>
          )}
        </Card>

        {result && (
          <div className="results">
            <BreakdownTable data={result} />
          </div>
        )}
      </main>

      <div className="fade-bottom" />

      {/* Card Modal */}
      {showCardModal && cardImage && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCardModal(false)
          }}
        >
          <div className="modal-panel">
            <div className="modal-header">
              <h3>Fees Paid</h3>
              <button
                className="modal-close"
                onClick={() => setShowCardModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <img
                ref={cardImgRef}
                src={cardImage}
                alt="Lighter Fee Savings Card"
              />
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={handleDownload}>
                Save Card
              </button>
              {!!navigator?.clipboard?.write && (
                <button className="btn" onClick={handleCopyImage}>
                  {copied ? 'Copied!' : 'Copy Image'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default App
