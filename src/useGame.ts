// src/useGame.ts
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, newDeck } from './cards'
import type { GameSpec } from './games/spec'

type Phase = 'bet' | 'deal' | 'draw' | 'show'
const COIN_VALUE_DOLLARS = 1

// Shared money/bank keys (same for all games)
const BANK_KEY        = 'bank_balance'
const CREDITS_KEY     = 'credits'
const P_IN_KEY        = 'bank_in_total'
const P_OUT_KEY       = 'bank_out_total'
const REWARDS_KEY     = 'rewards_points'
const REWARDS_REM_KEY = 'rewards_remainder'

// Speed prefs (persisted)
const DEAL_MS_KEY = 'deal_ms'
const DRAW_MS_KEY = 'draw_ms'

function readNum(key: string, def = 0) {
  const n = Number(localStorage.getItem(key))
  return Number.isFinite(n) ? n : def
}
function writeNum(key: string, val: number) {
  localStorage.setItem(key, String(val))
}

function maskEquals(a: boolean[], b: boolean[]) {
  for (let i = 0; i < 5; i++) if (!!a[i] !== !!b[i]) return false
  return true
}

/** Compute payout from the spec’s paytable; returns 0 for “Nothing”. */
function payoutFromSpec(spec: GameSpec, rank: string, bet: number): number {
  const row = (spec.paytable as Record<string, number[] | undefined>)[rank]
  if (!row) return 0
  const idx = Math.min(5, Math.max(1, bet)) - 1
  return row[idx] ?? 0
}

