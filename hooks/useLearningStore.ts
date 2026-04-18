"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { FlashcardState, LearnPack, LearnTerm, QuizAttempt, TopicMastery } from "@/lib/types"

type LearningStore = {
  terms: Record<string, LearnTerm>
  cards: Record<string, FlashcardState>
  attempts: QuizAttempt[]
}

const KEY = "mms-learning-v1"

function now() {
  return Date.now()
}

function safeParse(raw: string | null): LearningStore | null {
  if (!raw) return null
  try {
    const j = JSON.parse(raw) as LearningStore
    if (!j || typeof j !== "object") return null
    return {
      terms: j.terms && typeof j.terms === "object" ? j.terms : {},
      cards: j.cards && typeof j.cards === "object" ? j.cards : {},
      attempts: Array.isArray(j.attempts) ? j.attempts : [],
    }
  } catch {
    return null
  }
}

function boxToDelayDays(box: FlashcardState["box"]) {
  if (box === 1) return 0
  if (box === 2) return 1
  if (box === 3) return 3
  if (box === 4) return 7
  return 14
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

export function useLearningStore() {
  const [ready, setReady] = useState(false)
  const [store, setStore] = useState<LearningStore>({ terms: {}, cards: {}, attempts: [] })

  useEffect(() => {
    const parsed = safeParse(typeof window !== "undefined" ? localStorage.getItem(KEY) : null)
    if (parsed) setStore(parsed)
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(KEY, JSON.stringify(store))
    } catch {
      /* ignore */
    }
  }, [store, ready])

  const ingestLearnPack = useCallback((pack: LearnPack) => {
    setStore((prev) => {
      const terms = { ...prev.terms }
      const cards = { ...prev.cards }

      for (const t of pack.terms) {
        terms[t.id] = t
        if (!cards[t.id]) {
          cards[t.id] = {
            termId: t.id,
            box: 1,
            dueAt: now(),
            seenCount: 0,
            correctCount: 0,
          }
        }
      }

      return { ...prev, terms, cards }
    })
  }, [])

  const gradeCard = useCallback((termId: string, grade: 0 | 1 | 2 | 3) => {
    setStore((prev) => {
      const cur = prev.cards[termId]
      if (!cur) return prev
      const correctish = grade >= 2
      const nextBox = correctish ? (Math.min(5, cur.box + 1) as FlashcardState["box"]) : 1
      const delayDays = boxToDelayDays(nextBox)
      const dueAt = now() + delayDays * 24 * 60 * 60 * 1000
      return {
        ...prev,
        cards: {
          ...prev.cards,
          [termId]: {
            ...cur,
            box: nextBox,
            dueAt,
            lastGrade: grade,
            seenCount: cur.seenCount + 1,
            correctCount: cur.correctCount + (correctish ? 1 : 0),
          },
        },
      }
    })
  }, [])

  const recordAttempt = useCallback((a: QuizAttempt) => {
    setStore((prev) => ({ ...prev, attempts: [a, ...prev.attempts].slice(0, 800) }))
  }, [])

  const dueTermIds = useMemo(() => {
    const t = now()
    return Object.values(store.cards)
      .filter((c) => c.dueAt <= t)
      .sort((a, b) => a.dueAt - b.dueAt)
      .map((c) => c.termId)
  }, [store.cards])

  const mastery: TopicMastery[] = useMemo(() => {
    const byTopic: Record<string, { score: number; attempts: number; correct: number; streak: number }> = {}
    // Initialize known topics as they appear
    for (const a of store.attempts.slice(0, 300)) {
      const key = a.topic
      if (!byTopic[key]) byTopic[key] = { score: 50, attempts: 0, correct: 0, streak: 0 }
      const s = byTopic[key]
      s.attempts += 1
      s.correct += a.correct ? 1 : 0
      // EMA update: push toward 0 or 1 based on correct and confidence
      const conf = a.confidence / 3
      const target = a.correct ? 1 : 0
      const alpha = 0.08 + 0.10 * clamp01(conf)
      s.score = (1 - alpha) * s.score + alpha * (target * 100)
    }
    // Streak calculation (recent)
    const recent = [...store.attempts].slice(0, 200).reverse()
    const streakBy: Record<string, number> = {}
    for (const a of recent) {
      const k = a.topic
      if (!streakBy[k]) streakBy[k] = 0
      if (a.correct) streakBy[k] += 1
      else streakBy[k] = 0
    }
    return Object.entries(byTopic).map(([topic, v]) => ({
      topic: topic as TopicMastery["topic"],
      score: Math.round(v.score),
      attempts: v.attempts,
      correct: v.correct,
      streak: streakBy[topic] ?? 0,
    }))
  }, [store.attempts])

  return {
    ready,
    store,
    ingestLearnPack,
    gradeCard,
    recordAttempt,
    dueTermIds,
    mastery,
  }
}

