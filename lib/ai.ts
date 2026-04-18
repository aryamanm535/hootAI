import type {
  ChartTimeframe,
  LearnPack,
  LearnTerm,
  LearnTopic,
  MarketThought,
  PortfolioNewsItem,
} from "./types"

/**
 * LLM provider
 * - Groq: OpenAI-compatible Chat Completions API
 * - Gemini fallback: kept only if GROQ_API_KEY is absent
 */
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant"
const GEMINI_MODEL = "gemini-2.5-flash"

/** Serialize LLM calls so /news + /explain never burst parallel requests (major 429 source). */
let llmChain: Promise<void> = Promise.resolve()

function withLlmQueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = llmChain.then(fn, fn)
  llmChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Per-ticker spacing for live stream — reduces quota burn when the UI polls aggressively. */
const liveGapState = new Map<string, { lastCompleteAt: number }>()

async function enforceLiveMinGap(ticker: string): Promise<void> {
  const gap = Math.max(0, Number(process.env.GEMINI_LIVE_MIN_INTERVAL_MS ?? 12_000))
  if (gap === 0) return
  const prev = liveGapState.get(ticker)?.lastCompleteAt
  const now = Date.now()
  if (prev != null) {
    const elapsed = now - prev
    if (elapsed < gap) await sleep(gap - elapsed)
  }
}

function markLiveComplete(ticker: string): void {
  liveGapState.set(ticker, { lastCompleteAt: Date.now() })
}

function parseDurationToMs(d: unknown): number | null {
  if (typeof d !== "string") return null
  const sec = d.match(/^(\d+(?:\.\d+)?)s$/i)
  if (sec) return Math.ceil(parseFloat(sec[1]) * 1000)
  const ms = d.match(/^(\d+)ms$/i)
  if (ms) return parseInt(ms[1], 10)
  return null
}

function parseRetryDelayMsFromBody(body: unknown): number | null {
  const err = (body as { error?: { details?: unknown[] } })?.error
  const details = err?.details
  if (!Array.isArray(details)) return null
  for (const d of details) {
    if (!d || typeof d !== "object") continue
    const o = d as Record<string, unknown>
    const t = o["@type"]
    if (typeof t === "string" && t.includes("RetryInfo")) {
      const parsed = parseDurationToMs(o.retryDelay)
      if (parsed != null) return parsed
    }
  }
  return null
}

function backoffMsForAttempt(res: Response, body: unknown, attempt: number): number {
  const header = res.headers.get("retry-after")
  if (header) {
    const sec = parseInt(header, 10)
    if (!Number.isNaN(sec)) return sec * 1000 + Math.random() * 250
  }
  const fromBody = parseRetryDelayMsFromBody(body)
  if (fromBody != null) return Math.min(60_000, fromBody + Math.random() * 250)
  const expo = Math.min(32_000, 1000 * 1.6 ** attempt)
  return expo + Math.random() * 400
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) return fence[1].trim()
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

/** Parse model text; surfaces JSON errors with a short prefix for logs/UI. */
function parseModelJson(text: string, label: string): unknown {
  const blob = extractJsonObject(text)
  try {
    return JSON.parse(blob)
  } catch (e1) {
    try {
      return JSON.parse(text.trim())
    } catch {
      const hint = e1 instanceof Error ? e1.message : "parse error"
      throw new Error(`${label}: ${hint}`)
    }
  }
}

