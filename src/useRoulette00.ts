// src/useRoulette00.ts
// American double-zero roulette hook — identical to useRoulette.ts except
// it spins spinWheel38() (38 pockets, 0..37 where 37 = "00").
import { useMemo, useRef, useState, useEffect } from 'react'
import { spinWheel38, settleAll, type RouletteBet, type RouletteOutcome } from './games/roulette'
import { audio } from './audio'

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

function winTierFor(net: number, stake: number): 'small'|'med'|'big'|'royal' {
  const mult = stake > 0 ? net / stake : 0
  if (mult >= 30) return 'royal'
  if (mult >= 8)  return 'big'
  if (mult >= 2)  return 'med'
  return 'small'
}

export function useRoulette00() {
  const [credits, setCredits] = useState<number>(() => readNum(CREDITS_KEY, 200))
  const [phase, setPhase] = useState<Phase>('bet')
  const [bets, setBets] = useState<RouletteBet[]>([])
  const [outcome, setOutcome] = useState<RouletteOutcome | null>(null)
  const [lastNet, setLastNet] = useState<number | null>(null)
  const [spinMs, setSpinMs] = useState<number>(0)

  const spinTimerRef    = useRef<number | null>(null)
  const stopSpinAudioRef = useRef<(() => void) | null>(null)

  function syncCredits(n: number) {
    setCredits(n)
    writeNum(CREDITS_KEY, n)
    window.dispatchEvent(new CustomEvent('app:credits', { detail: n }))
  }

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
    writeNum(BANK_KEY, +(bank + credits).toFixed(2))
    syncCredits(0)
    writeNum(P_OUT_KEY, +(readNum(P_OUT_KEY, 0) + credits).toFixed(2))
    window.dispatchEvent(new Event('app:bank'))
    window.dispatchEvent(new Event('app:bank_totals'))
  }

  const totalStake = useMemo(() => bets.reduce((s, b) => s + b.amount, 0), [bets])
  const canSpin = phase === 'bet' && bets.length > 0 && credits >= totalStake

  function addBet(b: RouletteBet) {
    if (phase !== 'bet') return
    setBets(prev => prev.concat(b))
  }
  function removeBet(idx: number) {
    if (phase !== 'bet') return
    setBets(prev => prev.filter((_, i) => i !== idx))
  }
  function clearBets() {
    if (phase !== 'bet') return
    setBets([])
  }

  function spin() {
    if (!canSpin) return
    setPhase('spin')
    syncCredits(+(credits - totalStake).toFixed(2))

    const { durationMs, stop } = audio.rouletteSpinPlay()
    stopSpinAudioRef.current = stop
    setSpinMs(durationMs)

    // American wheel — 38 pockets
    // Set outcome immediately so the wheel component gets targetNumber
    // and can start its CSS transition animation right away.
    const o = spinWheel38()
    setOutcome(o)

    if (spinTimerRef.current !== null) clearTimeout(spinTimerRef.current)
    spinTimerRef.current = window.setTimeout(() => {
      const { returned, net, stake } = settleAll(bets, o)
      if (returned > 0) syncCredits(+(readNum(CREDITS_KEY, 0) + returned).toFixed(2))
      setLastNet(+net.toFixed(2))
      setPhase('show')

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
    try { stopSpinAudioRef.current?.() } catch {}
    if (spinTimerRef.current !== null) { clearTimeout(spinTimerRef.current); spinTimerRef.current = null }
    setBets([])
    setOutcome(null)
    setLastNet(null)
    setSpinMs(0)
    setPhase('bet')
  }

  useEffect(() => {
    return () => {
      try { stopSpinAudioRef.current?.() } catch {}
      if (spinTimerRef.current !== null) clearTimeout(spinTimerRef.current)
    }
  }, [])

  return {
    credits, insert, cashOutAll,
    phase, canSpin, spin, newRound, spinMs,
    bets, addBet, removeBet, clearBets, totalStake,
    outcome, lastNet,
  }
}
