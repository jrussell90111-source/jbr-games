import { useEffect, useState } from 'react'
import { Card, newDeck } from './cards'
import { audio } from './audio'
import type { GameSpec, BestHoldResult } from './games/spec'

type Phase = 'bet' | 'deal' | 'draw' | 'show'
const COIN_VALUE_DOLLARS = 1

// Shared money/bank keys (same for all games)
const BANK_KEY        = 'bank_balance'
const CREDITS_KEY     = 'credits'
const P_IN_KEY        = 'bank_in_total'
const P_OUT_KEY       = 'bank_out_total'
const REWARDS_KEY     = 'rewards_points'
const REWARDS_REM_KEY = 'rewards_remainder'

// Animation default speeds (ms per card)
const DEFAULT_DEAL_MS = 360
const DEFAULT_DRAW_MS = 300

// Sound behavior for draw animation
const PLAY_SOUND_ON_BACK_FLASH = false; // keep silent during back-flip

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
  const row = (spec.paytable as Record<string, number[]>)[rank]
  if (!row) return 0
  const idx = Math.min(5, Math.max(1, bet)) - 1
  return row[idx] ?? 0
}
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export function useGame(spec: GameSpec) {
  // Per-game keys (namespaced by spec.id)
  const ACC_CORRECT_KEY = `acc_correct:${spec.id}`
  const ACC_TOTAL_KEY   = `acc_total:${spec.id}`
  const HINTS_KEY       = `hintsOn:${spec.id}`

  // Rehydrate per-game state whenever we switch games
  useEffect(() => {
    // accuracy (per game)
    setAccCorrect(readNum(`acc_correct:${spec.id}`, 0))
    setAccTotal(readNum(`acc_total:${spec.id}`, 0))

    // hints toggle (per game)
    {
      const s = localStorage.getItem(`hintsOn:${spec.id}`)
      setHintsEnabled(s === null ? true : s === 'true')
    }

    // clear any lingering UI from the previous table
    setPromptedThisRound(false)
    setSuggestion(null)
    setSuggestionWhy(null)
    setHand([])                          // show backs
    setHolds([false,false,false,false,false])
    setPhase('bet')
    setInitialRank(null)
    setResult(null)

    // if you have revealMask in your version:
    try { setRevealMask([false,false,false,false,false] as any) } catch {}
  }, [spec.id])

  // --- New: per-game accuracy reset
  function resetAccuracy() {
    setAccCorrect(0)
    setAccTotal(0)
    writeNum(ACC_CORRECT_KEY, 0)
    writeNum(ACC_TOTAL_KEY, 0)
    window.dispatchEvent(new Event('app:accuracy'))
  }

  // --- New: rewards reset (global rewards program)
  function resetRewards() {
    setRewardsPoints(0)
    setRewardsRemainderDollars(0)
    writeNum(REWARDS_KEY, 0)
    writeNum(REWARDS_REM_KEY, 0)
    window.dispatchEvent(new Event('app:rewards'))
  }

  // Versioned, per-game speed keys
  const SPEED_VER = 'v2'
  const DEAL_MS_KEY = `deal_interval_ms:${SPEED_VER}:${spec.id}`
  const DRAW_MS_KEY = `draw_interval_ms:${SPEED_VER}:${spec.id}`

  // Credits & gameplay
  const [credits, setCredits] = useState<number>(() => readNum(CREDITS_KEY, 200))
  const [bet, setBet] = useState(1)
  const [deck, setDeck] = useState<Card[]>(newDeck())
  const [hand, setHand] = useState<Card[]>([])
  const [holds, setHolds] = useState<boolean[]>([false,false,false,false,false])
  const [phase, setPhase] = useState<Phase>('bet')

  // Animation & reveal state
  const [isAnimating, setIsAnimating] = useState(false)
  const [revealMask, setRevealMask] = useState<boolean[]>([false,false,false,false,false])
  const [dealIntervalMs, setDealIntervalMs] = useState<number>(() => readNum(DEAL_MS_KEY, DEFAULT_DEAL_MS))
  const [drawIntervalMs, setDrawIntervalMs] = useState<number>(() => readNum(DRAW_MS_KEY, DEFAULT_DRAW_MS))
  useEffect(() => { writeNum(DEAL_MS_KEY, dealIntervalMs) }, [DEAL_MS_KEY, dealIntervalMs])
  useEffect(() => { writeNum(DRAW_MS_KEY, drawIntervalMs) }, [DRAW_MS_KEY, drawIntervalMs])

  // Results
  const [result, setResult] = useState<{rank: string, payout: number} | null>(null)
  const [initialRank, setInitialRank] = useState<string | null>(null)

  // Rewards (summary)
  const [rewardsPoints, setRewardsPoints] = useState<number>(() => readNum(REWARDS_KEY, 0))
  const [rewardsRemainderDollars, setRewardsRemainderDollars] = useState<number>(() => readNum(REWARDS_REM_KEY, 0))

  // Coaching state (+ reasons)
  const [promptedThisRound, setPromptedThisRound] = useState(false)
  const [suggestion, setSuggestion] = useState<boolean[] | null>(null)
  const [suggestionWhy, setSuggestionWhy] = useState<string | null>(null)

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

  // Reset suggestion UI when spec changes
  useEffect(() => {
    setPromptedThisRound(false)
    setSuggestion(null)
    setSuggestionWhy(null)
  }, [spec.id])

  // 🔹 Show backs when switching games: reset board on spec change
  useEffect(() => {
    setHand([])
    setHolds([false,false,false,false,false])
    setPhase('bet')
    setResult(null)
    setInitialRank(null)
    setRevealMask([false,false,false,false,false])
  }, [spec.id])

  // 🔹 Show backs when credits hit zero (out of cash)
  useEffect(() => {
    if (credits === 0 && (phase === 'bet' || phase === 'show')) {
      setHand([])
      setHolds([false,false,false,false,false])
      setResult(null)
      setInitialRank(null)
      setRevealMask([false,false,false,false,false])
    }
  }, [credits, phase])

  // UI helpers
  function toggleHold(i: number) {
    if (isAnimating) return
    if (phase !== 'deal' && phase !== 'draw') return
    setHolds(h => h.map((v,idx)=> idx===i ? !v : v))
  }
  function changeBet(delta: number) { if (!isAnimating) setBet(b => Math.min(5, Math.max(1, b + delta))) }
  function setMaxBet() { if (!isAnimating) setBet(5) }

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

  // Start a hand — sequential deal with left→right reveal
  async function deal(): Promise<void> {
    if (!canDeal || isAnimating) return
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
    const drawn = d.slice(0,5)
    d = d.slice(5)
    setDeck(d)

    // Prepare board: assign full hand, hide with backs
    setHand(drawn)
    setHolds([false,false,false,false,false])
    setPhase('deal'); setResult(null)
    setPromptedThisRound(false); setSuggestion(null); setSuggestionWhy(null)
    setInitialRank(null)
    setRevealMask([false,false,false,false,false])

    // sequential reveal L→R
    setIsAnimating(true)
    for (let i = 0; i < 5; i++) {
      setRevealMask(m => { const next = m.slice(); next[i] = true; return next })
      try { audio.click() } catch {}
      if (i < 4) await sleep(Math.max(0, dealIntervalMs))
    }
    // compute initial rank after all 5 visible
    const r = spec.evaluateHand(drawn as Card[])
    setInitialRank(r !== 'Nothing' ? String(r) : null)
    setIsAnimating(false)
  }

  /** Shared animation for a draw step using a specific "kept" mask. */
  async function animateDrawWithMask(keepMask: boolean[], countAsPrompted: boolean) {
    if (isAnimating) return

    // Build final hand, indices to replace, and replacement cards
    const toReplace: number[] = []
    let d = deck.slice()
    const finalHand = hand.map((c, i) => {
      if (keepMask[i]) return c
      toReplace.push(i)
      return d.shift()!
    })

    if (toReplace.length === 0) {
      // No replacements: just finish the hand
      const rank0 = spec.evaluateHand(finalHand as Card[])
      const payout0 = payoutFromSpec(spec, String(rank0), bet)
      setCredits(c => c + payout0)
      setResult({ rank: String(rank0), payout: payout0 })
      setPhase('show')
      setInitialRank(null)
      setSuggestion(null)
      setSuggestionWhy(null)
      setRevealMask([true,true,true,true,true])
      return
    }

    // Animate replacements:
    // - first replaced card: no back flash (straight to face)
    // - subsequent replaced cards: brief back flash so the player sees what's changing
    const FLASH_BACK_MS = Math.min(120, Math.floor(drawIntervalMs / 2))

    setIsAnimating(true)
    for (let k = 0; k < toReplace.length; k++) {
      const i = toReplace[k]

      if (k > 0) {
        // flash back on later replacements
        setRevealMask(m => { const next = m.slice(); next[i] = false; return next })
        if (PLAY_SOUND_ON_BACK_FLASH) {
          try { audio.click() } catch {}
        }
        if (FLASH_BACK_MS > 0) await sleep(FLASH_BACK_MS)
      }

      // place the new card + reveal - play the click here
      setHand(h => { const next = h.slice(); next[i] = finalHand[i]; return next })
      setRevealMask(m => { const next = m.slice(); next[i] = true; return next })
      try { audio.click() } catch {}

      if (k < toReplace.length - 1 && drawIntervalMs > 0) {
        await sleep(drawIntervalMs)
      }
    }
    setIsAnimating(false)

    // Commit deck and score
    setDeck(d)
    const rank = spec.evaluateHand(finalHand as Card[])
    const payout = payoutFromSpec(spec, String(rank), bet)
    setCredits(c => c + payout)
    setResult({ rank: String(rank), payout })
    setPhase('show')
    setInitialRank(null)
    setSuggestion(null)
    setSuggestionWhy(null)
    setRevealMask([true,true,true,true,true])

    // Accuracy bookkeeping for prompted draws (already incremented earlier in call sites)
    if (!countAsPrompted) {
      // nothing extra here; counts are handled by draw()/accept/keepMine
    }
  }

  // Draw with spec-provided coaching (with animated replacements + backs)
  async function draw(): Promise<void> {
    if (!canDraw || isAnimating) return

    const best: BestHoldResult = spec.bestHold(hand)
    const primaryMask = Array.isArray(best) ? best : best.mask
    const alts = (Array.isArray(best) ? undefined : best.alts) ?? []
    const isOptimal = [primaryMask, ...alts].some(m => maskEquals(m, holds))

    if (hintsEnabled) {
      if (!promptedThisRound && !isOptimal) {
        setSuggestion(primaryMask)
        setSuggestionWhy((Array.isArray(best) ? undefined : best.reason) ?? null)
        setPromptedThisRound(true)
        return
      } else if (!promptedThisRound && isOptimal) {
        setAccTotal(t => t + 1)
        setAccCorrect(c => c + 1)
      } else if (promptedThisRound) {
        setAccTotal(t => t + 1)
      }
    } else {
      setAccTotal(t => t + 1)
      if (isOptimal) setAccCorrect(c => c + 1)
    }

    await animateDrawWithMask(holds, /*countAsPrompted*/ false)
  }

  // Accept suggestion & draw — now animated like draw()
  async function acceptSuggestionAndDraw() {
    if (!suggestion || isAnimating) return
    setHolds(suggestion)
    setAccTotal(t => t + 1) // prompted round (0 for correctness)
    await animateDrawWithMask(suggestion, /*countAsPrompted*/ true)
  }

  // Keep my holds & draw — now animated like draw()
  async function keepMineAndDraw() {
    if (isAnimating) return
    setAccTotal(t => t + 1) // prompted round (0 for correctness)
    await animateDrawWithMask(holds, /*countAsPrompted*/ true)
  }

  const canDeal = (phase==='bet' || phase==='show') && credits>=bet
  const canDraw = (phase==='deal' || phase==='draw') && hand.length === 5
  const accuracyPct = accTotal ? Math.round((accCorrect / accTotal) * 100) : 100

  return {
    // money
    credits, insert, cashOutAll,
    // betting & gameplay
    bet, changeBet, setMaxBet, deal, draw, phase, canDeal, canDraw,
    // hand/result
    hand, holds, toggleHold, result, initialRank,
    // reveal/anim
    revealMask, isAnimating, dealIntervalMs, drawIntervalMs, setDealIntervalMs, setDrawIntervalMs,
    // rewards summary
    rewardsPoints,
    // coaching UI
    hintsEnabled, setHintsEnabled,
    suggestion, suggestionWhy, promptedThisRound, acceptSuggestionAndDraw, keepMineAndDraw,
    // accuracy
    accCorrect, accTotal, accuracyPct,
    // reset helpers
    resetAccuracy, resetRewards,
  }
}