/** Gemini structured output for chart explain (avoids broken / partial JSON). */
const EXPLAIN_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    ticker: { type: "STRING" },
    thought: { type: "STRING" },
    reasoning: { type: "ARRAY", items: { type: "STRING" } },
    confidence: { type: "INTEGER" },
    action: { type: "STRING" },
    regionLabel: { type: "STRING" },
    learn: {
      type: "OBJECT",
      properties: {
        rangeLabel: { type: "STRING" },
        timeframe: { type: "STRING" },
        topics: { type: "ARRAY", items: { type: "STRING" } },
        terms: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING" },
              term: { type: "STRING" },
              definition: { type: "STRING" },
              topic: { type: "STRING" },
              example: { type: "STRING" },
            },
            required: ["id", "term", "definition", "topic"],
          },
        },
        quiz: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING" },
              topic: { type: "STRING" },
              prompt: { type: "STRING" },
              choices: { type: "ARRAY", items: { type: "STRING" } },
              correctIndex: { type: "INTEGER" },
              explanation: { type: "STRING" },
            },
            required: ["id", "topic", "prompt", "choices", "correctIndex", "explanation"],
          },
        },
        driverGame: {
          type: "OBJECT",
          properties: {
            prompt: { type: "STRING" },
            choices: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  label: { type: "STRING" },
                  topic: { type: "STRING" },
                },
                required: ["label", "topic"],
              },
            },
            correctIndex: { type: "INTEGER" },
            explanation: { type: "STRING" },
          },
          required: ["prompt", "choices", "correctIndex", "explanation"],
        },
        tradeIdea: {
          type: "OBJECT",
          properties: {
            direction: { type: "STRING" },
            thesis: { type: "STRING" },
            risk: { type: "STRING" },
            invalidation: { type: "STRING" },
          },
          required: ["direction", "thesis", "risk", "invalidation"],
        },
      },
      required: ["rangeLabel", "timeframe", "topics", "terms", "quiz", "driverGame", "tradeIdea"],
    },
  },
  required: ["ticker", "thought", "reasoning", "confidence", "action"],
}

const TOPICS: LearnTopic[] = ["Macro", "Earnings", "Technicals", "Sentiment", "Risk", "MarketStructure"]
function normTopic(raw: unknown): LearnTopic {
  const s = String(raw ?? "").toLowerCase()
  const hit = TOPICS.find((t) => t.toLowerCase() === s)
  if (hit) return hit
  if (s.includes("tech")) return "Technicals"
  if (s.includes("earn")) return "Earnings"
  if (s.includes("sent")) return "Sentiment"
  if (s.includes("structure") || s.includes("micro")) return "MarketStructure"
  if (s.includes("risk")) return "Risk"
  return "Macro"
}

function coerceLearnPack(raw: unknown, timeframe: ChartTimeframe, rangeLabel: string): LearnPack | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const o = raw as Record<string, unknown>
  const topics = Array.isArray(o.topics) ? o.topics.map(normTopic) : []
  const terms: LearnTerm[] = Array.isArray(o.terms)
    ? o.terms
        .slice(0, 16)
        .map((x, i) => {
          const t = x as Record<string, unknown>
          const term = String(t.term ?? "").trim()
          if (!term) return null
          const id = String(t.id ?? `${term.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${i}`)
          const example = t.example != null ? String(t.example).trim() : ""
          const out: LearnTerm = {
            id,
            term,
            definition: String(t.definition ?? "").trim(),
            topic: normTopic(t.topic),
          }
          if (example) out.example = example
          return out
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    : []
  const quiz = Array.isArray(o.quiz)
    ? o.quiz
        .slice(0, 8)
        .map((x, i) => {
          const q = x as Record<string, unknown>
          const rawChoices = Array.isArray(q.choices) ? q.choices.map((c) => String(c).trim()) : []
          const choices =
            rawChoices.filter(Boolean).length >= 2
              ? rawChoices.filter(Boolean).slice(0, 6)
              : ["A", "B", "C", "D"]
          return {
            id: String(q.id ?? `q-${i}`),
            topic: normTopic(q.topic),
            prompt: String(q.prompt ?? ""),
            choices,
            correctIndex: Math.max(0, Math.min(choices.length - 1, Number(q.correctIndex ?? 0) || 0)),
            explanation: String(q.explanation ?? ""),
          }
        })
    : []
  const dg = (o.driverGame ?? {}) as Record<string, unknown>
  const driverChoices = Array.isArray(dg.choices)
    ? dg.choices
        .slice(0, 6)
        .map((c) => ({
          label: String((c as Record<string, unknown>).label ?? "").trim(),
          topic: normTopic((c as Record<string, unknown>).topic),
        }))
        .filter((c) => c.label.length > 0)
    : []
  const driverGame = {
    prompt: String(dg.prompt ?? "Pick the best driver."),
    choices: driverChoices.length > 0 ? driverChoices : TOPICS.slice(0, 4).map((t) => ({ label: t, topic: t })),
    correctIndex: Math.max(0, Math.min(driverChoices.length - 1, Number(dg.correctIndex ?? 0) || 0)),
    explanation: String(dg.explanation ?? ""),
  }
  const ti = (o.tradeIdea ?? {}) as Record<string, unknown>
  const direction = String(ti.direction ?? "LONG").toUpperCase() === "SHORT" ? "SHORT" : "LONG"
  const tradeIdea = {
    direction: direction as "LONG" | "SHORT",
    thesis: String(ti.thesis ?? ""),
    risk: String(ti.risk ?? ""),
    invalidation: String(ti.invalidation ?? ""),
  }
  return {
    rangeLabel: String(o.rangeLabel ?? rangeLabel),
    timeframe: (String(o.timeframe ?? timeframe) as ChartTimeframe) ?? timeframe,
    topics: topics.length ? topics.slice(0, 4) : ["Macro", "Technicals", "Sentiment"],
    terms,
    quiz,
    driverGame,
    tradeIdea,
  }
}

function clampConfidence(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(100, Math.round(x)))
}

