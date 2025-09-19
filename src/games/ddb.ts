// src/games/ddb.ts
import type { Card, Rank, Suit } from '../cards'
import type { GameSpec, HandName, Paytable, HandOutcome, CoachReturn } from './spec'

/** 9/6 Double Double Bonus (Full-Pay) */
const DDB_PAYTABLE: Paytable = {
  // DDB rows
  'Royal Flush':                 [250,500,750,1000,4000],
  'Straight Flush':              [50,100,150,200,250],
  'Four Aces w/2,3,4':           [400,800,1200,1600,2000],
  'Four 2s,3s,4s w/A,2,3,4':    [160,320,480,640,800],
  'Four Aces':                   [160,320,480,640,800],
  'Four 2s,3s,4s':               [80,160,240,320,400],
  'Four 5s thru Ks':             [50,100,150,200,250],
  'Full House':                  [9,18,27,36,45],
  'Flush':                       [6,12,18,24,30],
  'Straight':                    [4,8,12,16,20],
  'Three of a Kind':             [3,6,9,12,15],
  'Two Pair':                    [1,2,3,4,5],
  'Jacks or Better':             [1,2,3,4,5],

  // Type parity rows (unused in DDB)
  'Natural Royal Flush':         [0,0,0,0,0],
  'Wild Royal Flush':            [0,0,0,0,0],
  'Five of a Kind':              [0,0,0,0,0],
  'Four Deuces':                 [0,0,0,0,0],
}

const DDB_ORDER: HandName[] = [
  'Royal Flush',
  'Straight Flush',
  'Four Aces w/2,3,4',
  'Four 2s,3s,4s w/A,2,3,4',
  'Four Aces',
  'Four 2s,3s,4s',
  'Four 5s thru Ks',
  'Full House',
  'Flush',
  'Straight',
  'Three of a Kind',
  'Two Pair',
  'Jacks or Better',
]

// ===== Helpers =====
const V: Record<Rank, number> = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14
}
const HIGHS = new Set<Rank>(['J','Q','K','A'])
const ROYALS = new Set<Rank>(['10','J','Q','K','A'])

function countBy<T extends string>(arr: T[]): Record<T, number> {
  const m = {} as Record<T, number>
  for (const v of arr) m[v] = (m[v] ?? 0) + 1
  return m
}
function idxOf(cards: Card[], pred: (c: Card)=>boolean) {
  return cards.map((c,i)=> pred(c)? i : -1).filter(i=>i>=0)
}
function maskFromIdx(idx: number[]): boolean[] {
  const s = new Set(idx)
  return [0,1,2,3,4].map(i => s.has(i))
}
function isFlush(cards: Card[]) { return cards.every(c => c.suit === cards[0].suit) }
function isStraight(vals: number[]) {
  const s = Array.from(new Set(vals)).sort((a,b)=>a-b)
  if (s.length !== 5) return false
  if (s[4]-s[0] === 4) return true
  // wheel
  return s.join(',') === [14,5,4,3,2].sort((a,b)=>a-b).join(',')
}
function isRoyal(cards: Card[]) {
  const set = new Set(cards.map(c=>c.rank))
  return ['10','J','Q','K','A'].every(r => set.has(r as Rank))
}
const hasAll = (hay: string[], need: string[]) => {
  const s = new Set(hay)
  return need.every(n => s.has(n))
}

// ---- INSIDE-STRAIGHT: allowed 4-card patterns only (your list) ----
const INSIDE4_ALLOWED: string[][] = [
  ['8','9','10','J'],
  ['9','10','J','Q'],
  ['10','J','Q','K'],
  ['J','Q','K','A'],
  ['8','9','J','Q'],
  ['8','10','J','Q'],
  ['9','10','J','K'],
  ['9','10','Q','K'],
]
function matchesAllowedInside4(ranks: string[]) {
  return INSIDE4_ALLOWED.some(p => hasAll(ranks, p))
}