export function useGame(spec: GameSpec) {
  // Per-game keys (namespaced by spec.id)
  const ACC_CORRECT_KEY = `acc_correct:${spec.id}`
  const ACC_TOTAL_KEY   = `acc_total:${spec.id}`
  const HINTS_KEY       = `hintsOn:${spec.id}`

  // Credits & gameplay
  const [credits, setCredits] = useState<number>(() => readNum(CREDITS_KEY, 200))
  const [bet, setBet] = useState(1)
  const [deck, setDeck] = useState<Card[]>(newDeck())
  const [hand, setHand] = useState<Card[]>([])
  const [holds, setHolds] = useState<boolean[]>([false,false,false,false,false])
  const [phase, setPhase] = useState<Phase>('bet')

  // Animation & reveal state
  const [revealMask, setRevealMask] = useState<boolean[]>([false,false,false,false,false]) // false = show back
  const [isAnimating, setIsAnimating] = useState(false)
  const dealTimers = useRef<number[]>([])
  const drawTimers = useRef<number[]>([])

  // Speed (persisted; default slow 360)
  const [dealIntervalMs, setDealIntervalMs] = useState<number>(() => readNum(DEAL_MS_KEY, 360) || 360)
  const [drawIntervalMs, setDrawIntervalMs] = useState<number>(() => readNum(DRAW_MS_KEY, 360) || 360)
  useEffect(() => { writeNum(DEAL_MS_KEY, dealIntervalMs) }, [dealIntervalMs])
  useEffect(() => { writeNum(DRAW_MS_KEY, drawIntervalMs) }, [drawIntervalMs])

  // Results
  const [result, setResult] = useState<{rank: string, payout: number} | null>(null)
  const [initialRank, setInitialRank] = useState<string | null>(null)

  // Flip-backs deferral when busting
  const [needFlipBacksAfterRefill, setNeedFlipBacksAfterRefill] = useState(false)

  // Rewards (summary)
  const [rewardsPoints, setRewardsPoints] = useState<number>(() => readNum(REWARDS_KEY, 0))
  const [rewardsRemainderDollars, setRewardsRemainderDollars] = useState<number>(() => readNum(REWARDS_REM_KEY, 0))

  // Coaching state (+ reasons + equivalent holds)
  const [promptedThisRound, setPromptedThisRound] = useState(false)
  const [suggestion, setSuggestion] = useState<boolean[] | null>(null)
  const [suggestionWhy, setSuggestionWhy] = useState<string | null>(null)
  const [equivalentMasks, setEquivalentMasks] = useState<boolean[][]>([])

  // Hints toggle — per game (persisted)
  const [hintsEnabled, setHintsEnabled] = useState<boolean>(() => {
    const s = localStorage.getItem(HINTS_KEY)
    return s === null ? true : s === 'true'
  })
  useEffect(() => { localStorage.setItem(HINTS_KEY, String(hintsEnabled)) }, [HINTS_KEY, hintsEnabled])

  // Accuracy — per game (persisted)
  const [accCorrect, setAccCorrect] = useState<number>(() => readNum(ACC_CORRECT_KEY, 0))
  const [accTotal, setAccTotal] = useState<number>(() => readNum(ACC_TOTAL_KEY, 0))

  // Persist + broadcast
  useEffect(() => {
    writeNum(CREDITS_KEY, credits)
    window.dispatchEvent(new CustomEvent('app:credits', { detail: credits }))
  }, [credits])
  useEffect(() => { writeNum(REWARDS_KEY, rewardsPoints); window.dispatchEvent(new Event('app:rewards')) }, [rewardsPoints])
  useEffect(() => { writeNum(REWARDS_REM_KEY, rewardsRemainderDollars) }, [rewardsRemainderDollars])
  useEffect(() => { writeNum(ACC_CORRECT_KEY, accCorrect) }, [ACC_CORRECT_KEY, accCorrect])
  useEffect(() => { writeNum(ACC_TOTAL_KEY, accTotal) }, [ACC_TOTAL_KEY, accTotal])

  // Listen for external accuracy resets (from BankPanel)
  useEffect(() => {
    const onAccuracy = () => {
      setAccCorrect(readNum(ACC_CORRECT_KEY, 0))
      setAccTotal(readNum(ACC_TOTAL_KEY, 0))
    }
    window.addEventListener('app:accuracy', onAccuracy)
    return () => window.removeEventListener('app:accuracy', onAccuracy)
  }, [ACC_CORRECT_KEY, ACC_TOTAL_KEY])

  // If the active game spec changes, clear trainer + stop animations
  useEffect(() => {
    setPromptedThisRound(false)
    setSuggestion(null)
    setSuggestionWhy(null)
    setEquivalentMasks([])
    // stop timers
    dealTimers.current.forEach(id => clearTimeout(id))
    drawTimers.current.forEach(id => clearTimeout(id))
    dealTimers.current = []
    drawTimers.current = []
    setIsAnimating(false)
  }, [spec.id])

  // UI helpers
  function toggleHold(i: number) {
    if (phase !== 'deal' && phase !== 'draw') return
    if (isAnimating) return
    setHolds(h => h.map((v,idx)=> idx===i ? !v : v))
  }
  function changeBet(delta: number) { setBet(b => Math.min(5, Math.max(1, b + delta))) }
  function setMaxBet() { setBet(5) }

  // --- Money actions (in-game) ---
  function insert(amount: number) {
    if (amount <= 0) return
    const bank = readNum(BANK_KEY, 500)
    const m = Math.min(amount, bank)
    if (m <= 0) return
    writeNum(BANK_KEY, bank - m)
    setCredits(c => c + m)
    writeNum(P_IN_KEY, readNum(P_IN_KEY, 0) + m)
    window.dispatchEvent(new Event('app:bank'))
    window.dispatchEvent(new Event('app:bank_totals'))

    // If we were waiting to flip backs after a bust, do it on first refill
    if (needFlipBacksAfterRefill) {
      setRevealMask([false,false,false,false,false]) // silently flip to backs
      setNeedFlipBacksAfterRefill(false)
    }
  }
  function cashOutAll() {
    if (credits <= 0) return
    const bank = readNum(BANK_KEY, 500)
    const m = credits
    writeNum(BANK_KEY, bank + m)
    setCredits(0)
    writeNum(P_OUT_KEY, readNum(P_OUT_KEY, 0) + m)
    setHand([]); setHolds([false,false,false,false,false]); setPhase('bet'); setResult(null); setInitialRank(null)
    setRevealMask([false,false,false,false,false])
    window.dispatchEvent(new Event('app:bank'))
    window.dispatchEvent(new Event('app:bank_totals'))
  }

  function clearTimers() {
    dealTimers.current.forEach(id => clearTimeout(id))
    drawTimers.current.forEach(id => clearTimeout(id))
    dealTimers.current = []
    drawTimers.current = []
  }

  // Start a hand (sequential reveal)
  function deal() {
    if (!canDeal) return
    if (isAnimating) return
    clearTimers()

    setCredits(c => c - bet)

    // Rewards: +1pt / $10 wagered
    const dollarsThisHand = bet * COIN_VALUE_DOLLARS
    setRewardsRemainderDollars(rem => {
      const total = rem + dollarsThisHand
      const newPoints = Math.floor(total / 10)
      if (newPoints > 0) setRewardsPoints(p => p + newPoints)
      return total % 10
    })

    let d = deck.length < 10 ? newDeck() : deck.slice()
    const newHand = d.slice(0,5)
    d = d.slice(5)
    setDeck(d); setHand(newHand); setHolds([false,false,false,false,false])
    setPhase('deal'); setResult(null)
    setPromptedThisRound(false); setSuggestion(null); setSuggestionWhy(null); setEquivalentMasks([])
    setNeedFlipBacksAfterRefill(false)

    // Evaluate initial rank for paytable highlight
    const r = spec.evaluateHand(newHand)
    setInitialRank(r !== 'Nothing' ? String(r) : null)

    // Animate: reveal left→right
    setIsAnimating(true)
    setRevealMask([false,false,false,false,false])
    for (let i = 0; i < 5; i++) {
      const t = window.setTimeout(() => {
        setRevealMask(prev => prev.map((v, idx) => idx === i ? true : v))
        if (i === 4) setIsAnimating(false)
      }, i * dealIntervalMs) as unknown as number
      dealTimers.current.push(t)
    }
  }

  // Draw with spec-provided coaching (supports optional "reason" and "alts")
  function draw() {
    if (!canDraw) return
    if (isAnimating) return

    // Compute best hold from the active game spec
    const best = spec.bestHold(hand)
    const bestMask = Array.isArray(best) ? best : best.mask
    const bestReason = Array.isArray(best) ? undefined : best.reason
    const alts = Array.isArray(best) ? [] : (best.alts ?? [])
    const isOptimal = maskEquals(bestMask, holds) || alts.some(m => maskEquals(m, holds))

    if (hintsEnabled) {
      if (!promptedThisRound && !isOptimal) {
        setSuggestion(bestMask)
        setSuggestionWhy(bestReason ?? null)
        setEquivalentMasks(alts)
        setPromptedThisRound(true)
        return // wait for user to pick
      } else if (!promptedThisRound && isOptimal) {
        setAccTotal(t => t + 1)
        setAccCorrect(c => c + 1)
      } else if (promptedThisRound) {
        setAccTotal(t => t + 1) // prompted round counts as attempted; 0 if they ignored
      }
    } else {
      // Hints off → never show modal; still grade accuracy (accept alts)
      setAccTotal(t => t + 1)
      if (isOptimal) setAccCorrect(c => c + 1)
    }

    // Replace unheld cards (animate backs then reveal)
    clearTimers()
    const replaceIdx: number[] = []
    for (let i = 0; i < 5; i++) if (!holds[i]) replaceIdx.push(i)

    let d = deck.slice()
    const newHand = hand.map((c, i) => holds[i] ? c : d.shift()!)
    setHand(newHand); setDeck(d)

    // Briefly hide (show backs) for replaced slots; keep held ones revealed
    setIsAnimating(true)
    setRevealMask(prev => prev.map((rev, i) => holds[i] ? rev : false))

    // Reveal replaced cards left→right
    replaceIdx.forEach((slot, k) => {
      const t = window.setTimeout(() => {
        setRevealMask(prev => prev.map((rev, i) => i === slot ? true : rev))
        if (k === replaceIdx.length - 1) setIsAnimating(false)
      }, k * drawIntervalMs) as unknown as number
      drawTimers.current.push(t)
    })

    // Score the hand immediately
    const rank = spec.evaluateHand(newHand)
    const payout = payoutFromSpec(spec, String(rank), bet)
    const willBeCredits = credits + payout

    setCredits(c => c + payout)
    setResult({ rank: String(rank), payout })
    setPhase('show')
    setInitialRank(null)
    setSuggestion(null)
    setSuggestionWhy(null)
    setEquivalentMasks([])

    // If we truly busted (0 credits after a 0 payout), keep faces
    // and flip to backs ONLY after the next Insert.
    if (payout === 0 && willBeCredits === 0) {
      setNeedFlipBacksAfterRefill(true)
    }
  }

  // Accept suggestion & draw immediately
  function acceptSuggestionAndDraw() {
    if (!suggestion) return
    setHolds(suggestion)
    setAccTotal(t => t + 1) // prompted round (0 for correctness)
    setEquivalentMasks([])

    // Draw path identical to draw()
    clearTimers()
    const replaceIdx: number[] = []
    for (let i = 0; i < 5; i++) if (!suggestion[i]) replaceIdx.push(i)

    let d = deck.slice()
    const newHand = hand.map((c, i) => suggestion[i] ? c : d.shift()!)
    setHand(newHand); setDeck(d)

    setIsAnimating(true)
    setRevealMask(prev => prev.map((rev, i) => suggestion[i] ? rev : false))
    replaceIdx.forEach((slot, k) => {
      const t = window.setTimeout(() => {
        setRevealMask(prev => prev.map((rev, i) => i === slot ? true : rev))
        if (k === replaceIdx.length - 1) setIsAnimating(false)
      }, k * drawIntervalMs) as unknown as number
      drawTimers.current.push(t)
    })

    const rank = spec.evaluateHand(newHand)
    const payout = payoutFromSpec(spec, String(rank), bet)
    const willBeCredits = credits + payout

    setCredits(c => c + payout)
    setResult({ rank: String(rank), payout })
    setPhase('show')
    setInitialRank(null)
    setSuggestion(null)
    setSuggestionWhy(null)

    if (payout === 0 && willBeCredits === 0) {
      setNeedFlipBacksAfterRefill(true)
    }
  }

  // Keep my holds & draw
  function keepMineAndDraw() {
    setAccTotal(t => t + 1) // prompted round (0 for correctness)
    setEquivalentMasks([])

    clearTimers()
    const replaceIdx: number[] = []
    for (let i = 0; i < 5; i++) if (!holds[i]) replaceIdx.push(i)

    let d = deck.slice()
    const newHand = hand.map((c, i) => holds[i] ? c : d.shift()!)
    setHand(newHand); setDeck(d)

    setIsAnimating(true)
    setRevealMask(prev => prev.map((rev, i) => holds[i] ? rev : false))
    replaceIdx.forEach((slot, k) => {
      const t = window.setTimeout(() => {
        setRevealMask(prev => prev.map((rev, i) => i === slot ? true : rev))
        if (k === replaceIdx.length - 1) setIsAnimating(false)
      }, k * drawIntervalMs) as unknown as number
      drawTimers.current.push(t)
    })

    const rank = spec.evaluateHand(newHand)
    const payout = payoutFromSpec(spec, String(rank), bet)
    const willBeCredits = credits + payout

    setCredits(c => c + payout)
    setResult({ rank: String(rank), payout })
    setPhase('show')
    setInitialRank(null)
    setSuggestion(null)
    setSuggestionWhy(null)

    if (payout === 0 && willBeCredits === 0) {
      setNeedFlipBacksAfterRefill(true)
    }
  }

  const canDeal = (phase==='bet' || phase==='show') && credits>=bet && !isAnimating
  const canDraw = (phase==='deal' || phase==='draw') && !isAnimating
  const accuracyPct = accTotal ? Math.round((accCorrect / accTotal) * 100) : 100

  // Management helpers for settings panel
  function resetAccuracy() {
    writeNum(`acc_correct:${spec.id}`, 0)
    writeNum(`acc_total:${spec.id}`, 0)
    setAccCorrect(0)
    setAccTotal(0)
    window.dispatchEvent(new Event('app:accuracy'))
  }
  function resetRewards() {
    if (!confirm('Are you sure you want to clear your rewards totals?')) return
    setRewardsPoints(0)
    setRewardsRemainderDollars(0)
    writeNum(REWARDS_KEY, 0)
    writeNum(REWARDS_REM_KEY, 0)
    window.dispatchEvent(new Event('app:rewards'))
  }

  return {
    // money
    credits, insert, cashOutAll,
    // betting & gameplay
    bet, changeBet, setMaxBet, deal, draw, phase, canDeal, canDraw,
    // hand/result
    hand, holds, toggleHold, result, initialRank,
    // reveal/animation
    revealMask, isAnimating,
    dealIntervalMs, drawIntervalMs, setDealIntervalMs, setDrawIntervalMs,
    // rewards summary
    rewardsPoints,
    // coaching UI
    hintsEnabled, setHintsEnabled,
    suggestion, suggestionWhy, promptedThisRound, acceptSuggestionAndDraw, keepMineAndDraw,
    // accuracy
    accCorrect, accTotal, accuracyPct, resetAccuracy, resetRewards,
  }
}

