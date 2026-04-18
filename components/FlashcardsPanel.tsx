"use client"

import { useMemo, useState } from "react"
import type { LearnTerm } from "@/lib/types"
import { useLearningStore } from "@/hooks/useLearningStore"

function byDue(a: { dueAt: number }, b: { dueAt: number }) {
  return a.dueAt - b.dueAt
}

export default function FlashcardsPanel() {
  const { ready, store, dueTermIds, gradeCard } = useLearningStore()
  const [showDef, setShowDef] = useState(false)
  const [idx, setIdx] = useState(0)

  const due = useMemo(() => {
    const t = Date.now()
    return Object.values(store.cards)
      .filter((c) => c.dueAt <= t)
      .sort(byDue)
      .map((c) => c.termId)
  }, [store.cards])

  const activeId = due[idx] ?? null
  const term: LearnTerm | null = activeId ? store.terms[activeId] ?? null : null

  const next = () => {
    setShowDef(false)
    setIdx((i) => Math.min(due.length, i + 1))
  }

  if (!ready) {
    return (
      <div className="p-6 font-mono text-sm text-zinc-500">
        Loading flashcards…
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/90 bg-[#06080c] px-5 py-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Flashcards
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
            Due now: <span className="text-emerald-300/90">{dueTermIds.length}</span> · Total terms:{" "}
            <span className="text-zinc-300">{Object.keys(store.terms).length}</span>
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {term ? (
          <div className="mx-auto max-w-2xl">
            <div className="rounded-lg border border-zinc-800/90 bg-[#0a0d14] p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    {term.topic}
                  </div>
                  <div className="mt-2 font-mono text-2xl font-semibold text-zinc-100">
                    {term.term}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDef((s) => !s)}
                  className="rounded-md border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 font-mono text-xs text-emerald-200 hover:bg-emerald-500/20"
                >
                  {showDef ? "Hide" : "Reveal"}
                </button>
              </div>

              {showDef ? (
                <div className="mt-4 space-y-3 border-t border-zinc-800/80 pt-4">
                  <p className="font-mono text-sm leading-relaxed text-zinc-300">
                    {term.definition}
                  </p>
                  {term.example ? (
                    <p className="rounded-md border border-zinc-800/80 bg-zinc-950/40 p-3 font-mono text-xs text-zinc-400">
                      <span className="text-zinc-300">Example:</span> {term.example}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 font-mono text-xs text-zinc-500">
                  Try to recall the definition first, then reveal.
                </p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              {(
                [
                  { g: 0 as const, label: "Again" },
                  { g: 1 as const, label: "Hard" },
                  { g: 2 as const, label: "Good" },
                  { g: 3 as const, label: "Easy" },
                ] as const
              ).map((x) => (
                <button
                  key={x.g}
                  type="button"
                  disabled={!showDef}
                  onClick={() => {
                    gradeCard(term.id, x.g)
                    next()
                  }}
                  className={`rounded-md border px-3 py-2 font-mono text-xs transition-colors disabled:cursor-not-allowed ${
                    showDef
                      ? "border-zinc-700 bg-zinc-900/40 text-zinc-200 hover:border-emerald-500/40 hover:text-emerald-200"
                      : "border-zinc-800 text-zinc-600"
                  }`}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center font-mono text-sm text-zinc-500">
            No flashcards due. Generate more terms by selecting a chart range and playing the game.
          </div>
        )}
      </div>
    </div>
  )
}