// ---- 4 to a Straight: outside sequences (22) + specific inside groups (20,24,26,29,38) ----
const SEQ_OUTSIDE_22: string[][] = [
  ['2','3','4','5'], ['3','4','5','6'], ['4','5','6','7'], ['5','6','7','8'],
  ['6','7','8','9'], ['7','8','9','10']
]
const SEQ_IN_20: string[][] = [
  ['8','9','10','J'], ['9','10','J','Q'], ['10','J','Q','K'] // same as allowed-inside “broadway edges”
]
const SEQ_IN_24: string[][] = [['J','Q','K','A']]
const SEQ_IN_26: string[][] = [
  ['9','J','Q','K'], ['10','J','Q','A'], ['10','J','K','A'], ['10','Q','K','A']
]
const SEQ_IN_29: string[][] = [
  ['8','9','J','Q'], ['8','10','J','Q'], ['9','10','J','K'], ['9','10','Q','K']
]
const SEQ_MISC_38: string[][] = [
  ['2','3','4','6'], ['2','3','5','6'], ['2','4','5','6'],
  ['3','4','5','7'], ['3','4','6','7'], ['3','5','6','7'],
  ['4','5','6','8'], ['4','5','7','8'], ['4','6','7','8'],
  ['5','6','7','9'], ['5','6','8','9'], ['5','7','8','9'],
  ['6','7','8','10'], ['6','7','9','10'], ['6','8','9','10'],
  ['6','7','9','10'], // keep common dup for robustness
]

// ---- 3 to a Straight Flush blocks (23, 27, 37) ----
const SF3_BLOCK_23: string[][] = [
  // 345..89T + mixed broadway steps
  ['3','4','5'], ['4','5','6'], ['5','6','7'], ['6','7','8'], ['7','8','9'], ['8','9','10'],
  ['8','9','J'], ['8','10','J'], ['8','J','Q'], ['9','10','J'], ['9','10','Q'], ['9','J','Q'],
  ['9','J','K'], ['9','Q','K']
]
const SF3_BLOCK_27: string[][] = [
  // ace-low + many middling clusters
  ['A','2','3'], ['2','3','4'], ['2','3','5'], ['2','4','5'],
  ['3','4','6'], ['3','5','6'], ['4','5','7'], ['4','6','7'],
  ['5','6','8'], ['5','7','8'], ['6','7','9'], ['6','8','9'],
  ['7','8','10'], ['7','8','J'], ['7','9','J'], ['7','9','10'], ['7','10','J'],
  ['8','9','Q'], ['8','10','Q'], ['9','10','K']
]
const SF3_BLOCK_37: string[][] = [
  ['2','3','6'], ['2','4','6'], ['2','5','6'],
  ['3','4','7'], ['3','5','7'], ['3','6','7'],
  ['4','5','8'], ['4','6','8'], ['4','7','8'],
  ['5','6','9'], ['5','7','9'], ['5','8','9'],
  ['6','7','10'], ['6','8','10'], ['6','9','10'],
]

// ---- 3 to a Royal (strict order per your chart) ----
const THREE_TO_RF_ORDERED: string[][] = [
  // 14) JQK
  ['J','Q','K'],
  // 16) TJQ
  ['10','J','Q'],
  // 19) TJK, TQK
  ['10','J','K'], ['10','Q','K'],
  // 19) TJA, TQA, TKA, JQA, JKA, QKA
  ['10','J','A'], ['10','Q','A'], ['10','K','A'],
  ['J','Q','A'],  ['J','K','A'],  ['Q','K','A'],
]