function normalizeAction(raw: unknown): MarketThought["action"] {
  const a = String(raw ?? "").toUpperCase()
  if (a === "BUY") return "BUY"
  if (a === "WATCH" || a === "WAIT") return "WATCH"
  if (a === "IGNORE" || a === "HOLD") return "IGNORE"
  if (a === "EXPLAIN") return "EXPLAIN"
  if (a === "ERROR") return "ERROR"
  return "WATCH"
}

export function coerceMarketThought(raw: unknown, fallbackTicker: string): MarketThought {
  if (!raw || typeof raw !== "object") {
    return {
      ticker: fallbackTicker,
      thought: "Model returned an unexpected shape.",
      reasoning: [],
      confidence: 0,
      action: "ERROR",
    }
  }
  const o = raw as Record<string, unknown>
  const reasoning = Array.isArray(o.reasoning)
    ? o.reasoning.map((x) => String(x))
    : typeof o.reasoning === "string"
      ? [o.reasoning]
      : []

  return {
    ticker: String(o.ticker ?? fallbackTicker),
    thought: String(o.thought ?? ""),
    reasoning,
    confidence: clampConfidence(o.confidence),
    action: normalizeAction(o.action),
    regionLabel: o.regionLabel != null ? String(o.regionLabel) : undefined,
  }
}

export type LlmCallOptions = {
  /** Wall-clock per HTTP attempt (undici / browser AbortSignal.timeout). */
  timeoutMs?: number
  maxRetries?: number
  maxOutputTokens?: number
  temperature?: number
}

