// src/useRoulette.ts
import { useMemo, useRef, useState, useEffect } from 'react'
import { spinWheel, settleAll, type RouletteBet, type RouletteOutcome } from './games/roulette'
import { audio } from './audio'

// Reuse shared bank keys like the other games
const BANK_KEY    = 'bank_balance'
const CREDITS_KEY = 'credits'
const P_IN_KEY    = 'bank_in_total'
const P_OUT_KEY   = 'bank_out_total'

function readNum(key: string, def = 0) {
  const n = Number(localStorage.getItem(key))
  return Number.isFinite(n) ? n : def
}
function writeNum(key: string, val: number) {
  localStorage.setItem(key, String(val))
}

type Phase = 'bet' | 'spin' | 'show'

// Map win size to poker tiers for audio.win(...)
function winTierFor(net: number, stake: number): 'small'|'med'|'big'|'royal' {
  const mult = stake > 0 ? net / stake : 0
  if (mult >= 30) return 'royal'  // straight (35:1) + stacks
  if (mult >= 8)  return 'big'    // chunky wins
  if (mult >= 2)  return 'med'    // decent wins
  return 'small'                  // any positive but modest win
}

export function useRoulette() {
  const [credits, setCredits] = useState<number>(() => readNum(CREDITS_KEY, 200))
  const [phase, setPhase] = useState<Phase>('bet')
  const [bets, setBets] = useState<RouletteBet[]>([])
  const [outcome, setOutcome] = useState<RouletteOutcome | null>(null)
  const [lastNet, setLastNet] = useState<number | null>(null)

  // Spin timing & housekeeping
  const [spinMs, setSpinMs] = useState<number>(0)
  const spinTimerRef = useRef<number | null>(null)
  const stopSpinAudioRef = useRef<(() => void) | null>(null)

  // persist credits like other games
  function syncCredits(n: number) {
    setCredits(n)
    writeNum(CREDITS_KEY, n)
    window.dispatchEvent(new CustomEvent('app:credits', { detail: n }))
  }

  // money
  function insert(amount: number) {
    const bank = readNum(BANK_KEY, 500)
    const m = Math.min(amount, bank)
    if (m <= 0) return
    writeNum(BANK_KEY, +(bank - m).toFixed(2))
    syncCredits(+(credits + m).toFixed(2))
    writeNum(P_IN_KEY, +(readNum(P_IN_KEY, 0) + m).toFixed(2))
    window.dispatchEvent(new Event('app:bank'))
    window.dispatchEvent(new Event('app:bank_totals'))
  }
  function cashOutAll() {
    if (credits <= 0) return
    const bank = readNum(BANK_KEY, 500)
    const m = credits
    writeNum(BANK_KEY, +(bank + m).toFixed(2))
    syncCredits(0)
    writeNum(P_OUT_KEY, +(readNum(P_OUT_KEY, 0) + m).toFixed(2))
    window.dispatchEvent(new Event('app:bank'))
    window.dispatchEvent(new Event('app:bank_totals'))
  }

  // betting
  const totalStake = useMemo(() => bets.reduce((s,b)=>s+b.amount,0), [bets])
  const canSpin = (phase === 'bet' && bets.length > 0 && credits >= totalStake)

  function addBet(b: RouletteBet) {
    if (phase !== 'bet') return
    setBets(prev => {
      const next = prev.concat(b)
      try { audio.chipUp() } catch {}
      return next
    })
  }
  function removeBet(idx: number) {
    if (phase !== 'bet') return
    setBets(prev => {
      const next = prev.filter((_,i)=>i!==idx)
      try { audio.chipDown() } catch {}
      return next
    })
  }
  function clearBets() {
    if (phase !== 'bet') return
    setBets([])
  }

  // spin + settlement (timed to WAV duration)
  function spin() {
    if (!canSpin) return
    setPhase('spin')

    // Deduct stake now
    const next = +(credits - totalStake).toFixed(2)
    syncCredits(next)

    // Start the WAV and get exact duration
    const { durationMs, stop } = audio.rouletteSpinPlay()
    stopSpinAudioRef.current = stop
    setSpinMs(durationMs)

    // Decide the outcome now and set it immediately so the wheel
    // component knows its target number and can start animating.
    const o = spinWheel()
    setOutcome(o)

    // Schedule settlement + reveal exactly at clip end
    if (spinTimerRef.current !== null) clearTimeout(spinTimerRef.current)
    spinTimerRef.current = window.setTimeout(() => {
      const { returned, net, stake } = settleAll(bets, o) // expect stake in return shape
      if (returned > 0) syncCredits(+(readNum(CREDITS_KEY, 0) + returned).toFixed(2))
      setLastNet(+net.toFixed(2))
      setPhase('show')

      // Sounds: dolly + tiered win/lose
      try { audio.dolly() } catch {}
      if (net > 0) {
        try { audio.win(winTierFor(net, stake)) } catch {}
      } else if (net < 0) {
        try { audio.lose() } catch {}
      }

      stopSpinAudioRef.current = null
      spinTimerRef.current = null
    }, durationMs)
  }

  function newRound() {
    // Stop any in-flight audio/timer if user skips
    try { stopSpinAudioRef.current?.() } catch {}
    if (spinTimerRef.current !== null) { clearTimeout(spinTimerRef.current); spinTimerRef.current = null }

    setBets([])
    setOutcome(null)
    setLastNet(null)
    setSpinMs(0)
    setPhase('bet')
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { stopSpinAudioRef.current?.() } catch {}
      if (spinTimerRef.current !== null) clearTimeout(spinTimerRef.current)
    }
  }, [])

  return {
    // money
    credits, insert, cashOutAll,
    // round
    phase, canSpin, spin, newRound, spinMs,
    // bets
    bets, addBet, removeBet, clearBets, totalStake,
    // result
    outcome, lastNet,
  }
}