function find4ToRoyal(hand: Card[]): number[] | null {
  const idxAll = [0,1,2,3,4]
  for (const s of new Set(hand.map(c=>c.suit))) {
    const idx = idxAll.filter(i => hand[i].suit===s && ROYALS.has(hand[i].rank))
    if (idx.length >= 4) return idx.slice(0,4)
  }
  return null
}
function find3ToRoyalOrdered(hand: Card[]): { pick:number[], label:string } | null {
  const idxAll = [0,1,2,3,4]
  for (const pattern of THREE_TO_RF_ORDERED) {
    let best: { sum:number, pick:number[] } | null = null
    for (const s of new Set(hand.map(c=>c.suit))) {
      const suited = idxAll.filter(i => hand[i].suit===s && ROYALS.has(hand[i].rank))
      for (let a=0;a<suited.length;a++) for (let b=a+1;b<suited.length;b++) for (let c=b+1;c<suited.length;c++) {
        const pick = [suited[a],suited[b],suited[c]]
        const ranks = pick.map(i => hand[i].rank as string)
        if (!hasAll(ranks, pattern)) continue
        const sum = pick.reduce((acc,i)=>acc+V[hand[i].rank],0)
        if (!best || sum>best.sum) best = { sum, pick }
      }
    }
    if (best) {
      const tag = pattern.join('')
      return { pick: best.pick, label: tag==='10JQ' ? 'TJQ' : tag }
    }
  }
  return null
}
function find4ToStraightFlush(hand: Card[]): number[] | null {
  const idxAll = [0,1,2,3,4]
  for (const s of new Set(hand.map(c=>c.suit))) {
    const suited = idxAll.filter(i => hand[i].suit===s)
    for (let a=0;a<suited.length;a++) for (let b=a+1;b<suited.length;b++)
      for (let c=b+1;c<suited.length;c++) for (let d=c+1; d<suited.length; d++) {
        const pick = [suited[a],suited[b],suited[c],suited[d]]
        const vs = pick.map(i=>V[hand[i].rank]).sort((x,y)=>x-y)
        const ok = vs[1]-vs[0]===1 && vs[2]-vs[1]===1 && vs[3]-vs[2]===1
        if (ok) return pick
      }
  }
  return null
}
function any4ToFlush(hand: Card[]): number[] | null {
  const idxAll = [0,1,2,3,4]
  for (const s of new Set(hand.map(c=>c.suit))) {
    const suited = idxAll.filter(i => hand[i].suit===s)
    if (suited.length === 4) return suited
  }
  return null
}
function find4ToStraightFromSets(hand: Card[], sets: string[][]): number[] | null {
  const idxAll = [0,1,2,3,4]
  for (const set of sets) {
    // choose any indices whose ranks match all members of the set
    const pick: number[] = []
    const need = new Map<string, number>()
    set.forEach(r => need.set(r, (need.get(r) ?? 0) + 1))
    for (const i of idxAll) {
      const r = hand[i].rank as string
      const want = need.get(r) ?? 0
      if (want > 0) { pick.push(i); need.set(r, want-1) }
    }
    if (pick.length === set.length) return pick
  }
  return null
}
function find3ToStraightFlushFromSets(hand: Card[], sets: string[][]): number[] | null {
  const idxAll = [0,1,2,3,4]
  for (const s of new Set(hand.map(c=>c.suit))) {
    const suited = idxAll.filter(i => hand[i].suit===s)
    for (const set of sets) {
      const need = new Map<string, number>()
      set.forEach(r => need.set(r, (need.get(r) ?? 0) + 1))
      const pick: number[] = []
      for (const i of suited) {
        const r = hand[i].rank as string
        const want = need.get(r) ?? 0
        if (want>0) { pick.push(i); need.set(r, want-1) }
      }
      if (pick.length === 3) return pick
    }
  }
  return null
}
function suitedPair(hand: Card[], a: Rank, b: Rank): number[] | null {
  for (const s of new Set(hand.map(c=>c.suit))) {
    const i = hand.findIndex(c => c.rank===a && c.suit===s)
    const j = hand.findIndex((c,idx) => c.rank===b && c.suit===s && idx!==i)
    if (i>=0 && j>=0) return [i,j]
  }
  return null
}
function hasRanks(hand: Card[], R: Rank[]): number[] {
  return idxOf(hand, c => R.includes(c.rank))
}
function keepPairOnly(hand: Card[], r: Rank): number[] {
  const idx = idxOf(hand, c => c.rank === r)
  return idx.slice(0,2)
}

