// src/useBlackjack.ts
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, newDeck } from './cards'
import { audio } from './audio'
import {
  BlackjackRules, BjAction, BjHand,
  valueOfHand, isPair, blackjackMultiplier, basicStrategyAction
} from './games/blackjack'

type Phase = 'bet' | 'insurance' | 'player' | 'dealer' | 'settle' | 'show'

const BANK_KEY        = 'bank_balance'
const CREDITS_KEY     = 'credits'
const P_IN_KEY        = 'bank_in_total'
const P_OUT_KEY       = 'bank_out_total'
const REWARDS_KEY     = 'rewards_points'
const REWARDS_REM_KEY = 'rewards_hands_remainder'
const HANDS_PER_POINT = 6

// Accuracy + hints shared across all BJ tables
const ACC_C_KEY = 'acc_correct:BJ'
const ACC_T_KEY = 'acc_total:BJ'
const HINTS_KEY = 'hintsOn:BJ'

// Offer insurance trainer only on multi-deck BJ10/BJ15
const INS_TRAIN_IDS = new Set(['BJ10', 'BJ15'])

// Dealer reveal timing
const REVEAL_HOLE_MS = 350
const REVEAL_HIT_MS  = 280

// Debug logger (toggle with: localStorage.setItem('bj:debug','1'))
const DBG = (...a: any[]) => {
  try {
    if (localStorage.getItem('bj:debug') === '1') console.log('[BJ]', ...a)
  } catch { /* no-op */ }
}

function readNum(key: string, def = 0) {
  const n = Number(localStorage.getItem(key))
  return Number.isFinite(n) ? n : def
}
function writeNum(key: string, val: number) {
  localStorage.setItem(key, String(val))
}

function buildShoe(decks: number): Card[] {
  const many: Card[] = []
  for (let i = 0; i < decks; i++) many.push(...newDeck())
  return many
}

/** First unfinished hand at/after fromIdx; -1 if none. */
function nextUnfinishedIndex(hs: BjHand[], fromIdx: number): number {
  for (let j = fromIdx; j < hs.length; j++) if (!hs[j].isFinished) return j
  return -1
}

