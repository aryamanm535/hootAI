"use client"

import { useMemo } from "react"
import { useLearningStore } from "@/hooks/useLearningStore"
import type { TopicMastery } from "@/lib/types"

function barColor(score: number) {
  if (score >= 75) return "bg-emerald-500/70"
  if (score >= 55) return "bg-amber-500/70"
  return "bg-red-500/70"
}

export default function MasteryPanel() {
  const { ready, mastery, store } = useLearningStore()

  const rows = useMemo(() => {
    const m = [...mastery].sort((a, b) => b.score - a.score)
    return m.length ? m : []
  }, [mastery])

  if (!ready) {
    return <div className="p-6 font-mono text-sm text-zinc-500">Loading mastery…</div>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-zinc-800/90 bg-[#06080c] px-5 py-3">
        <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          Knowledge dashboard
        </div>
        <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
          Mastery scores are inferred from your quiz answers (EMA). Total attempts:{" "}
          <span className="text-zinc-300">{store.attempts.length}</span>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center font-mono text-sm text-zinc-500">
            No quiz attempts yet. Play the Market Game after selecting a chart window.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r: TopicMastery) => (
              <div
                key={r.topic}
                className="rounded-lg border border-zinc-800/90 bg-[#0a0d14] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-mono text-sm font-semibold text-zinc-100">{r.topic}</div>
                  <div className="font-mono text-[11px] text-zinc-500">
                    {r.correct}/{r.attempts} correct · streak {r.streak}
                  </div>
                </div>
                <div className="mt-3 h-2 w-full rounded bg-zinc-900/60">
                  <div
                    className={`h-2 rounded ${barColor(r.score)}`}
                    style={{ width: `${Math.max(0, Math.min(100, r.score))}%` }}
                  />
                </div>
                <div className="mt-2 font-mono text-[11px] text-zinc-400">
                  Score: <span className="text-zinc-200">{r.score}</span>/100
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

