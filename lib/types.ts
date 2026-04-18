export type MarketAction = "BUY" | "WATCH" | "IGNORE" | "EXPLAIN" | "ERROR"

export type MarketThought = {
  ticker: string
  thought: string
  reasoning: string[]
  confidence: number
  action: MarketAction
  /** Present for chart-region explanations */
  regionLabel?: string
  /** Optional learning payload for games/flashcards */
  learn?: LearnPack
}

/** Simulated series horizon (labels + bar count change per range). */
export type ChartTimeframe = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y"

export const CHART_TIMEFRAMES: { id: ChartTimeframe; short: string; detail: string }[] = [
  { id: "1D", short: "1D", detail: "Intraday · 5m" },
  { id: "1W", short: "1W", detail: "Daily · 7 bars" },
  { id: "1M", short: "1M", detail: "Daily · ~1 mo" },
  { id: "3M", short: "3M", detail: "Weekly · quarter" },
  { id: "1Y", short: "1Y", detail: "Monthly" },
  { id: "5Y", short: "5Y", detail: "Quarterly" },
]

export type ChartPoint = {
  time: number
  label: string
  price: number
}

export type ChartSelectionRange = {
  ticker: string
  /** Horizon used for this chart (sent to explain API). */
  timeframe: ChartTimeframe
  startIndex: number
  endIndex: number
  startLabel: string
  endLabel: string
  startPrice: number
  endPrice: number
  pctChange: number
}

export type LearnTopic = "Macro" | "Earnings" | "Technicals" | "Sentiment" | "Risk" | "MarketStructure"

export type LearnTerm = {
  id: string
  term: string
  definition: string
  topic: LearnTopic
  example?: string
}

export type LearnQuizQuestion = {
  id: string
  topic: LearnTopic
  prompt: string
  choices: string[]
  correctIndex: number
  explanation: string
}

export type LearnDriverChoice = {
  label: string
  topic: LearnTopic
}

export type LearnDriverGame = {
  prompt: string
  choices: LearnDriverChoice[]
  correctIndex: number
  explanation: string
}

export type PaperTradeIdea = {
  direction: "LONG" | "SHORT"
  thesis: string
  risk: string
  invalidation: string
}

export type LearnPack = {
  rangeLabel: string
  timeframe: ChartTimeframe
  topics: LearnTopic[]
  terms: LearnTerm[]
  quiz: LearnQuizQuestion[]
  driverGame: LearnDriverGame
  tradeIdea: PaperTradeIdea
}

export type FlashcardState = {
  termId: string
  box: 1 | 2 | 3 | 4 | 5
  dueAt: number
  lastGrade?: 0 | 1 | 2 | 3
  seenCount: number
  correctCount: number
}

export type QuizAttempt = {
  id: string
  ts: number
  questionId: string
  topic: LearnTopic
  correct: boolean
  selectedIndex: number
  confidence: 0 | 1 | 2 | 3
}

export type TopicMastery = {
  topic: LearnTopic
  score: number // 0-100
  attempts: number
  correct: number
  streak: number
}

/** Gemini-generated portfolio “news desk” line (not live wire copy). */
export type PortfolioNewsItem = {
  id: string
  title: string
  summary: string
  link: string
  publisher: string
  publishedAt: number
  /** Primary symbol the item is about */
  ticker: string
  impactScore: number
  impactLabel: "high" | "medium" | "low"
  matchedTickers: string[]
}
