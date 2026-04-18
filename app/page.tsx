"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import StockChart from "@/components/StockChart"
import AiThoughtCard from "@/components/AiThoughtCard"
import PortfolioNewsPanel from "@/components/PortfolioNewsPanel"
import LearnGamePanel from "@/components/LearnGamePanel"
import FlashcardsPanel from "@/components/FlashcardsPanel"
import MasteryPanel from "@/components/MasteryPanel"
import { useLocalPortfolio } from "@/hooks/useLocalPortfolio"
import { useLearningStore } from "@/hooks/useLearningStore"
import { buildSimulatedSeries } from "@/lib/chartSeries"
import {
  CHART_TIMEFRAMES,
  type ChartSelectionRange,
  type ChartTimeframe,
  type LearnPack,
  type MarketThought,
} from "@/lib/types"

const PRESETS = ["AAPL", "NVDA", "TSLA"] as const

/** Must exceed server GEMINI_EXPLAIN_TIMEOUT_MS so Gemini can finish before the browser aborts. */
const EXPLAIN_CLIENT_MS = Math.max(
  8000,
  Number(process.env.NEXT_PUBLIC_EXPLAIN_CLIENT_TIMEOUT_MS ?? 22_000)
)

type Tab = "terminal" | "news" | "learn"
type LearnTab = "game" | "flashcards" | "mastery"
type GameSection = "driver" | "quiz" | "trade"