async function callGroq(prompt: string, options: LlmCallOptions = {}): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error("GROQ_API_KEY is not set")

  const timeoutMs = options.timeoutMs ?? 45_000
  const maxRetries = options.maxRetries ?? Math.max(0, Math.min(8, Number(process.env.LLM_MAX_RETRIES ?? 3)))
  const maxTokens = options.maxOutputTokens ?? 2048
  const temperature = options.temperature ?? 0.7

  const url = "https://api.groq.com/openai/v1/chat/completions"

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature,
          max_tokens: maxTokens,
          // Ask for JSON object output; still keep parseModelJson as safety.
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are Market Mind Stream. Always output ONLY valid JSON (no markdown, no extra text).",
            },
            { role: "user", content: prompt },
          ],
        }),
      })
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`Groq request timed out after ${timeoutMs}ms`)
      }
      throw e
    }

    const json = (await res.json()) as Record<string, unknown>
    if (res.ok) {
      const content =
        (json as any)?.choices?.[0]?.message?.content ??
        (json as any)?.choices?.[0]?.delta?.content
      if (typeof content !== "string") throw new Error("Empty model response")
      return content
    }

    const retriable = res.status === 429 || res.status === 503 || res.status === 408
    if (!retriable || attempt === maxRetries) {
      throw new Error(`Groq error ${res.status}: ${JSON.stringify(json)}`)
    }
    await sleep(backoffMsForAttempt(res, json, attempt))
  }

  throw new Error("Groq: retries exhausted")
}

async function callGeminiFallback(prompt: string, options: LlmCallOptions = {}): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY is not set")

  const timeoutMs = options.timeoutMs ?? 45_000
  const maxRetries = options.maxRetries ?? Math.max(0, Math.min(8, Number(process.env.LLM_MAX_RETRIES ?? 3)))
  const maxOutputTokens = options.maxOutputTokens ?? 2048
  const temperature = options.temperature ?? 0.72

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            responseMimeType: "application/json",
            maxOutputTokens,
          },
        }),
      })
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`Gemini request timed out after ${timeoutMs}ms`)
      }
      throw e
    }

    const json = (await res.json()) as Record<string, unknown>
    if (res.ok) {
      const candidates = json?.candidates as
        | Array<{ content?: { parts?: Array<{ text?: string }> } }>
        | undefined
      const text = candidates?.[0]?.content?.parts?.[0]?.text
      if (typeof text !== "string") throw new Error("Empty model response")
      return text
    }

    const retriable = res.status === 429 || res.status === 503 || res.status === 408
    if (!retriable || attempt === maxRetries) {
      throw new Error(`Gemini error ${res.status}: ${JSON.stringify(json)}`)
    }
    await sleep(backoffMsForAttempt(res, json, attempt))
  }

  throw new Error("Gemini: retries exhausted")
}

async function callLlm(prompt: string, options: LlmCallOptions = {}): Promise<string> {
  if (process.env.GROQ_API_KEY) return callGroq(prompt, options)
  return callGeminiFallback(prompt, options)
}

/** Live “desk analyst” stream — one JSON object per call */
export async function generateLiveThought(ticker: string): Promise<MarketThought> {
  const prompt = `You are a real-time sell-side desk analyst thinking out loud on a noisy trading day.

Focus ticker: ${ticker}
- Weave in plausible intraday drivers: sector flows, rates/FX/macro tone, technical posture (support/resistance, momentum), and hypothetical headlines (clearly as hypotheses, not facts).
- Sound like a human: concise, specific, no disclaimers boilerplate.
- action must be one of: BUY, WATCH, IGNORE (capital letters).
- confidence is integer 0-100.
- reasoning: 2-4 short bullets, each one concrete.

Return ONLY valid JSON matching this shape:
{
  "ticker": "${ticker}",
  "thought": "one sharp sentence",
  "reasoning": ["bullet", "bullet"],
  "confidence": 72,
  "action": "WATCH"
}`

  try {
    const text = await withLlmQueue(async () => {
      await enforceLiveMinGap(ticker)
      return callLlm(prompt, { timeoutMs: 45_000, maxRetries: 3, maxOutputTokens: 512 })
    })
    const parsed = parseModelJson(text, "live thought")
    const out = coerceMarketThought(parsed, ticker)
    markLiveComplete(ticker)
    return out
  } catch (e) {
    markLiveComplete(ticker)
    const msg = e instanceof Error ? e.message : "Unknown error"
    return {
      ticker,
      thought: msg,
      reasoning: ["Check GEMINI_API_KEY and model availability."],
      confidence: 0,
      action: "ERROR",
    }
  }
}