// === Final-hand evaluator (DDB) ===
export function evaluateHandDDB(cards: Card[]): HandOutcome {
  const vals = cards.map(c=>V[c.rank])
  const flush = isFlush(cards)
  const straight = isStraight(vals)

  if (flush && isRoyal(cards)) return 'Royal Flush'
  if (flush && straight) return 'Straight Flush'

  const counts = countBy(cards.map(c=>c.rank))
  const entries = Object.entries(counts) as [Rank, number][]
  const byFreq = entries.sort((a,b)=> b[1]-a[1] || V[b[0]]-V[a[0]])
  const top = byFreq[0]

  if (top[1] === 4) {
    const quadRank = top[0]
    const kicker = cards.find(c => c.rank !== quadRank)!.rank
    if (quadRank === 'A') {
      if (new Set<Rank>(['2','3','4']).has(kicker)) return 'Four Aces w/2,3,4'
      return 'Four Aces'
    }
    if (quadRank === '2' || quadRank === '3' || quadRank === '4') {
      if (new Set<Rank>(['A','2','3','4']).has(kicker)) return 'Four 2s,3s,4s w/A,2,3,4'
      return 'Four 2s,3s,4s'
    }
    return 'Four 5s thru Ks'
  }

  if (top[1] === 3) {
    const second = byFreq[1][1]
    if (second === 2) return 'Full House'
    return 'Three of a Kind'
  }

  if (flush) return 'Flush'
  if (straight) return 'Straight'

  if (top[1] === 2) {
    const numPairs = entries.filter(([,n]) => n === 2).length
    if (numPairs === 2) return 'Two Pair'
    const pairRank = entries.find(([,n]) => n === 2)![0]
    if (HIGHS.has(pairRank)) return 'Jacks or Better'
  }

  return 'Nothing'
}