export function useBlackjack(rules: BlackjackRules) {
  // money & rewards
  const [credits, setCredits] = useState<number>(() => readNum(CREDITS_KEY, 200))
  const [rewardsPoints, setRewardsPoints] = useState<number>(() => readNum(REWARDS_KEY, 0))
  const [rewardsRemainderHands, setRewardsRemainderHands] = useState<number>(() => readNum(REWARDS_REM_KEY, 0))

  // per-round bookkeeping
  const [roundStartCredits, setRoundStartCredits] = useState<number | null>(null)
  const settledRef = useRef(false) // settle-once guard

  // shoe/ discard via refs — avoids stale draws
  const shoeRef = useRef<Card[]>(buildShoe(rules.decks))
  const discardRef = useRef<Card[]>([])
  const drawSeqRef = useRef(0) // monotonic draw counter for debugging

  // table state
  const [phase, setPhase] = useState<Phase>('bet')
  const [dealer, setDealer] = useState<{cards: Card[]; holeRevealed: boolean}>({ cards: [], holeRevealed: false })
  const [hands, setHands] = useState<BjHand[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [bet, setBet] = useState<number>(rules.minBet)

  // split tracking (no resplit aces globally; but split-aces hands can HIT, not DOUBLE)
  const [hasSplitAces, setHasSplitAces] = useState(false)

  // insurance
  const [insuranceOffered, setInsuranceOffered] = useState(false)
  const [insuranceTaken, setInsuranceTaken] = useState(false)
  const [insuranceWager, setInsuranceWager] = useState<number>(0)

  // results row
  const [lastWinLoss, setLastWinLoss] = useState<number | null>(null)

  // dealer summary
  const [dealerFinalTotal, setDealerFinalTotal] = useState<number | null>(null)
  const [dealerBusted, setDealerBusted] = useState(false)
  const [dealerNatural, setDealerNatural] = useState(false)

  // trainer (default OFF, prompt only on mistakes)
  const [hintsEnabled, setHintsEnabled] = useState<boolean>(() => {
    const s = localStorage.getItem(HINTS_KEY)
    return s === null ? false : s === 'true'
  })
  useEffect(() => { localStorage.setItem(HINTS_KEY, String(hintsEnabled)) }, [hintsEnabled])

  const [accC, setAccC] = useState<number>(() => readNum(ACC_C_KEY, 0))
  const [accT, setAccT] = useState<number>(() => readNum(ACC_T_KEY, 0))
  useEffect(() => { writeNum(ACC_C_KEY, accC) }, [accC])
  useEffect(() => { writeNum(ACC_T_KEY, accT) }, [accT])
  const accuracyPct = accT ? Math.round((accC / accT) * 100) : 100

  // trainer prompts
  const [trainerPrompt, setTrainerPrompt] = useState<{ user: BjAction; suggested: BjAction } | null>(null)
  const [insurancePrompt, setInsurancePrompt] = useState<boolean>(false)

  // prevent re-prompt for the **same** option in the **same** situation
  const promptedOnceRef = useRef<Set<string>>(new Set())
  function makePromptKey(user: BjAction): string {
    const idx = activeIndexRef.current
    const hand = handsRef.current[idx]
    const cardsSig = hand ? hand.cards.map(c => `${c.rank}${c.suit}`).join('-') : 'none'
    const up = dealer.cards[0] ? `${dealer.cards[0].rank}${dealer.cards[0].suit}` : 'none'
    return `${idx}|${cardsSig}|${up}|${user}`
  }

  // persist money & rewards
  useEffect(() => { writeNum(CREDITS_KEY, credits); window.dispatchEvent(new CustomEvent('app:credits', { detail: credits })) }, [credits])
  useEffect(() => { writeNum(REWARDS_KEY, rewardsPoints); window.dispatchEvent(new Event('app:rewards')) }, [rewardsPoints])
  useEffect(() => { writeNum(REWARDS_REM_KEY, rewardsRemainderHands) }, [rewardsRemainderHands])

  // ======= ACTION LOCKS to prevent double-draws / double-clicks =======
  const actionLockRef = useRef(false)
  const [uiActionBusy, setUiActionBusy] = useState(false)
  const lastActionAtRef = useRef(0)

  function tryLockAction(tag: string): boolean {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    // Debounce ultra-fast double-clicks/taps
    if (now - lastActionAtRef.current < 160) {
      DBG(`${tag} ignored (debounced)`)
      return false
    }
    if (actionLockRef.current) {
      DBG(`${tag} ignored (action locked)`)
      return false
    }
    actionLockRef.current = true
    setUiActionBusy(true)
    lastActionAtRef.current = now
    return true
  }

  function forceReleaseActionLock() {
    actionLockRef.current = false
    setUiActionBusy(false)
    pendingActionRef.current = null
  }

  // Release the action lock AFTER React commits (with action-aware heuristics)
  const pendingActionRef = useRef<null | {
    kind: 'HIT'|'STAND'|'DOUBLE'|'SPLIT',
    handIdx: number,
    prevHandsLen: number,
    prevCount: number,
    prevFinished: boolean,
    prevPhase: Phase
  }>(null)

  function releaseActionAfterCommit(kind: 'HIT'|'STAND'|'DOUBLE'|'SPLIT') {
    const idx = activeIndexRef.current
    const h = handsRef.current[idx]
    pendingActionRef.current = {
      kind,
      handIdx: idx,
      prevHandsLen: handsRef.current.length,
      prevCount: h ? h.cards.length : -1,
      prevFinished: !!h?.isFinished,
      prevPhase: phaseRef.current
    }
  }

  useEffect(() => {
    const p = pendingActionRef.current
    if (!p) return

    const currentHands = handsRef.current
    const currLen = currentHands.length
    const h = currentHands[p.handIdx]
    const phaseNow = phaseRef.current
    let mutated = false

    switch (p.kind) {
      case 'HIT':
      case 'DOUBLE':
        mutated = !h || h.cards.length !== p.prevCount || h.isFinished !== p.prevFinished || phaseNow !== p.prevPhase
        break
      case 'STAND':
        mutated = !h || h.isFinished || phaseNow !== p.prevPhase || activeIndexRef.current !== p.handIdx
        break
      case 'SPLIT':
        mutated = currLen > p.prevHandsLen || phaseNow !== p.prevPhase
        break
    }

    if (mutated) {
      pendingActionRef.current = null
      setTimeout(() => {
        actionLockRef.current = false
        setUiActionBusy(false)
      }, 60)
    } else {
      setTimeout(() => {
        if (pendingActionRef.current === p) forceReleaseActionLock()
      }, 300)
    }
  }, [hands, phase])

  // Guard re-entry for dealer
  const dealerPlayingRef = useRef(false)

  // ======= REF MIRRORS to avoid stale reads in handlers =======
  const phaseRef = useRef(phase)
  useEffect(()=>{ phaseRef.current = phase }, [phase])

  const handsRef = useRef<BjHand[]>(hands)
  useEffect(()=>{ handsRef.current = hands }, [hands])

  const activeIndexRef = useRef(activeIndex)
  useEffect(()=>{ activeIndexRef.current = activeIndex }, [activeIndex])

  const hasSplitAcesRef = useRef(hasSplitAces)
  useEffect(()=>{ hasSplitAcesRef.current = hasSplitAces }, [hasSplitAces])

  // reset when rules change
  useEffect(() => {
    shoeRef.current = buildShoe(rules.decks)
    discardRef.current = []
    drawSeqRef.current = 0
    setPhase('bet')
    setDealer({ cards: [], holeRevealed: false })
    setHands([])
    setActiveIndex(0)
    setBet(rules.minBet)
    setHasSplitAces(false)
    setInsuranceOffered(false)
    setInsuranceTaken(false)
    setInsuranceWager(0)
    setLastWinLoss(null)
    setDealerFinalTotal(null)
    setDealerBusted(false)
    setDealerNatural(false)
    setRoundStartCredits(null)
    setTrainerPrompt(null)
    setInsurancePrompt(false)
    settledRef.current = false
    dealerPlayingRef.current = false
    actionLockRef.current = false
    setUiActionBusy(false)
    pendingActionRef.current = null
    promptedOnceRef.current.clear()
    DBG('--- RULES CHANGED ---', rules.id, `${rules.decks} decks`)
  }, [rules])

  // money
  function insert(amount: number) {
    if (amount <= 0) return
    const bank = readNum(BANK_KEY, 500)
    const m = Math.min(amount, bank)
    if (m <= 0) return
    writeNum(BANK_KEY, +(bank - m).toFixed(2))
    setCredits(c => +(c + m).toFixed(2))
    writeNum(P_IN_KEY, +(readNum(P_IN_KEY, 0) + m).toFixed(2))
    window.dispatchEvent(new Event('app:bank'))
    window.dispatchEvent(new Event('app:bank_totals'))
  }
  function cashOutAll() {
    if (credits <= 0) return
    const bank = readNum(BANK_KEY, 500)
    const m = credits
    writeNum(BANK_KEY, +(bank + m).toFixed(2))
    setCredits(0)
    writeNum(P_OUT_KEY, +(readNum(P_OUT_KEY, 0) + m).toFixed(2))
    window.dispatchEvent(new Event('app:bank'))
    window.dispatchEvent(new Event('app:bank_totals'))
  }

  // betting
  const canAdjustBet = (phase === 'bet' || phase === 'show')
  function addBet(amount: number) {
    if (!canAdjustBet || amount === 0) return
    setBet(b => Math.min(rules.maxBet, Math.max(rules.minBet, b + amount)))
  }
  function setMinBet() { if (canAdjustBet) setBet(rules.minBet) }
  function setMaxBet() { if (canAdjustBet) setBet(rules.maxBet) }

  // shoe
  function reshuffleIfNeeded() {
    if (shoeRef.current.length >= 10) return
    const pool = [...discardRef.current, ...shoeRef.current]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    shoeRef.current = pool
    discardRef.current = []
  }
  function drawCard(): Card {
    reshuffleIfNeeded()
    if (!shoeRef.current.length) {
      shoeRef.current = buildShoe(rules.decks)
      reshuffleIfNeeded()
    }
    const c = shoeRef.current.shift()!
    drawSeqRef.current++
    DBG('DRAW#', drawSeqRef.current, `${c.rank}${c.suit}`, '(shoe left:', shoeRef.current.length,')')
    return c
  }

  /** ---- Round start ---- */
  function deal() {
    if (!(phase === 'bet' || phase === 'show')) {
      DBG('Deal DISABLED — phase not ready', { phase, credits, bet })
      return
    }
    if (credits < bet) return

    // reset per-round guard/state
    settledRef.current = false
    dealerPlayingRef.current = false
    actionLockRef.current = false
    setUiActionBusy(false)
    setLastWinLoss(null)
    pendingActionRef.current = null
    promptedOnceRef.current.clear()

    const start = credits
    setRoundStartCredits(start)
    DBG('--- DEAL ---', { creditsBefore: start, bet })

    setDealer({ cards: [], holeRevealed: false })
    setHands([])
    setActiveIndex(0)
    setHasSplitAces(false)
    setInsuranceOffered(false)
    setInsuranceTaken(false)
    setInsuranceWager(0)
    setDealerFinalTotal(null)
    setDealerBusted(false)
    setDealerNatural(false)

    // ante + rewards
    setCredits(c => +(c - bet).toFixed(2))
    DBG('ANTE', bet, '→ credits', +(start - bet).toFixed(2))

    // For rewards give 1 point every X (configure in const) hands dealt
    setRewardsRemainderHands(rem => {
      const total = rem + 1 // count this hand
      if (total >= HANDS_PER_POINT) {
        const newPoints = Math.floor(total / HANDS_PER_POINT)
        if (newPoints > 0) setRewardsPoints(p => p + newPoints)
        return total % HANDS_PER_POINT
      }
      return total
    })

    const p1 = drawCard(); DBG('DEAL-p1', `${p1.rank}${p1.suit}`, '(shoe left:', shoeRef.current.length,')')
    const d1 = drawCard(); DBG('DEAL-d1', `${d1.rank}${d1.suit}`, '(shoe left:', shoeRef.current.length,')')
    const p2 = drawCard(); DBG('DEAL-p2', `${p2.rank}${p2.suit}`, '(shoe left:', shoeRef.current.length,')')
    const d2 = drawCard(); DBG('DEAL-d2', `${d2.rank}${d2.suit}`, '(shoe left:', shoeRef.current.length,')')

    const v = valueOfHand([p1, p2])
    const nat = v.natural

    const newHands: BjHand[] = [{
      cards:[p1,p2],
      bet,
      stood:false,
      busted:false,
      isSplitAces:false,
      isFinished:false,
      wasDoubled:false,
      isBlackjackNatural:nat,
    }]
    setHands(newHands)
    setDealer({ cards:[d1,d2], holeRevealed:false })
    setActiveIndex(0)
    audio.dealBurst()

    DBG('Initial deal:', {player: `${p1.rank}${p1.suit} ${p2.rank}${p2.suit}`, dealerUp: `${d1.rank}${d1.suit}`, dealerHole: `${d2.rank}${d2.suit}`}, {pTotal: String(v.total), dTotalPeek: String(valueOfHand([d1,d2]).total)})

    // Insurance if upcard Ace (no peek yet)
    if (d1.rank === 'A') {
      setPhase('insurance')
      setInsuranceOffered(true)
      return
    }

    // Peek if upcard Ten-value
    if (d1.rank === '10' || d1.rank === 'J' || d1.rank === 'Q' || d1.rank === 'K') {
      const dv = valueOfHand([d1, d2])
      if (dv.natural) {
        settleNaturalWithDealerBJ(newHands, [d1, d2])
        return
      }
    }

    // Player natural (and dealer not natural from above): pay immediately, settle once
    if (nat) {
      const mult = blackjackMultiplier(rules.blackjackPayout)
      const pay = +(bet * mult).toFixed(2) // PROFIT amount (not including stake)
      setCredits(c => +(c + bet + pay).toFixed(2)) // stake + win
      setDealer(s => ({ ...s, holeRevealed: true }))
      setDealerNatural(false)
      setDealerFinalTotal(21)
      setPhase('show')
      discardRef.current.push(p1, p2, d1, d2)
      if (!settledRef.current) {
        settledRef.current = true
        finalizeNet(pay) // precise result bar for BJ win
      }
      audio.win('med')
      return
    }

    setPhase('player')
  }

  /** ---- Insurance ---- */
  function takeInsurance() {
    if (phase !== 'insurance') return
    const wager = +(bet / 2).toFixed(2)
    if (credits < wager) return
    setCredits(c => +(c - wager).toFixed(2))
    setInsuranceTaken(true)
    setInsuranceWager(wager)

    if (hintsEnabled && INS_TRAIN_IDS.has(rules.id)) {
      setInsurancePrompt(true)
    }

    dealerPeekAfterInsurance()
  }
  function declineInsurance() {
    if (phase !== 'insurance') return
    setInsuranceTaken(false)
    setInsuranceWager(0)
    dealerPeekAfterInsurance()
  }

  function dealerPeekAfterInsurance() {
    const [d1, d2] = dealer.cards
    const dv = valueOfHand([d1, d2])
    if (dv.natural) {
      // Insurance resolution
      if (insuranceTaken) {
        setCredits(c => +(c + (insuranceWager * 3)).toFixed(2)) // return + 2:1
      }
      settleNaturalWithDealerBJ(hands, dealer.cards)
    } else {
      const h0 = hands[0]
      if (h0.isBlackjackNatural) {
        const mult = blackjackMultiplier(rules.blackjackPayout)
        const pay = +(h0.bet * mult).toFixed(2)
        setCredits(c => +(c + h0.bet + pay).toFixed(2))
        setDealer(s => ({ ...s, holeRevealed: true }))
        setDealerFinalTotal(valueOfHand(dealer.cards).total)
        setDealerNatural(false)
        setPhase('show')
        discardRef.current.push(...h0.cards, ...dealer.cards)
        if (!settledRef.current) {
          settledRef.current = true
          finalizeNet(pay) // precise result bar for BJ win
        }
        audio.win('med')
      } else {
        setPhase('player')
      }
    }
  }

  function settleNaturalWithDealerBJ(handsAtDeal: BjHand[], dealerCards: Card[]) {
    setDealer(s => ({ ...s, holeRevealed: true }))
    setDealerNatural(true)

    const h = handsAtDeal[0]
    let netDelta = 0

    if (h.isBlackjackNatural) {
      // Push stake + possible insurance profit
      setCredits(c => +(c + h.bet).toFixed(2))
      netDelta = insuranceTaken ? (2 * insuranceWager) : 0
    } else {
      // Lose main bet; add insurance profit if taken
      netDelta = -h.bet + (insuranceTaken ? (2 * insuranceWager) : 0)
    }

    setPhase('show')
    discardRef.current.push(...h.cards, ...dealerCards)
    setDealerFinalTotal(21)
    setDealerBusted(false)
    if (!settledRef.current) {
      settledRef.current = true
      finalizeNet(netDelta)
    }
    audio.thud()
  }

  // Compute & show the exact net change for the round (explicit override only)
  function finalizeNet(deltaOverride: number) {
    setLastWinLoss(+deltaOverride.toFixed(2))
  }

  // active helpers
  const activeHand: BjHand | null = useMemo(() => hands[activeIndex] ?? null, [hands, activeIndex])
  const dealerUp: Card | null = useMemo(() => dealer.cards[0] ?? null, [dealer.cards])

  /** ---- Player actions (ref-guarded; lock released after commit) ---- */
  function advanceOrDealer(updatedHands: BjHand[], fromIdx: number) {
    const nextIdx = nextUnfinishedIndex(updatedHands, fromIdx + 1)
    if (nextIdx >= 0) {
      setActiveIndex(nextIdx)
      setPhase('player')
    } else {
      setPhase('dealer')
      setTimeout(() => dealerPlay(updatedHands), 0)
    }
  }

  // Ref-based eligibility (for handlers)
  function canDoubleNow(): boolean {
    if (phaseRef.current !== 'player') return false
    const h = handsRef.current[activeIndexRef.current]
    if (!h) return false
    if (h.isFinished) return false
    if (h.isSplitAces) return false // house rule: no double on split aces
    if (h.cards.length !== 2) return false
    if (credits < h.bet) return false
    return true
  }
  function canSplitNow(): boolean {
    if (phaseRef.current !== 'player') return false
    const h = handsRef.current[activeIndexRef.current]
    if (!h) return false
    if (!isPair(h.cards)) return false
    if (credits < h.bet) return false
    if (handsRef.current.length >= rules.maxSplits) return false
    const isAcesPair = h.cards[0].rank === 'A' && h.cards[1].rank === 'A'
    if (isAcesPair && !rules.allowResplitAces && hasSplitAcesRef.current) return false
    return true
  }

  // ====== IMPORTANT: no side-effects inside functional setState updaters ======

  function hit() {
    if (phaseRef.current !== 'player') return
    const idx = activeIndexRef.current
    const ah = handsRef.current[idx]
    if (!ah || ah.isFinished) return
    if (!tryLockAction('HIT')) return

    const c = drawCard()
    DBG('PLAYER-HIT', `${c.rank}${c.suit}`, '(shoe left:', shoeRef.current.length,')')
    audio.draw()

    const nextHands = handsRef.current.slice()
    const h = { ...nextHands[idx] }
    h.cards = h.cards.concat(c)
    const v = valueOfHand(h.cards)
    if (v.total > 21) { h.busted = true; h.isFinished = true }
    else if (v.total === 21) { h.stood = true; h.isFinished = true }
    nextHands[idx] = h

    setHands(nextHands)
    if (h.isFinished) advanceOrDealer(nextHands, idx)

    releaseActionAfterCommit('HIT')
  }

  function stand() {
    if (phaseRef.current !== 'player') return
    const idx = activeIndexRef.current
    const ah = handsRef.current[idx]
    if (!ah || ah.isFinished) return
    if (!tryLockAction('STAND')) return

    const nextHands = handsRef.current.slice()
    nextHands[idx] = { ...nextHands[idx], stood: true, isFinished: true }
    setHands(nextHands)
    advanceOrDealer(nextHands, idx)

    releaseActionAfterCommit('STAND')
  }

  function doubleDown() {
    if (!canDoubleNow()) return
    if (!tryLockAction('DOUBLE')) return
    audio.clickHi()

    const idx = activeIndexRef.current
    const hNow = handsRef.current[idx]

    // take extra stake now
    setCredits(c => +(c - hNow.bet).toFixed(2))

    const c1 = drawCard()
    DBG('PLAYER-DOUBLE', `${c1.rank}${c1.suit}`, '(shoe left:', shoeRef.current.length,')')
    audio.draw()

    const nextHands = handsRef.current.slice()
    const h = { ...nextHands[idx] }
    h.cards = h.cards.concat(c1)
    const v = valueOfHand(h.cards)
    h.busted = v.total > 21
    h.wasDoubled = true
    h.stood = true
    h.isFinished = true
    nextHands[idx] = h

    setHands(nextHands)
    advanceOrDealer(nextHands, idx)

    releaseActionAfterCommit('DOUBLE')
  }

  function split() {
    if (!canSplitNow()) return
    if (!tryLockAction('SPLIT')) return
    audio.click()

    const idx = activeIndexRef.current
    const hNow = handsRef.current[idx]
    setCredits(c => +(c - hNow.bet).toFixed(2)) // stake for the new hand

    const [cA, cB] = hNow.cards
    const isAcesPair = (cA.rank === 'A' && cB.rank === 'A')
    if (isAcesPair) setHasSplitAces(true)

    const s1 = drawCard()
    DBG('SPLIT-draw', `${s1.rank}${s1.suit}`, '(shoe left:', shoeRef.current.length,')')
    const s2 = drawCard()
    DBG('SPLIT-draw', `${s2.rank}${s2.suit}`, '(shoe left:', shoeRef.current.length,')')

    const make = (first: Card, second: Card, fromAces: boolean): BjHand => ({
      cards:[first, second],
      bet: hNow.bet,
      stood:false,
      busted:false,
      isSplitAces: fromAces,  // can HIT; cannot DOUBLE
      isFinished:false,
      wasDoubled:false,
      isBlackjackNatural:false, // 21 after split ≠ blackjack
    })

    const nextHands = handsRef.current.slice()
    nextHands.splice(idx, 1, make(cA, s1, isAcesPair), make(cB, s2, isAcesPair))
    setHands(nextHands)
    setActiveIndex(idx)
    setPhase('player')

    releaseActionAfterCommit('SPLIT')
  }

  /** Helper: deterministically play out dealer to final cards (no state race) */
  function playOutDealer(startCards: Card[]): Card[] {
    let cards = startCards.slice()
    while (true) {
      const v = valueOfHand(cards)
      const soft17 = (v.total === 17 && v.soft)
      if (v.total < 17 || (rules.dealerHitsSoft17 && soft17)) {
        const c = drawCard()
        DBG('DEALER-hit', `${c.rank}${c.suit}`, '(shoe left:', shoeRef.current.length,')')
        cards = cards.concat(c)
        audio.draw()
      } else break
    }
    return cards
  }

  /** ---- Dealer ---- */
  function dealerPlay(hsSnapshot?: BjHand[]) {
    if (dealerPlayingRef.current) {
      DBG('dealerPlay ignored (already started)')
      return
    }
    dealerPlayingRef.current = true

    const playerHands = hsSnapshot ?? handsRef.current
    const allBusted = playerHands.every(h => h.busted)
    const startCards = dealer.cards.slice()

    setTimeout(() => {
      setDealer(s => ({ ...s, holeRevealed: true }))
      audio.click()

      const dv0 = valueOfHand(startCards)
      DBG('Reveal hole:', `${startCards[1].rank}${startCards[1].suit}`, 'dealer=', `${startCards[0].rank}${startCards[0].suit}`, `${startCards[1].rank}${startCards[1].suit}`, 'total=', dv0.total)

      if (allBusted) {
        setDealerFinalTotal(dv0.total)
        setDealerBusted(false)
        setDealerNatural(dv0.natural)
        setTimeout(() => { setPhase('settle'); settleAllWithDealer(startCards, playerHands) }, 20)
        return
      }

      setTimeout(() => {
        const finalCards = playOutDealer(startCards)
        const vEnd = valueOfHand(finalCards)
        setDealerFinalTotal(vEnd.total)
        setDealerBusted(vEnd.total > 21)
        setDealerNatural(vEnd.natural)
        setDealer(s => ({ ...s, cards: finalCards, holeRevealed: true }))
        setTimeout(() => { setPhase('settle'); settleAllWithDealer(finalCards, playerHands) }, REVEAL_HIT_MS)
      }, REVEAL_HIT_MS)
    }, REVEAL_HOLE_MS)
  }

  /** ---- Settlement (use exact dealer cards; one-time guard) ---- */
  function settleAllWithDealer(dealerCards: Card[], playerHands: BjHand[]) {
    if (settledRef.current) { DBG('SETTLE skipped (already settled)'); return }
    settledRef.current = true

    DBG('--- SETTLEMENT ---')
    const dv = valueOfHand(dealerCards)
    DBG('Dealer:', dealerCards.map(c=>`${c.rank}${c.suit}`).join(' '), 'total=', dv.total)

    for (const h of playerHands) discardRef.current.push(...h.cards)
    discardRef.current.push(...dealerCards)

    let addBack = 0
    let totalStakePlaced = 0

    playerHands.forEach((h, i) => {
      if (h.isBlackjackNatural) return

      const pv = valueOfHand(h.cards)
      const stakePlaced = h.bet + (h.wasDoubled ? h.bet : 0)
      totalStakePlaced += stakePlaced
      DBG(` Hand ${i} :`, {
        hand: h.cards.map(c=>`${c.rank}${c.suit}`).join(' '),
        total: pv.total, busted: h.busted, doubled: h.wasDoubled, stakePlaced
      })

      if (h.busted) {
        // lose
      } else if (dv.total > 21) {
        addBack += stakePlaced * 2
      } else if (pv.total > dv.total) {
        addBack += stakePlaced * 2
      } else if (pv.total < dv.total) {
        // lose
      } else {
        addBack += stakePlaced
      }
    })

    const insuranceNet = (insuranceTaken ? -insuranceWager : 0)
    const netDelta = (addBack - totalStakePlaced) + insuranceNet

    if (addBack) {
      DBG('PAYOUT addBack=', addBack)
      setCredits(c => +(c + addBack).toFixed(2))
    } else {
      DBG('PAYOUT addBack=0 (all losses)')
    }

    setPhase('show')
    finalizeNet(netDelta)
    if (addBack > 0) audio.win('small'); else audio.thud()
    dealerPlayingRef.current = false
  }

  /** ---- Trainer (advice only; prompt on mistakes) ---- */
  const trainer = useMemo(() => {
    if (!hintsEnabled) return { action: null as BjAction | null }
    if (phase !== 'player' || !activeHand || !dealerUp) return { action: null as BjAction | null }
    const act = basicStrategyAction(
      activeHand.cards, dealerUp, rules, canDoubleNow(), canSplitNow(), false
    )
    return { action: act }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintsEnabled, phase, activeIndex, hands, dealerUp, rules, credits])

  // ===== UI booleans — use LIVE render state (not refs) =====
  const canDeal = (phase === 'bet' || phase === 'show') && credits >= bet
  const canHit  = phase === 'player' && !!activeHand && !activeHand.isFinished
  const canStand = phase === 'player' && !!activeHand && !activeHand.isFinished

  const canDbl = useMemo(() => {
    if (phase !== 'player' || !activeHand) return false
    if (activeHand.isFinished) return false
    if (activeHand.isSplitAces) return false
    if (activeHand.cards.length !== 2) return false
    if (credits < activeHand.bet) return false
    return true
  }, [phase, activeHand, credits])

  const canSplt = useMemo(() => {
    if (phase !== 'player' || !activeHand) return false
    if (!isPair(activeHand.cards)) return false
    if (credits < activeHand.bet) return false
    if (hands.length >= rules.maxSplits) return false
    const isAcesPair = activeHand.cards[0].rank === 'A' && activeHand.cards[1].rank === 'A'
    if (isAcesPair && !rules.allowResplitAces && hasSplitAces) return false
    return true
  }, [phase, activeHand, credits, hands.length, rules.maxSplits, rules.allowResplitAces, hasSplitAces])

  // trainer wrappers
  function withTrainer(user: BjAction, run: () => void) {
    if (!hintsEnabled || phaseRef.current !== 'player' || !dealerUp) { run(); return }
    const ah = handsRef.current[activeIndexRef.current]
    if (!ah) { run(); return }

    const suggestion = basicStrategyAction(ah.cards, dealerUp, rules, canDoubleNow(), canSplitNow(), false)

    if (suggestion !== user) {
      const key = makePromptKey(user)
      if (promptedOnceRef.current.has(key)) {
        // already prompted for this exact situation+action → just run it
        DBG('TRAINER suppressed (already prompted for this option). Running user action:', user)
        run()
        return
      }
      // first time: show prompt, count as incorrect attempt
      promptedOnceRef.current.add(key)
      DBG('TRAINER prompt — user', user, 'suggested', suggestion, '(counts as incorrect)')
      setAccT(t => t + 1) // count attempt; do NOT increment correct here (ever)
      setTrainerPrompt({ user, suggested: suggestion })
      return
    }

    // User matched basic strategy → record correct and run
    DBG('TRAINER correct play —', user)
    setAccT(t => t + 1)
    setAccC(c => c + 1)
    run()
  }

  const hitWrapped = () => withTrainer('HIT', hit)
  const standWrapped = () => withTrainer('STAND', stand)
  const doubleWrapped = () => withTrainer('DOUBLE', doubleDown)
  const splitWrapped = () => withTrainer('SPLIT', split)

  // trainer modal handlers
  function applyTrainerSuggestion() {
    if (!trainerPrompt) return
    const { suggested } = trainerPrompt
    setTrainerPrompt(null)
    // NOTE: do NOT add to accC — this choice already counted as incorrect when we showed the prompt
    if (suggested === 'HIT') hit()
    else if (suggested === 'STAND') stand()
    else if (suggested === 'DOUBLE') doubleDown()
    else if (suggested === 'SPLIT') split()
  }

  function keepUserAction() {
    if (!trainerPrompt) return
    const { user } = trainerPrompt
    setTrainerPrompt(null)
    // Ensure we don't prompt again for this exact situation+action:
    const key = makePromptKey(user)
    promptedOnceRef.current.add(key)
    DBG('TRAINER keep user action — executing original choice:', user)
    if (user === 'HIT') hit()
    else if (user === 'STAND') stand()
    else if (user === 'DOUBLE') doubleDown()
    else if (user === 'SPLIT') split()
    // Accuracy already counted as incorrect at prompt time.
  }

  // insurance trainer (left as-is)
  function applyInsuranceSuggestion() {
    setInsurancePrompt(false)
    if (phaseRef.current === 'insurance' && insuranceTaken) {
      setCredits(c => +(c + insuranceWager).toFixed(2))
      setInsuranceTaken(false)
      setInsuranceWager(0)
      dealerPeekAfterInsurance()
    }
    setAccT(t => t + 1)
    setAccC(c => c + 1)
  }
  function keepInsuranceChoice() {
    setInsurancePrompt(false)
    setAccT(t => t + 1)
  }

  function resetAccuracy() {
    writeNum(ACC_C_KEY, 0)
    writeNum(ACC_T_KEY, 0)
    setAccC(0); setAccT(0)
    window.dispatchEvent(new Event('app:accuracy'))
  }
  function resetRewards() {
    if (!confirm('Are you sure you want to clear your rewards totals?')) return
    setRewardsPoints(0)
    setRewardsRemainderHands(0)
    writeNum(REWARDS_KEY, 0)
    writeNum(REWARDS_REM_KEY, 0)
    window.dispatchEvent(new Event('app:rewards'))
  }

  // ===== Debug state probe: prints why Deal/Double/Split are disabled =====
  useEffect(() => {
    if (localStorage.getItem('bj:debug') === '1') {
      const canDealDbg = (phase === 'bet' || phase === 'show') && credits >= bet
      const ah = hands[activeIndex]
      DBG('STATE', {
        phase,
        canDeal: canDealDbg,
        canDoubleUI: canDbl,
        canSplitUI: canSplt,
        credits,
        bet,
        activeIndex,
        cards: ah?.cards.map(c => `${c.rank}${c.suit}`),
        finished: ah?.isFinished
      })
    }
  }, [phase, hands, credits, bet, activeIndex, canDbl, canSplt])

  return {
    rules,
    // bank/credits
    credits, insert, cashOutAll,
    // betting
    bet, setBet, addBet, setMinBet, setMaxBet, canDeal, canAdjustBet,
    // round
    phase, dealer, hands, activeIndex,
    deal,
    hit: hitWrapped, stand: standWrapped, doubleDown: doubleWrapped, split: splitWrapped,
    canHit, canStand, canDbl, canSplt,
    // trainer
    hintsEnabled, setHintsEnabled, trainer,
    trainerPrompt, applyTrainerSuggestion, keepUserAction,
    // insurance
    insuranceOffered, insuranceTaken, takeInsurance, declineInsurance,
    insurancePrompt, applyInsuranceSuggestion, keepInsuranceChoice,
    // stats & UI
    accC, accT, accuracyPct, resetAccuracy, resetRewards,
    lastWinLoss,
    dealerFinalTotal, dealerBusted, dealerNatural,
    rewardsPoints,
    // ui busy indicator for action row (prevents double-clicks)
    uiActionBusy,
  }
}

