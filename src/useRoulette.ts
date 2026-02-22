// src/useRoulette.ts
import { useMemo, useRef, useState, useEffect } from 'react'
import { spinWheel, settleBet, type RouletteBet, type RouletteOutcome } from './games/roulette'
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

export type Phase = 'bet' | 'spin' | 'clear' | 'pay' | 'show'

export type PayoutItem = {
  key: string     // bet key: "${type}:${sortedNums.join('-')}"
  stake: number   // total staked at this position (aggregated)
  payout: number  // total returned (stake + winnings, aggregated)
}

function betKey(b: RouletteBet): string {
  const arr = Array.isArray(b.numbers) ? b.numbers.slice()
    : typeof b.number === 'number' ? [b.number]
    : []
  arr.sort((a, c) => a - c)
  return `${b.type}:${arr.join('-')}`
}

// Map win magnitude to poker-style audio tier
function winTierFor(net: number, stake: number): 'small' | 'med' | 'big' | 'royal' {
  const mult = stake > 0 ? net / stake : 0
  if (mult >= 30) return 'royal'
  if (mult >= 8)  return 'big'
  if (mult >= 2)  return 'med'
  return 'small'
}

export function useRoulette() {
  const [credits, setCredits] = useState<number>(() => readNum(CREDITS_KEY, 200))
  const [phase, setPhase] = useState<Phase>('bet')
  const [bets, setBets] = useState<RouletteBet[]>([])
  const [outcome, setOutcome] = useState<RouletteOutcome | null>(null)
  const [lastNet, setLastNet] = useState<number | null>(null)
  const [spinMs, setSpinMs] = useState<number>(0)

  // Payout sequence state
  const [payoutList, setPayoutList] = useState<PayoutItem[]>([])
  const [payoutIdx, setPayoutIdx] = useState<number>(-1)

  const spinTimerRef     = useRef<number | null>(null)
  const payTimerRef      = useRef<number | null>(null)
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

    // Capture current bets/stake at spin time (closure safety)
    const capturedBets  = bets
    const capturedStake = totalStake

    setPhase('spin')
    syncCredits(+(credits - capturedStake).toFixed(2))

    const { durationMs, stop } = audio.rouletteSpinPlay()
    stopSpinAudioRef.current = stop
    setSpinMs(durationMs)

    // Decide outcome immediately so the wheel can start animating
    const o = spinWheel()
    setOutcome(o)

    if (spinTimerRef.current !== null) clearTimeout(spinTimerRef.current)
    spinTimerRef.current = window.setTimeout(() => {
      stopSpinAudioRef.current = null
      spinTimerRef.current = null

      try { audio.dolly() } catch {}

      // ── Build grouped payout list (aggregate bets at same position) ──
      const winnerMap = new Map<string, PayoutItem>()
      for (const b of capturedBets) {
        const ret = settleBet(b, o)
        if (ret > 0) {
          const k = betKey(b)
          const existing = winnerMap.get(k)
          if (existing) {
            existing.stake  += b.amount
            existing.payout += ret
          } else {
            winnerMap.set(k, { key: k, stake: b.amount, payout: ret })
          }
        }
      }
      const winners = Array.from(winnerMap.values()).sort((a, b) => a.payout - b.payout)

      // lastNet = total returned − total staked
      const totalReturned = winners.reduce((s, w) => s + w.payout, 0)
      setLastNet(+(totalReturned - capturedStake).toFixed(2))

      if (winners.length === 0) {
        try { audio.lose() } catch {}
      }

      setPayoutList(winners)
      setPayoutIdx(-1)
      setPhase('clear')   // → 2.5 s clearing phase

      // ── Payout sequence ──────────────────────────────────────────────
      payTimerRef.current = window.setTimeout(() => {
        if (winners.length === 0) {
          setPhase('show')
          return
        }

        setPhase('pay')

        function payNext(i: number) {
          setPayoutIdx(i)
          if (i >= winners.length) {
            setPhase('show')
            payTimerRef.current = null
            return
          }
          const item = winners[i]
          syncCredits(+(readNum(CREDITS_KEY, 0) + item.payout).toFixed(2))
          try { audio.win(winTierFor(item.payout - item.stake, item.stake)) } catch {}
          payTimerRef.current = window.setTimeout(() => payNext(i + 1), 1800)
        }

        payNext(0)
      }, 2500)   // clear phase duration
    }, durationMs)
  }

  function newRound() {
    try { stopSpinAudioRef.current?.() } catch {}
    if (spinTimerRef.current !== null) { clearTimeout(spinTimerRef.current); spinTimerRef.current = null }
    if (payTimerRef.current !== null)  { clearTimeout(payTimerRef.current);  payTimerRef.current = null  }

    // If we're skipping mid-payout, instantly credit all unpaid winners
    if (phase === 'clear') {
      const extra = payoutList.reduce((s, w) => s + w.payout, 0)
      if (extra > 0) syncCredits(+(readNum(CREDITS_KEY, 0) + extra).toFixed(2))
    } else if (phase === 'pay' && payoutIdx >= 0) {
      // winners 0..payoutIdx are already credited; pay the rest now
      const notYetPaid = payoutList.slice(payoutIdx + 1)
      if (notYetPaid.length > 0) {
        const extra = notYetPaid.reduce((s, w) => s + w.payout, 0)
        syncCredits(+(readNum(CREDITS_KEY, 0) + extra).toFixed(2))
      }
    }

    // Keep only winning bets on the board (casino style)
    if (outcome) {
      setBets(prev => prev.filter(b => settleBet(b, outcome) > 0))
    } else {
      setBets([])
    }

    setOutcome(null)
    setLastNet(null)
    setSpinMs(0)
    setPayoutList([])
    setPayoutIdx(-1)
    setPhase('bet')
  }

  // Derived board props
  const loserKeys = useMemo<Set<string> | undefined>(() => {
    if ((phase !== 'clear' && phase !== 'pay') || !outcome) return undefined
    const s = new Set<string>()
    for (const b of bets) {
      if (settleBet(b, outcome) === 0) s.add(betKey(b))
    }
    return s
  }, [phase, bets, outcome])

  const payingKey = (phase === 'pay' && payoutIdx >= 0 && payoutIdx < payoutList.length)
    ? payoutList[payoutIdx].key
    : null

  useEffect(() => {
    return () => {
      try { stopSpinAudioRef.current?.() } catch {}
      if (spinTimerRef.current !== null) clearTimeout(spinTimerRef.current)
      if (payTimerRef.current  !== null) clearTimeout(payTimerRef.current)
    }
  }, [])

  return {
    credits, insert, cashOutAll,
    phase, canSpin, spin, newRound, spinMs,
    bets, addBet, removeBet, clearBets, totalStake,
    outcome, lastNet,
    payoutList, payoutIdx,
    loserKeys, payingKey,
  }
}
