// src/useRoulette.ts
import { useMemo, useState } from 'react'
import { spinWheel, settleAll, type RouletteBet, type RouletteOutcome } from './games/roulette'

// Reuse shared bank keys like the other games
const BANK_KEY        = 'bank_balance'
const CREDITS_KEY     = 'credits'
const P_IN_KEY        = 'bank_in_total'
const P_OUT_KEY       = 'bank_out_total'

function readNum(key: string, def = 0) {
  const n = Number(localStorage.getItem(key))
  return Number.isFinite(n) ? n : def
}
function writeNum(key: string, val: number) {
  localStorage.setItem(key, String(val))
}

type Phase = 'bet' | 'spin' | 'show'

export function useRoulette() {
  const [credits, setCredits] = useState<number>(() => readNum(CREDITS_KEY, 200))
  const [phase, setPhase] = useState<Phase>('bet')
  const [bets, setBets] = useState<RouletteBet[]>([])
  const [outcome, setOutcome] = useState<RouletteOutcome | null>(null)
  const [lastNet, setLastNet] = useState<number | null>(null)

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
    setBets(prev => prev.concat(b))
  }
  function removeBet(idx: number) {
    if (phase !== 'bet') return
    setBets(prev => prev.filter((_,i)=>i!==idx))
  }
  function clearBets() {
    if (phase !== 'bet') return
    setBets([])
  }

  // spin + settlement
  function spin() {
    if (!canSpin) return
    setPhase('spin')
    // Deduct stake now
    syncCredits(+(credits - totalStake).toFixed(2))

    // Simulate a quick spin (no timers yet; add animation later)
    const o = spinWheel()
    setOutcome(o)
    const { returned, net } = settleAll(bets, o)
    if (returned > 0) syncCredits(+(readNum(CREDITS_KEY, 0) + returned).toFixed(2))
    setLastNet(+net.toFixed(2))
    setPhase('show')
  }

  function newRound() {
    setBets([])
    setOutcome(null)
    setLastNet(null)
    setPhase('bet')
  }

  return {
    // money
    credits, insert, cashOutAll,
    // round
    phase, canSpin, spin, newRound,
    // bets
    bets, addBet, removeBet, clearBets, totalStake,
    // result
    outcome, lastNet,
  }
}
