"use client"

import { motion } from "framer-motion"
import type { LearnPack, MarketThought } from "@/lib/types"
import { clsx } from "clsx"

const borderByAction: Record<string, string> = {
  BUY: "border-emerald-500/70 shadow-[0_0_20px_-8px_rgba(34,197,94,0.5)]",
  WATCH: "border-amber-400/55 shadow-[0_0_16px_-10px_rgba(251,191,36,0.35)]",
  IGNORE: "border-zinc-600/60",
  EXPLAIN: "border-cyan-500/55 shadow-[0_0_18px_-10px_rgba(6,182,212,0.35)]",
  ERROR: "border-red-500/65 shadow-[0_0_18px_-10px_rgba(239,68,68,0.35)]",
}

const badgeByAction: Record<string, string> = {
  BUY: "bg-emerald-500/15 text-emerald-300",
  WATCH: "bg-amber-500/15 text-amber-200",
  IGNORE: "bg-zinc-700/40 text-zinc-300",
  EXPLAIN: "bg-cyan-500/15 text-cyan-200",
  ERROR: "bg-red-500/15 text-red-300",
}

export default function AiThoughtCard({
  item,
  i,
  onLaunchLearn,
}: {
  item: MarketThought
  i: number
  onLaunchLearn?: (pack: LearnPack, dest: "driver" | "quiz" | "trade" | "flashcards" | "mastery") => void
}) {
  const action = item.action in borderByAction ? item.action : "WATCH"

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(i * 0.04, 0.2) }}
      className={clsx(
        "mb-3 rounded-lg border bg-[#0c1018] p-3.5",
        borderByAction[action]
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-sm font-semibold tracking-tight text-zinc-100">
          {item.ticker}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={clsx(
              "rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase",
              badgeByAction[action]
            )}
          >
            {action}
          </span>
          <span className="font-mono text-[11px] text-zinc-500">{item.confidence}%</span>
        </div>
      </div>
      {item.regionLabel ? (
        <div className="mt-1.5 font-mono text-[10px] text-cyan-500/80">{item.regionLabel}</div>
      ) : null}
      <p className="mt-2 text-sm leading-snug text-zinc-200">{item.thought}</p>
      {item.reasoning.length > 0 ? (
        <ul className="mt-2.5 space-y-1 border-t border-zinc-800/80 pt-2.5">
          {item.reasoning.map((r, j) => (
            <li key={j} className="flex gap-2 text-xs text-zinc-400">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500/70" />
              <span className="leading-relaxed">{r}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {item.learn && onLaunchLearn ? (
        <div className="mt-3 border-t border-zinc-800/80 pt-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Learn actions
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                { id: "driver" as const, label: "Play driver" },
                { id: "quiz" as const, label: "Play quiz" },
                { id: "trade" as const, label: "Paper trade" },
                { id: "flashcards" as const, label: "Flashcards" },
                { id: "mastery" as const, label: "Mastery" },
              ] as const
            ).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onLaunchLearn(item.learn as LearnPack, b.id)}
                className="rounded-md border border-zinc-700 bg-zinc-950/40 px-2.5 py-1.5 font-mono text-[11px] text-zinc-200 hover:border-emerald-500/40 hover:text-emerald-200"
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </motion.article>
  )
}