export default function Home() {
  const [tab, setTab] = useState<Tab>("terminal")
  const [learnTab, setLearnTab] = useState<LearnTab>("game")
  const [gameSection, setGameSection] = useState<GameSection>("driver")
  const [feed, setFeed] = useState<MarketThought[]>([])
  const [lastPack, setLastPack] = useState<LearnPack | null>(null)
  const [chartSymbol, setChartSymbol] = useState("AAPL")
  const [symbolDraft, setSymbolDraft] = useState("")
  const [chartBusy, setChartBusy] = useState(false)
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>("1D")
  const [newTicker, setNewTicker] = useState("")
  const portfolio = useLocalPortfolio()
  const learning = useLearningStore()

  const sym = chartSymbol.trim().toUpperCase()
  const chartData = useMemo(
    () => buildSimulatedSeries(sym || "AAPL", chartTimeframe),
    [sym, chartTimeframe]
  )

  useEffect(() => {
    setFeed([])
  }, [sym, chartTimeframe])

  const explainMove = useCallback(
    async (range: ChartSelectionRange) => {
      setChartBusy(true)
      const ac = new AbortController()
      const t = window.setTimeout(() => ac.abort(), EXPLAIN_CLIENT_MS)
      try {
        const res = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stock: sym, range }),
          signal: ac.signal,
        })
        const text = await res.text()
        let data: MarketThought & { error?: string }
        try {
          data = JSON.parse(text) as MarketThought & { error?: string }
        } catch {
          const errCard: MarketThought = {
            ticker: sym,
            thought: "Server returned non-JSON (check dev server / API route).",
            reasoning: [text.slice(0, 200)],
            confidence: 0,
            action: "ERROR",
          }
          setFeed((p) => [errCard, ...p].slice(0, 40))
          return
        }
        if (!res.ok || data.error) {
          const errCard: MarketThought = {
            ticker: sym,
            thought: typeof data.error === "string" ? data.error : "Explain request failed.",
            reasoning: [],
            confidence: 0,
            action: "ERROR",
          }
          setFeed((p) => [errCard, ...p].slice(0, 40))
          return
        }
        setFeed((p) => [data, ...p].slice(0, 40))
        if (data.learn) {
          learning.ingestLearnPack(data.learn)
          setLastPack(data.learn)
        }
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.name === "AbortError"
              ? `Request timed out (${Math.round(EXPLAIN_CLIENT_MS / 1000)}s). Increase NEXT_PUBLIC_EXPLAIN_CLIENT_TIMEOUT_MS or GEMINI_EXPLAIN_TIMEOUT_MS if Gemini is slow.`
              : e.message
            : "Network error"
        const errCard: MarketThought = {
          ticker: sym,
          thought: msg,
          reasoning: [],
          confidence: 0,
          action: "ERROR",
        }
        setFeed((p) => [errCard, ...p].slice(0, 40))
      } finally {
        clearTimeout(t)
        setChartBusy(false)
      }
    },
    [learning, sym]
  )

  const launchLearn = useCallback(
    (pack: LearnPack, dest: "driver" | "quiz" | "trade" | "flashcards" | "mastery") => {
      setLastPack(pack)
      if (dest === "flashcards") {
        setLearnTab("flashcards")
      } else if (dest === "mastery") {
        setLearnTab("mastery")
      } else {
        setLearnTab("game")
        setGameSection(dest)
      }
      setTab("learn")
    },
    []
  )

  const applyChartSymbol = (raw: string) => {
    const u = raw.trim().toUpperCase()
    if (/^[A-Z0-9.\-]{1,20}$/.test(u)) setChartSymbol(u)
  }

  const addPortfolio = () => {
    const ok = portfolio.add(newTicker)
    if (ok) setNewTicker("")
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#030306] text-zinc-100">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800/90 bg-[#050508] px-4 py-2">
        <div className="mr-4 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-500/90">
          Market Mind
        </div>
        <nav className="flex gap-1">
          <button
            type="button"
            onClick={() => setTab("terminal")}
            className={`rounded-md border px-4 py-2 font-mono text-xs uppercase tracking-wide transition-colors ${
              tab === "terminal"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                : "border-transparent text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            }`}
          >
            Terminal
          </button>
          <button
            type="button"
            onClick={() => setTab("news")}
            className={`rounded-md border px-4 py-2 font-mono text-xs uppercase tracking-wide transition-colors ${
              tab === "news"
                ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-100"
                : "border-transparent text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            }`}
          >
            Portfolio news
          </button>
          <button
            type="button"
            onClick={() => setTab("learn")}
            className={`rounded-md border px-4 py-2 font-mono text-xs uppercase tracking-wide transition-colors ${
              tab === "learn"
                ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
                : "border-transparent text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            }`}
          >
            Learn
          </button>
        </nav>
      </header>

      {tab === "terminal" ? (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[240px] shrink-0 flex-col border-r border-zinc-800/90 bg-[#050508]">
            <div className="border-b border-zinc-800/90 p-4">
              <h1 className="font-mono text-sm font-semibold tracking-tight text-zinc-200">
                Chart symbol
              </h1>
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-zinc-500">
                Any ticker; pick a horizon below. Drag on the chart to explain that window.
              </p>
            </div>
            <div className="border-b border-zinc-800/90 p-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Horizon
              </div>
              <div className="flex flex-wrap gap-1">
                {CHART_TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.id}
                    type="button"
                    onClick={() => setChartTimeframe(tf.id)}
                    title={tf.detail}
                    className={`rounded border px-2 py-1 font-mono text-[10px] transition-colors ${
                      chartTimeframe === tf.id
                        ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                        : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                    }`}
                  >
                    {tf.short}
                  </button>
                ))}
              </div>
              <p className="mt-2 font-mono text-[9px] leading-snug text-zinc-600">{CHART_TIMEFRAMES.find((x) => x.id === chartTimeframe)?.detail}</p>
            </div>
            <div className="p-3">
              <div className="mb-2 flex gap-2">
                <input
                  value={symbolDraft}
                  onChange={(e) => setSymbolDraft(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      applyChartSymbol(symbolDraft)
                      setSymbolDraft("")
                    }
                  }}
                  placeholder="e.g. AMD"
                  className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
                />
                <button
                  type="button"
                  onClick={() => {
                    applyChartSymbol(symbolDraft)
                    setSymbolDraft("")
                  }}
                  className="shrink-0 rounded-md border border-emerald-600/50 bg-emerald-500/10 px-3 py-2 font-mono text-xs text-emerald-200 hover:bg-emerald-500/20"
                >
                  Set
                </button>
              </div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Quick
              </div>
              <nav className="space-y-1">
                {PRESETS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setChartSymbol(s)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left font-mono text-sm transition-colors ${
                      sym === s
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                        : "border-transparent text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/60 hover:text-zinc-200"
                    }`}
                  >
                    {s}
                    {sym === s ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#4ade80]" />
                    ) : null}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/90 bg-[#06080c] px-5 py-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Active chart
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-semibold tracking-tight text-white">
                    {sym}
                  </span>
                  <span className="font-mono text-xs text-zinc-500">
                    {CHART_TIMEFRAMES.find((x) => x.id === chartTimeframe)?.detail ?? "simulated"}
                  </span>
                </div>
              </div>
              <div className="font-mono text-[11px] text-zinc-500">
                AI runs only when you select a range — no live ticker generation.
              </div>
            </header>

            <div className="min-h-0 min-w-0 flex-1 overflow-auto p-5">
              <StockChart
                data={chartData}
                ticker={sym}
                timeframe={chartTimeframe}
                onSelect={explainMove}
                busy={chartBusy}
              />
            </div>
          </main>

          <section className="flex w-[min(420px,38vw)] shrink-0 flex-col border-l border-zinc-800/90 bg-[#050508]">
            <div className="border-b border-zinc-800/90 p-4">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-zinc-300">
                Chart explanations
              </h2>
              <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
                Drag across the graph; each card explains gain/loss in that time slice (Gemini,
                structured JSON).
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {feed.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center font-mono text-xs text-zinc-500">
                  Select a range on the chart to generate an explanation.
                </div>
              ) : (
                feed.map((item, i) => (
                  <AiThoughtCard
                    key={`${i}-${item.ticker}-${item.confidence}-${item.action}-${item.thought.length}`}
                    item={item}
                    i={i}
                    onLaunchLearn={launchLearn}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      ) : (
        tab === "learn" ? (
          <div className="flex min-h-0 flex-1">
            <aside className="flex w-[260px] shrink-0 flex-col border-r border-zinc-800/90 bg-[#050508]">
              <div className="border-b border-zinc-800/90 p-4">
                <h2 className="font-mono text-sm font-semibold text-zinc-200">Learn</h2>
                <p className="mt-1 font-mono text-[10px] leading-relaxed text-zinc-500">
                  Game + flashcards + mastery. Terms and performance are stored in this browser.
                </p>
              </div>
              <div className="border-b border-zinc-800/90 p-3">
                <div className="flex gap-1">
                  {(["game", "flashcards", "mastery"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setLearnTab(t)}
                      className={`rounded-md border px-3 py-2 font-mono text-[11px] uppercase transition-colors ${
                        learnTab === t
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
                          : "border-transparent text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-3">
                <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/40 p-3">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Latest selection
                  </div>
                  <div className="mt-1 font-mono text-xs text-zinc-200">
                    {lastPack ? `${lastPack.rangeLabel} · ${lastPack.timeframe}` : "—"}
                  </div>
                  <div className="mt-2 font-mono text-[11px] text-zinc-500">
                    Terms tracked: <span className="text-zinc-200">{Object.keys(learning.store.terms).length}</span>
                  </div>
                </div>
              </div>
            </aside>

            <main className="flex min-h-0 min-w-0 flex-1 flex-col">
              {learnTab === "game" ? (
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">
                  {lastPack ? (
                    <LearnGamePanel
                      pack={lastPack}
                      onAttempt={learning.recordAttempt}
                      initialSection={gameSection}
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center font-mono text-sm text-zinc-500">
                      Select a chart range in Terminal to generate a game pack.
                    </div>
                  )}
                </div>
              ) : learnTab === "flashcards" ? (
                <FlashcardsPanel />
              ) : (
                <MasteryPanel />
              )}
            </main>
          </div>
        ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[260px] shrink-0 flex-col border-r border-zinc-800/90 bg-[#050508]">
            <div className="border-b border-zinc-800/90 p-4">
              <h2 className="font-mono text-sm font-semibold text-zinc-200">Portfolio</h2>
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-zinc-500">
                Stored in this browser. Scans are generated by Gemini (synthetic desk lines), not
                live headline feeds.
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-3">
              <div className="flex gap-2">
                <input
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addPortfolio()
                  }}
                  placeholder="Add ticker"
                  className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 font-mono text-sm outline-none focus:border-cyan-500/50"
                />
                <button
                  type="button"
                  onClick={addPortfolio}
                  className="shrink-0 rounded-md border border-cyan-600/40 bg-cyan-500/10 px-3 py-2 font-mono text-xs text-cyan-100 hover:bg-cyan-500/20"
                >
                  Add
                </button>
              </div>
              <ul className="flex flex-1 flex-col gap-1 overflow-y-auto">
                {portfolio.symbols.map((t) => (
                  <li
                    key={t}
                    className="flex items-center justify-between rounded-md border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 font-mono text-sm"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => portfolio.remove(t)}
                      className="text-[11px] text-zinc-500 hover:text-red-400"
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
          <PortfolioNewsPanel tickers={portfolio.symbols} ready={portfolio.ready} />
        </div>
        )
      )}
    </div>
  )
}
