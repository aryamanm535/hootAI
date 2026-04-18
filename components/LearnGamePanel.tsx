"use client"

import { useMemo, useState } from "react"
import type { LearnPack, LearnQuizQuestion, LearnTopic, QuizAttempt } from "@/lib/types"

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function topicColor(topic: LearnTopic) {
  switch (topic) {
    case "Macro":
      return "border-blue-500/30 bg-blue-500/5 text-blue-200"
    case "Earnings":
      return "border-purple-500/30 bg-purple-500/5 text-purple-200"
    case "Technicals":
      return "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
    case "Sentiment":
      return "border-amber-500/30 bg-amber-500/5 text-amber-200"
    case "Risk":
      return "border-red-500/30 bg-red-500/5 text-red-200"
    default:
      return "border-zinc-700 bg-zinc-900/40 text-zinc-200"
  }
}

export default function LearnGamePanel({
  pack,
  onAttempt,
  initialSection = "driver",
}: {
  pack: LearnPack
  onAttempt: (a: QuizAttempt) => void
  initialSection?: "driver" | "quiz" | "trade"
}) {
  const [picked, setPicked] = useState<Record<string, number>>({})
  const [driverPicked, setDriverPicked] = useState<number | null>(null)
  const [conf, setConf] = useState<0 | 1 | 2 | 3>(2)
  const [section, setSection] = useState<"driver" | "quiz" | "trade">(initialSection)

  const quiz = useMemo(() => pack.quiz?.slice(0, 4) ?? [], [pack.quiz])

  const answer = (q: LearnQuizQuestion, idx: number) => {
    setPicked((p) => ({ ...p, [q.id]: idx }))
    onAttempt({
      id: uid(),
      ts: Date.now(),
      questionId: q.id,
      topic: q.topic,
      correct: idx === q.correctIndex,
      selectedIndex: idx,
      confidence: conf,
    })
  }

  const driverChoices = pack.driverGame?.choices ?? []
  const driverCorrect = pack.driverGame?.correctIndex ?? 0

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-zinc-800/90 bg-gradient-to-b from-[#0b1020] to-[#070a12] p-4 shadow-[0_0_30px_-18px_rgba(34,197,94,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold tracking-tight text-zinc-100">Market Game</div>
            <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
              Selection: <span className="text-cyan-300/80">{pack.rangeLabel}</span> ·{" "}
              <span className="text-zinc-400">{pack.timeframe}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
            Confidence
            <select
              value={conf}
              onChange={(e) => setConf(Number(e.target.value) as 0 | 1 | 2 | 3)}
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
            >
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {(
            [
              { id: "driver" as const, label: "Driver" },
              { id: "quiz" as const, label: "Quiz" },
              { id: "trade" as const, label: "Trade" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSection(t.id)}
              className={`rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                section === t.id
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                  : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {section === "driver" ? (
      <div className="rounded-xl border border-zinc-800/90 bg-[#0a0d14] p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold tracking-tight text-zinc-100">Guess the driver</div>
          <span className="rounded border border-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            {pack.driverGame?.choices?.length ?? 0} choices
          </span>
        </div>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-400">{pack.driverGame?.prompt}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {driverChoices.map((c, i) => {
            const chosen = driverPicked === i
            const correct = driverPicked != null && i === driverCorrect
            const wrong = driverPicked != null && chosen && i !== driverCorrect
            return (
              <button
                key={`${c.label}-${i}`}
                type="button"
                onClick={() => setDriverPicked(i)}
                className={`rounded-md border px-3 py-2 font-mono text-[11px] transition-colors ${
                  chosen
                    ? correct
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                      : "border-red-500/60 bg-red-500/10 text-red-100"
                    : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                {c.label}
                <span className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] ${topicColor(c.topic)}`}>
                  {c.topic}
                </span>
                {wrong ? <span className="ml-2 text-[10px] text-red-300">✕</span> : null}
                {correct && chosen ? <span className="ml-2 text-[10px] text-emerald-300">✓</span> : null}
              </button>
            )
          })}
        </div>
        {driverPicked != null ? (
          <p className="mt-3 border-t border-zinc-800/80 pt-3 font-mono text-[11px] text-zinc-400">
            <span className="text-zinc-200">Why:</span> {pack.driverGame.explanation}
          </p>
        ) : null}
      </div>
      ) : null}

      {section === "quiz" ? (
      <div className="rounded-xl border border-zinc-800/90 bg-[#0a0d14] p-4">
        <div className="text-sm font-semibold tracking-tight text-zinc-100">Quick quiz</div>
        <div className="mt-3 space-y-3">
          {quiz.map((q) => {
            const sel = picked[q.id]
            return (
              <div key={q.id} className="rounded-md border border-zinc-800/80 bg-zinc-950/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="font-mono text-[11px] text-zinc-200">{q.prompt}</div>
                  <span className={`rounded border px-2 py-0.5 font-mono text-[10px] ${topicColor(q.topic)}`}>
                    {q.topic}
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  {q.choices.map((c, i) => {
                    const chosen = sel === i
                    const show = sel != null
                    const correct = i === q.correctIndex
                    const cls = show
                      ? correct
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                        : chosen
                          ? "border-red-500/60 bg-red-500/10 text-red-100"
                          : "border-zinc-800 text-zinc-400"
                      : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
                    return (
                      <button
                        key={`${q.id}-${i}`}
                        type="button"
                        disabled={sel != null}
                        onClick={() => answer(q, i)}
                        className={`rounded-md border px-3 py-2 text-left font-mono text-[11px] transition-colors disabled:cursor-not-allowed ${cls}`}
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>
                {sel != null ? (
                  <p className="mt-2 font-mono text-[11px] text-zinc-400">
                    <span className="text-zinc-200">Explanation:</span> {q.explanation}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      ) : null}

      {section === "trade" ? (
      <div className="rounded-xl border border-zinc-800/90 bg-[#0a0d14] p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold tracking-tight text-zinc-100">Paper trade idea</div>
          <span className="rounded border border-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            sim only
          </span>
        </div>
        <div className="mt-2 font-mono text-[11px] text-zinc-400">
          <span className="text-zinc-200">{pack.tradeIdea.direction}:</span> {pack.tradeIdea.thesis}
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div className="rounded-md border border-zinc-800/80 bg-zinc-950/40 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Risk</div>
            <div className="mt-1 font-mono text-[11px] text-zinc-300">{pack.tradeIdea.risk}</div>
          </div>
          <div className="rounded-md border border-zinc-800/80 bg-zinc-950/40 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Invalidation</div>
            <div className="mt-1 font-mono text-[11px] text-zinc-300">{pack.tradeIdea.invalidation}</div>
          </div>
        </div>
      </div>
      ) : null}
    </div>
  )
}