/** Per-attempt HTTP timeout for chart explain (Gemini can exceed a few seconds under load). */
const EXPLAIN_BUDGET_MS = Math.max(
  4000,
  Math.min(45_000, Number(process.env.GEMINI_EXPLAIN_TIMEOUT_MS ?? 14_000))
)

const TIMEFRAME_BLURB: Record<ChartTimeframe, string> = {
  "1D": "intraday session (5-minute style bars)",
  "1W": "about one week (daily bars)",
  "1M": "about one month (daily bars)",
  "3M": "about three months (weekly bars)",
  "1Y": "one year (monthly bars)",
  "5Y": "five years (quarterly bars)",
}

/** Explain a selected chart window — tuned for ~2s wall time. */
export async function generateRegionExplanation(
  ticker: string,
  rangeSummary: string,
  stats: { pctChange: number; startLabel: string; endLabel: string; timeframe: ChartTimeframe }
): Promise<MarketThought> {
  const dir =
    stats.pctChange > 0.01 ? "up" : stats.pctChange < -0.01 ? "down" : "sideways"
  const horizon = TIMEFRAME_BLURB[stats.timeframe] ?? "selected horizon"
  const prompt = `Simulated series only. Horizon: ${stats.timeframe} (${horizon}). Stock ${ticker}, window ${stats.startLabel}–${
    stats.endLabel
  }, move ${stats.pctChange >= 0 ? "+" : ""}${stats.pctChange.toFixed(
    2
  )}% (${dir}). Context: ${rangeSummary}

In "thought" (≤70 words), explain why price likely moved ${dir}. Exactly 3 strings in "reasoning" (very short). Then include a "learn" object to power a game + flashcards:
- terms: 5-8 key terms with 1-line definitions + topic
- quiz: 3 multiple-choice questions with answer + explanation
- driverGame: pick best driver category
- tradeIdea: a paper-trade idea (not advice)
Use only valid JSON strings (escape quotes inside text). No markdown.

{
  "ticker": "${ticker}",
  "thought": "...",
  "reasoning": ["...", "...", "..."],
  "confidence": 72,
  "action": "EXPLAIN",
  "regionLabel": "${stats.startLabel}–${stats.endLabel}"
  ,"learn": {
    "rangeLabel": "${stats.startLabel}–${stats.endLabel}",
    "timeframe": "${stats.timeframe}",
    "topics": ["Macro","Technicals","Sentiment"],
    "terms": [{"id":"t1","term":"...","definition":"...","topic":"Macro"}],
    "quiz": [{"id":"q1","topic":"Technicals","prompt":"...","choices":["A","B","C","D"],"correctIndex": 1,"explanation":"..."}],
    "driverGame": {"prompt":"Best driver?","choices":[{"label":"Rates","topic":"Macro"},{"label":"Earnings","topic":"Earnings"},{"label":"Momentum","topic":"Technicals"},{"label":"Risk-off","topic":"Sentiment"}],"correctIndex": 2,"explanation":"..."},
    "tradeIdea": {"direction":"LONG","thesis":"...","risk":"...","invalidation":"..."}
  }
}`

  try {
    const text = await withLlmQueue(() =>
      callLlm(prompt, {
        timeoutMs: EXPLAIN_BUDGET_MS,
        maxRetries: 0,
        maxOutputTokens: 1024,
        temperature: 0.35,
      })
    )
    const parsed = parseModelJson(text, "chart explain")
    const thought = coerceMarketThought(parsed, ticker)
    thought.action = "EXPLAIN"
    thought.regionLabel = thought.regionLabel ?? `${stats.startLabel}–${stats.endLabel}`
    const p = parsed as Record<string, unknown>
    thought.learn = coerceLearnPack(p.learn, stats.timeframe, thought.regionLabel)
    return thought
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return {
      ticker,
      thought: msg,
      reasoning: [],
      confidence: 0,
      action: "ERROR",
      regionLabel: `${stats.startLabel}–${stats.endLabel}`,
    }
  }
}

