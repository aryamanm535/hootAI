# Hoot — markets made simple 
https://use-hoot.vercel.app/
An AI owl tutor that turns any stock chart into an interactive lesson. Drag across a region of the chart and Hoot explains, in plain English, *why* the price moved — then quizzes you on it and builds flashcards from the new terms.

Built for Hook 'Em Hacks 2026 at UT Austin.

**Live demo:** [use-hoot.vercel.app](https://use-hoot.vercel.app/)
**Demo video:** [youtu.be/4kQi3DuMSqk](https://youtu.be/4kQi3DuMSqk)

---

## The idea

When you open a stock chart, all you see is a line going up and down — you don't see *why*. And every explanation online assumes you already know the jargon. Hoot is a friendly tutor that sits on your shoulder while you browse the markets and explains things as you go. No finance background required.

## Features

- **Drag-to-explain charts.** Highlight any slice of a price chart and Gemini writes up what happened, ranks the drivers by importance, and flags any terms a beginner wouldn't know.
- **Auto-generated quizzes.** Every explanation spins up a short quiz tied to that exact move — driver questions, term definitions, direction calls. Earn XP for correct answers.
- **Spaced-repetition flashcards.** Terms you miss get dropped into a flashcard deck and resurfaced on a Leitner-style schedule so they actually stick.
- **Mastery dashboard.** See accuracy per topic (Macro, Earnings, Technicals, Sentiment, Risk, Market Structure) so you know what you're weak on.
- **Finance-only chatbot with live prices.** Ask the owl anything about markets. It pulls live Yahoo Finance quotes before responding, so "what's Apple trading at?" actually works — no "I don't have real-time access" cop-outs.
- **Gamified progress.** XP, ranks, and badge unlocks for hitting milestones. Progress persists locally, no account required.
- **Candles or line view.** Toggle between a smoothed line and full OHLC candles on any timeframe (1D through 5Y).

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack) with React 19 and TypeScript
- **Styling:** Tailwind CSS v4, Framer Motion for animations
- **Charts:** Recharts + custom SVG overlays for the candle layer
- **AI:**
  - **Gemini** for region explanations and learn-pack generation (quizzes, flashcard terms, trade ideas)
  - **Groq** (`llama-3.1-8b-instant`) for the conversational chatbot
- **Market data:** `yahoo-finance2` for live quotes and historical candles, Finnhub as a fallback
- **Persistence:** `localStorage` — everything stays client-side, no backend required
- **Deployment:** Vercel

## Project structure

```
app/
  api/
    chart/     — historical OHLC data
    chat/      — finance chatbot (Groq + live Yahoo quotes)
    explain/   — Gemini region explanations + learn packs
    news/      — market headlines
  page.tsx     — main UI (Home, Chart, Learn, You tabs)
components/
  StockChart.tsx        — chart with drag-to-select
  AiThoughtCard.tsx     — explanation + quiz card
  FlashcardsPanel.tsx   — spaced-repetition review
  MasteryPanel.tsx      — per-topic accuracy dashboard
  FinanceChatbot.tsx    — owl chatbot popup
  CompanionOwl.tsx      — floating owl mascot
  Owl.tsx               — owl SVG (three poses)
hooks/
  useLearningStore.ts   — flashcards, attempts, mastery math
  useGameProfile.ts     — XP, ranks, badges
lib/
  ai.ts                 — Gemini prompt + learn-pack synthesis
  marketChart.ts        — price fetching + downsampling
```

## Running locally

```bash
npm install
cp .env.local.example .env.local   # fill in keys
npm run dev
```

Then open [localhost:3000](http://localhost:3000).

### Required env vars

```
GROQ_API_KEY=      # for the chatbot
GEMINI_API_KEY=    # for chart explanations
```

### Optional

```
GROQ_MODEL=llama-3.1-8b-instant
FINNHUB_API_KEY=   # fallback market data source
```

## Hackathon tracks

- **Intelligent Financial & Market Systems** — primary track
- **Best Use of Gemini API** — Gemini powers the core chart-explanation and learn-pack generation loop

## Team

Built in 24 hours at Hook 'Em Hacks 2026.