/* ===== Coaching (ordered to match your list) ===== */
function bestHoldDDB_9_6(hand: Card[]): CoachReturn {
  const outcome = evaluateHandDDB(hand)
  const ranks = hand.map(c=>c.rank as Rank)
  const counts = countBy(ranks)
  const pairRanks = (Object.keys(counts) as Rank[]).filter(r => counts[r] === 2)

  const ex = (idx: number[], reason: string): CoachReturn =>
    ({ mask: maskFromIdx(idx), reason })

  // 1–4,7–9: pat hands only (NOT trips/two pair)
  if ([
    'Royal Flush',
    'Straight Flush',
    'Four Aces w/2,3,4',
    'Four 2s,3s,4s w/A,2,3,4',
    'Four Aces',
    'Four 2s,3s,4s',
    'Four 5s thru Ks',
    'Full House',
    'Flush',
    'Straight',
  ].includes(outcome as HandName)) {
    return { mask: [true,true,true,true,true], reason: `Pat ${outcome}.` }
  }

  // 5) 4 to a Royal Flush
  {
    const r4 = find4ToRoyal(hand)
    if (r4) return ex(r4, '4 to a Royal Flush.')
  }

  // 6) Trips Aces  | 10) Trips 2s–Ks
  if (Object.values(counts).includes(3)) {
    const tripRank = (Object.keys(counts) as Rank[]).find(r => counts[r] === 3)!
    const tripIdx  = idxOf(hand, c => c.rank === tripRank)
    return ex(tripIdx, tripRank === 'A' ? '3 of a kind: Aces.' : '3 of a kind.')
  }

  // 11) 4 to a Straight Flush
  {
    const sf4 = find4ToStraightFlush(hand)
    if (sf4) return ex(sf4, '4 to a Straight Flush.')
  }

  // 12) 1 pair: Aces
  if (counts['A'] === 2) return ex(keepPairOnly(hand, 'A'), '1 pair: Aces.')

  // 13) Two pair (keep both pairs)
  if (pairRanks.length === 2) {
    const keep = idxOf(hand, c => counts[c.rank] === 2)
    return ex(keep, 'Two pair: draw 1.')
  }

  // 14) 3 to a Royal: JQK
  {
    const r3 = find3ToRoyalOrdered(hand)
    if (r3 && r3.label === 'JQK') return ex(r3.pick, '3 to a Royal: JQK.')
  }

  // 15) 1 pair: Kings
  if (counts['K'] === 2) return ex(keepPairOnly(hand, 'K'), '1 pair: Kings.')

  // 16) 3 to a Royal: TJQ
  {
    const r3 = find3ToRoyalOrdered(hand)
    if (r3 && r3.label === 'TJQ') return ex(r3.pick, '3 to a Royal: TJQ.')
  }

  // 17) 1 pair: Jacks or Queens
  if (counts['Q'] === 2) return ex(keepPairOnly(hand, 'Q'), '1 pair: Queens.')
  if (counts['J'] === 2) return ex(keepPairOnly(hand, 'J'), '1 pair: Jacks.')

  // 18) 4 to a Flush
  {
    const fl4 = any4ToFlush(hand)
    if (fl4) return ex(fl4, '4 to a Flush.')
  }

  // 19) 3 to a Royal: TJK/TQK then A-including group
  {
    const r3 = find3ToRoyalOrdered(hand)
    if (r3) return ex(r3.pick, `3 to a Royal: ${r3.label}.`)
  }

  // 20) 4 to a Straight: 89TJ, 9TJQ, TJQK
  {
    const pick = find4ToStraightFromSets(hand, SEQ_IN_20)
    if (pick) return ex(pick, '4 to a Straight (broadway-inside).')
  }

  // 21) 1 pair: 2s thru 10s
  for (const r of ['10','9','8','7','6','5','4','3','2'] as Rank[]) {
    if (counts[r] === 2) return ex(keepPairOnly(hand, r), `1 pair: ${r}s.`)
  }

  // 22) 4 to a Straight (outside): 2345..789T
  {
    const pick = find4ToStraightFromSets(hand, SEQ_OUTSIDE_22)
    if (pick) return ex(pick, '4 to an outside Straight.')
  }

  // 23) 3 to a Straight Flush (first block)
  {
    const pick = find3ToStraightFlushFromSets(hand, SF3_BLOCK_23)
    if (pick) return ex(pick, '3 to a Straight Flush (strong).')
  }

  // 24) 4 to a Straight: JQKA
  {
    const pick = find4ToStraightFromSets(hand, SEQ_IN_24)
    if (pick) return ex(pick, '4 to a Straight: JQKA.')
  }

  // 25) 2 to a Royal Flush: JQ, JK/QK, JA/QA/KA (all suited pairs)
  {
    const jq = suitedPair(hand, 'J','Q')
    if (jq) return ex(jq, '2 to a Royal: JQ suited.')
    const jk = suitedPair(hand, 'J','K') ?? suitedPair(hand, 'Q','K')
    if (jk) return ex(jk, '2 to a Royal: JK/QK suited.')
    const ja = suitedPair(hand, 'J','A') ?? suitedPair(hand, 'Q','A') ?? suitedPair(hand, 'K','A')
    if (ja) return ex(ja, '2 to a Royal: (J/Q/K)+A suited.')
  }

  // 26) 4 to a Straight: 9JQK, TJQA/TJKA/TQKA
  {
    const pick = find4ToStraightFromSets(hand, SEQ_IN_26)
    if (pick) return ex(pick, '4 to a Straight (9JQK/TJQA/TJKA/TQKA).')
  }

  // 27) 3 to a Straight Flush (second block)
  {
    const pick = find3ToStraightFlushFromSets(hand, SF3_BLOCK_27)
    if (pick) return ex(pick, '3 to a Straight Flush (medium).')
  }

  // 28) 3 to a Straight: JQK (unsuited)
  if (hasAll(ranks as string[], ['J','Q','K'])) {
    const pick = hasRanks(hand, ['J','Q','K'])
    return ex(pick, '3 to a Straight: JQK.')
  }

    // 29) 4 to a Straight: 89JQ/8TJQ, 9TJK/9TQK
  {
    const pick = find4ToStraightFromSets(hand, SEQ_IN_29)
    if (pick) return ex(pick, '4 to a Straight (secondary inside).')
  }

  // 30) 1 high card: Ace  (elevated above unsuited JQ per your preference)
  {
    const iA = hand.findIndex(c => c.rank==='A')
    if (iA>=0) return ex([iA], '1 high card: Ace.')
  }

  // 31) 2 to a Straight: JQ (unsuited)
  {
    const iJ = hand.findIndex(c => c.rank==='J')
    const iQ = hand.findIndex(c => c.rank==='Q' && c.suit!==hand[iJ]?.suit)
    if (iJ>=0 && iQ>=0) return ex([iJ,iQ], '2 to a Straight: JQ.')
  }

  // 32) 2 to a Royal Flush: TJ suited
  {
    const tj = suitedPair(hand, '10','J')
    if (tj) return ex(tj, '2 to a Royal: TJ suited.')
  }

  // 33) 2 to a Straight: JK/QK (unsuited)
  {
    const iJ = hand.findIndex(c => c.rank==='J')
    const iQ = hand.findIndex(c => c.rank==='Q')
    const iK = hand.findIndex(c => c.rank==='K')
    if (iJ>=0 && iK>=0 && hand[iJ].suit!==hand[iK].suit) return ex([iJ,iK], '2 to a Straight: JK.')
    if (iQ>=0 && iK>=0 && hand[iQ].suit!==hand[iK].suit) return ex([iQ,iK], '2 to a Straight: QK.')
  }

  // 34) 3 to a Flush: 2TK to 8TK (three suited incl. T & K; third is 2..8)
  {
    for (const s of new Set(hand.map(c=>c.suit))) {
      const t = hand.findIndex(c => c.rank==='10' && c.suit===s)
      const k = hand.findIndex(c => c.rank==='K'  && c.suit===s)
      if (t>=0 && k>=0) {
        const lows = hand
          .map((c,i)=>({i,c}))
          .filter(x => x.c.suit===s && ['2','3','4','5','6','7','8'].includes(x.c.rank))
          .map(x=>x.i)
        if (lows.length) return ex([t,k,lows[0]], '3 to a Flush: T,K + low suited (2–8).')
      }
    }
  }

  // 35) 2 to a Royal Flush: TQ/TK suited
  {
    const tq = suitedPair(hand, '10','Q') ?? suitedPair(hand, '10','K')
    if (tq) return ex(tq, '2 to a Royal: TQ/TK suited.')
  }

  // 36) 1 high card: J/Q/K
  for (const r of ['K','Q','J'] as Rank[]) {
    const i = hand.findIndex(c => c.rank===r)
    if (i>=0) return ex([i], `1 high card: ${r}.`)
  }

  // 37) 3 to a Straight Flush: weak block
  {
    const pick = find3ToStraightFlushFromSets(hand, SF3_BLOCK_37)
    if (pick) return ex(pick, '3 to a Straight Flush (weak).')
  }

  // 38) 4 to a Straight: misc weak groups
  {
    const pick = find4ToStraightFromSets(hand, SEQ_MISC_38)
    if (pick) return ex(pick, '4 to a Straight (weak).')
  }

  // 39) Discard everything
  return { mask: [false,false,false,false,false], reason: 'Discard everything.' }
}

export const DDB_SPEC_9_6: GameSpec = {
  id: 'DDB_9_6',
  title: 'Double Double Bonus (9/6)',
  handOrder: DDB_ORDER,
  paytable: DDB_PAYTABLE,
  evaluateHand: evaluateHandDDB,
  bestHold: bestHoldDDB_9_6,
  notes: 'Full-pay 9/6 DDB. Special quad payouts by rank and kicker.',
  coaching: 'on'
}