const NEWS_BUDGET_MS = Math.max(
  3000,
  Math.min(8000, Number(process.env.GEMINI_NEWS_TIMEOUT_MS ?? 5200))
)

function normImpactLabel(raw: unknown): PortfolioNewsItem["impactLabel"] {
  const s = String(raw ?? "").toLowerCase()
  if (s === "high") return "high"
  if (s === "low") return "low"
  return "medium"
}

function coercePortfolioNewsItems(raw: unknown, tickers: string[]): PortfolioNewsItem[] {
  const book = new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))
  const now = Date.now()
  if (!raw || typeof raw !== "object") return []
  const arr = (raw as { items?: unknown }).items
  if (!Array.isArray(arr)) return []
  return arr.slice(0, 14).map((row, i) => {
    const o = row as Record<string, unknown>
    const matched = Array.isArray(o.matchedTickers)
      ? o.matchedTickers.map((x) => String(x).trim().toUpperCase()).filter((t) => book.has(t))
      : []
    const tk = String(o.ticker ?? matched[0] ?? tickers[0] ?? "BOOK")
      .trim()
      .toUpperCase()
    const score = clampConfidence(o.impactScore)
    const title = String(o.title ?? `Item ${i + 1}`).slice(0, 200)
    const linkRaw = String(o.link ?? "#")
    const link = linkRaw.startsWith("http://") || linkRaw.startsWith("https://") ? linkRaw : "#"
    return {
      id: String(o.id ?? `n-${i}-${title.slice(0, 8)}`),
      title,
      summary: String(o.summary ?? "").slice(0, 280),
      link,
      publisher: String(o.publisher ?? "Gemini desk"),
      publishedAt:
        typeof o.publishedAt === "number" && Number.isFinite(o.publishedAt)
          ? Math.min(now, Math.max(0, o.publishedAt))
          : now - i * 120_000,
      ticker: book.has(tk) ? tk : tickers[0] ?? "BOOK",
      impactScore: score,
      impactLabel: normImpactLabel(o.impactLabel),
      matchedTickers: matched.length > 0 ? matched : book.has(tk) ? [tk] : [],
    }
  })
}

/** Synthetic portfolio-relevant scan — one batched Gemini call (use with server cache). */
export async function generatePortfolioNewsDigest(tickers: string[]): Promise<PortfolioNewsItem[]> {
  const list = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))].slice(0, 24)
  if (list.length === 0) return []

  const now = Date.now()
  const prompt = `Portfolio tickers: ${list.join(", ")}
You are generating a **synthetic** short market scan for a private UI (not real wire headlines, not browsing the web). Invent 8–10 plausible headline + one-line blurbs that *could* matter for these names today — macro, sector, earnings tone, rates, AI capex, regulation, etc.
Rules:
- JSON only, shape: {"items":[{"id":"slug","title":"...","summary":"...","impactScore":78,"impactLabel":"high","matchedTickers":["TICK"],"ticker":"MAIN","publisher":"Gemini desk","publishedAt":${now},"link":"#"}]}
- impactScore: integer 0-100 (higher = more important to this book).
- publishedAt: unix ms, spread between ${now - 2_400_000} and ${now}.
- link must be "#" (no URLs).
- matchedTickers must be symbols from the portfolio list only.
- Sort items by impactScore descending in the array.`

  try {
    const text = await withLlmQueue(() =>
      callLlm(prompt, {
        timeoutMs: NEWS_BUDGET_MS,
        maxRetries: 0,
        maxOutputTokens: 900,
        temperature: 0.62,
      })
    )
    const parsed = parseModelJson(text, "portfolio news")
    const rows = coercePortfolioNewsItems(parsed, list)
    return [...rows].sort((a, b) => b.impactScore - a.impactScore)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "digest failed"
    throw new Error(`Portfolio news digest: ${msg}`)
  }
}
