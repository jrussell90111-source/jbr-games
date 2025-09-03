// src/games/deuces.ts
import type { Card, Rank, Suit } from '../cards'
import type { GameSpec, HandName, Paytable, HandOutcome, CoachReturn } from './spec'

/** 25/16/13/4/3/2 (≈96.77%) */
const DW_PAYTABLE: Paytable = {
  // DW hands
  'Natural Royal Flush': [250,500,750,1000,4000],
  'Four Deuces':        [200,400,600,800,1000],
  'Wild Royal Flush':   [25,50,75,100,125],
  'Five of a Kind':     [16,32,48,64,80],
  'Straight Flush':     [13,26,39,52,65],
  'Four of a Kind':     [4,8,12,16,20],
  'Full House':         [3,6,9,12,15],
  'Flush':              [2,4,6,8,10],
  'Straight':           [2,4,6,8,10],
  'Three of a Kind':    [1,2,3,4,5],
  // JoB-only rows kept for type completeness (zeroed)
  'Royal Flush':        [0,0,0,0,0],
  'Two Pair':           [0,0,0,0,0],
  'Jacks or Better':    [0,0,0,0,0],
}

const DW_ORDER: HandName[] = [
  'Natural Royal Flush','Four Deuces','Wild Royal Flush','Five of a Kind',
  'Straight Flush','Four of a Kind','Full House','Flush','Straight','Three of a Kind'
]

// ===== Helpers =====
const ROYAL_SET = new Set<Rank>(['10','J','Q','K','A'])
const ROYAL_NO_TEN = new Set<Rank>(['J','Q','K','A'])
const V: Record<Rank, number> = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14
}
function countBy<T extends string>(arr: T[]): Record<T, number> {
  const m = {} as Record<T, number>
  for (const v of arr) m[v] = (m[v] ?? 0) + 1
  return m
}
function maskFromIdx(idx: number[]) { return [0,1,2,3,4].map(i => idx.includes(i)) }
function idxOf(cards: Card[], pred: (c: Card)=>boolean) {
  return cards.map((c,i)=> pred(c)? i : -1).filter(i=>i>=0)
}
function uniq<T>(arr: T[]) { return Array.from(new Set(arr)) }
function isConsecutive(vals: number[]) {
  if (vals.length < 2) return false
  for (let i=1;i<vals.length;i++) if (vals[i]-vals[i-1] !== 1) return false
  return true
}
function kComb<T>(arr: T[], k: number): T[][] {
  const res: T[][] = []
  const go = (s: number, pick: T[]) => {
    if (pick.length === k) { res.push(pick.slice()); return }
    for (let i=s;i<arr.length;i++) go(i+1, pick.concat(arr[i]))
  }
  go(0, [])
  return res
}

function isNaturalRoyal(cards: Card[]) {
  const suits = new Set(cards.map(c=>c.suit))
  if (suits.size !== 1) return false
  const rs = cards.map(c=>c.rank).sort()
  const royal = ['10','A','J','K','Q'].sort()
  return rs.join('|') === royal.join('|')
}
function canMakeRoyalWithWilds(cards: Card[], wilds: number) {
  const bySuit = new Map<Suit, Set<Rank>>()
  for (const c of cards) {
    if (c.rank === '2') continue
    const set = bySuit.get(c.suit as Suit) ?? new Set<Rank>()
    set.add(c.rank)
    bySuit.set(c.suit as Suit, set)
  }
  for (const set of bySuit.values()) {
    let miss = 0
    for (const r of ROYAL_SET) if (!set.has(r)) miss++
    if (miss <= wilds) return true
  }
  return false
}
function canMakeFlushWithWilds(cards: Card[], wilds: number) {
  const bySuit = countBy(cards.filter(c=>c.rank!=='2').map(c=>c.suit as Suit))
  for (const [s, cnt] of Object.entries(bySuit) as [Suit, number][]) {
    if (cnt + wilds >= 5) return true
  }
  return false
}
function canMakeStraightWithWilds(vals: number[], wilds: number) {
  const set = new Set(vals)
  const windows: number[][] = []
  for (let start=2; start<=10; start++) windows.push([start,start+1,start+2,start+3,start+4])
  windows.push([14,5,4,3,2]) // A-5
  for (const w of windows) {
    let miss = 0
    for (const v of w) if (!set.has(v)) miss++
    if (miss <= wilds) return true
  }
  return false
}
function canMakeStraightFlushWithWilds(cards: Card[], wilds: number) {
  const bySuit = new Map<Suit, number[]>()
  for (const c of cards) {
    if (c.rank === '2') continue
    const arr = bySuit.get(c.suit as Suit) ?? []
    arr.push(V[c.rank])
    bySuit.set(c.suit as Suit, arr)
  }
  for (const arr of bySuit.values()) if (canMakeStraightWithWilds(arr, wilds)) return true
  return false
}
function canMakeFullHouseWithWilds(counts: Record<Rank, number>, wilds: number) {
  const ranks = Object.keys(counts) as Rank[]
  for (const a of ranks) {
    const needTrip = Math.max(0, 3 - counts[a])
    if (needTrip > wilds) continue
    const left = wilds - needTrip
    for (const b of ranks) if (b !== a) {
      const needPair = Math.max(0, 2 - counts[b])
      if (needPair <= left) return true
    }
  }
  return false
}

// === Final-hand evaluator (shared) ===
export function evaluateHandDW(cards: Card[]): HandOutcome {
  const deuces = cards.filter(c=>c.rank==='2').length
  const non = cards.filter(c=>c.rank!=='2')
  const countsByRank = countBy(non.map(c=>c.rank as Rank))
  const maxSame = Math.max(0, ...Object.values(countsByRank))
  const nonVals = non.map(c=>V[c.rank])

  if (deuces === 0 && isNaturalRoyal(cards)) return 'Natural Royal Flush'
  if (deuces === 4) return 'Four Deuces'
  if (deuces >= 1 && canMakeRoyalWithWilds(cards, deuces)) return 'Wild Royal Flush'
  if (maxSame + deuces >= 5) return 'Five of a Kind'
  if (canMakeStraightFlushWithWilds(cards, deuces)) return 'Straight Flush'
  if (maxSame + deuces >= 4) return 'Four of a Kind'
  if (canMakeFullHouseWithWilds(countsByRank, deuces)) return 'Full House'
  if (canMakeFlushWithWilds(cards, deuces)) return 'Flush'
  if (canMakeStraightWithWilds(nonVals, deuces)) return 'Straight'
  if (maxSame + deuces >= 3) return 'Three of a Kind'
  return 'Nothing'
}

/* ===== Specific pattern finders ===== */
function find4ToNaturalRoyal_NoDeuce(hand: Card[]): number[] | null {
  for (const s of new Set(hand.map(c=>c.suit))) {
    const idx = hand.map((c,i)=>({i,c})).filter(x=>x.c.suit===s && ROYAL_SET.has(x.c.rank as Rank) && x.c.rank!=='2').map(x=>x.i)
    if (idx.length >= 4) return idx.sort((a,b)=> V[hand[b].rank]-V[hand[a].rank]).slice(0,4)
  }
  return null
}
function find3ToNaturalRoyal_NoDeuce(hand: Card[]): number[] | null {
  for (const s of new Set(hand.map(c=>c.suit))) {
    const idx = hand.map((c,i)=>({i,c})).filter(x=>x.c.suit===s && ROYAL_SET.has(x.c.rank as Rank) && x.c.rank!=='2').map(x=>x.i)
    if (idx.length >= 3) return idx.slice(0,3)
  }
  return null
}
function find2ToRoyal_JQHigh_NoTen_NoDeuce(hand: Card[]): number[] | null {
  for (const s of new Set(hand.map(c=>c.suit))) {
    const idx = hand.map((c,i)=>({i,c}))
      .filter(x=>x.c.suit===s && ROYAL_NO_TEN.has(x.c.rank as Rank) && x.c.rank!=='2')
      .map(x=>x.i)
    if (idx.length >= 2) {
      return idx.sort((a,b)=>V[hand[a].rank]-V[hand[b].rank]).slice(0,2)
    }
  }
  return null
}
function find4ToSF_NoWild(hand: Card[]): number[] | null {
  for (const s of new Set(hand.map(c=>c.suit))) {
    const idx = hand.map((c,i)=>({i,c})).filter(x=>x.c.suit===s && x.c.rank!=='2').map(x=>x.i)
    const vals = (i:number)=>V[hand[i].rank]
    for (const combo of kComb(idx, 4)) {
      const rs = combo.map(vals).sort((a,b)=>a-b)
      if (isConsecutive(rs)) return combo
    }
  }
  return null
}
function findAny3ToSF_Consecutive(hand: Card[]): number[] | null {
  for (const s of new Set(hand.map(c=>c.suit))) {
    const idx = hand.map((c,i)=>({i,c})).filter(x=>x.c.suit===s && x.c.rank!=='2').map(x=>x.i)
    const vals = (i:number)=>V[hand[i].rank]
    for (const combo of kComb(idx, 3)) {
      const rs = combo.map(vals).sort((a,b)=>a-b)
      if (isConsecutive(rs)) return combo
    }
  }
  return null
}
function find4ToFlush_NoWild(hand: Card[]): number[] | null {
  for (const s of new Set(hand.map(c=>c.suit))) {
    const idx = hand.map((c,i)=>({i,c})).filter(x=>x.c.suit===s && x.c.rank!=='2').map(x=>x.i)
    if (idx.length === 4) return idx
  }
  return null
}
function find4ToOutsideStraight_NoWild(hand: Card[]): number[] | null {
  const idx = [0,1,2,3,4]
  const vals = (i:number)=>V[hand[i].rank]
  for (const combo of kComb(idx, 4)) {
    const rs = combo.map(vals).sort((a,b)=>a-b)
    const u = Array.from(new Set(rs))
    if (u.length !== 4) continue
    if (u[3]-u[0] === 3 && u[1]-u[0]===1 && u[2]-u[1]===1 && u[3]-u[2]===1) return combo
  }
  return null
}

// === Inside-straight helpers: collect ALL candidates and provide alts ===
function findAll4ToInside_NoWild_NotMissingDeuce(hand: Card[]): number[][] {
  const idxAll = [0,1,2,3,4]
  const val = (i:number)=>V[hand[i].rank]
  const windows: number[][] = []
  for (let start=2; start<=10; start++) windows.push([start,start+1,start+2,start+3,start+4])

  const seen = new Set<string>()
  const out: number[][] = []

  for (const w of windows) {
    const haveIdx = idxAll.filter(i => w.includes(val(i)))
    if (haveIdx.length < 4) continue
    for (const combo of kComb(haveIdx, 4)) {
      const rs = combo.map(val).sort((a,b)=>a-b)
      const uniq = Array.from(new Set(rs))
      if (uniq.length !== 4) continue
      const span = uniq[3] - uniq[0]
      if (span !== 4) continue // 5-rank window, one missing → inside
      const have = new Set(uniq)
      const missing = [uniq[0]+1, uniq[0]+2, uniq[0]+3].find(v => !have.has(v))
      if (missing === undefined) continue
      if (missing === 2) continue // skip "missing 2" oddball
      const key = combo.slice().sort((a,b)=>a-b).join(',')
      if (!seen.has(key)) { seen.add(key); out.push(combo.slice()) }
    }
  }
  return out
}
function pickPrimaryInsideAndAlts(hand: Card[], cands: number[][]): { primary: number[], alts: number[][] } {
  const HIGHS = new Set<Rank>(['J','Q','K','A'])
  type Scored = { pick:number[], highs:number, sum:number }
  const scored: Scored[] = cands.map(pick => ({
    pick,
    highs: pick.reduce((acc,i)=> acc + (HIGHS.has(hand[i].rank as Rank) ? 1 : 0), 0),
    sum:   pick.reduce((acc,i)=> acc + V[hand[i].rank], 0),
  }))
  scored.sort((a,b) => (b.highs - a.highs) || (b.sum - a.sum))
  return { primary: scored[0].pick, alts: scored.slice(1).map(s => s.pick) }
}

// === NEW: 4 to a Wild Royal with exactly ONE deuce (3 suited royals + deuce)
function findAll4ToWRF_With1Deuce_3Royals(hand: Card[], deuceIdx: number): number[][] {
  const picks: number[][] = []
  for (const s of new Set(hand.map(c=>c.suit))) {
    const roy = hand
      .map((c,i)=>({i,c}))
      .filter(x => x.c.suit === s && x.c.rank !== '2' && ROYAL_SET.has(x.c.rank as Rank))
      .map(x => x.i)
    if (roy.length >= 3) picks.push(roy.slice(0,3).concat(deuceIdx))
  }
  return picks
}
function pickPrimaryWRF3Royals(hand: Card[], cands: number[][]): { primary: number[], alts: number[][] } {
  const scored = cands.map(pick => ({
    pick,
    sum: pick.reduce((acc,i)=> acc + V[hand[i].rank], 0)
  }))
  scored.sort((a,b)=> b.sum - a.sum)
  return { primary: scored[0].pick, alts: scored.slice(1).map(s=>s.pick) }
}

function find4ToWRF_With2Deuces(hand: Card[], deucesIdx: number[]): number[] | null {
  let best: number[] | null = null
  let bestCount = -1
  for (const s of new Set(hand.map(c=>c.suit))) {
    const roy = hand.map((c,i)=>({i,c})).filter(x=>x.c.suit===s && x.c.rank!=='2' && ROYAL_SET.has(x.c.rank as Rank)).map(x=>x.i)
    if (roy.length >= 2 && roy.length > bestCount) {
      best = roy.sort((a,b)=>V[hand[a].rank]-V[hand[b].rank]).slice(0,2).concat(deucesIdx.slice(0,2))
      bestCount = roy.length
    }
  }
  return best
}
function find2SuitedConsecMin(hand: Card[], suit: Suit, minLow: number): number[] | null {
  const idx = hand.map((c,i)=>({i,c})).filter(x=>x.c.suit===suit && x.c.rank!=='2').map(x=>x.i)
  const vals = (i:number)=>V[hand[i].rank]
  for (const a of idx) for (const b of idx) if (a<b) {
    const low = Math.min(vals(a), vals(b)), high = Math.max(vals(a), vals(b))
    if (high-low === 1 && low >= minLow) return [a,b]
  }
  return null
}
function find3SuitedConsecMin(hand: Card[], suit: Suit, minLow: number): number[] | null {
  const idx = hand.map((c,i)=>({i,c})).filter(x=>x.c.suit===suit && x.c.rank!=='2').map(x=>x.i)
  const vals = (i:number)=>V[hand[i].rank]
  for (const combo of kComb(idx, 3)) {
    const rs = combo.map(vals).sort((a,b)=>a-b)
    if (isConsecutive(rs) && rs[0] >= minLow) return combo
  }
  return null
}
function findTight2SuitedForSF(hand: Card[]): number[] | null {
  let best: {pick:number[], span:number} | null = null
  for (const s of new Set(hand.map(c=>c.suit))) {
    const idx = hand.map((c,i)=>({i,c})).filter(x=>x.c.suit===s && x.c.rank!=='2').map(x=>x.i)
    const vals = (i:number)=>V[hand[i].rank]
    for (const combo of kComb(idx, 2)) {
      const rs = combo.map(vals).sort((a,b)=>a-b)
      const span = rs[1]-rs[0]
      if (span <= 2 && (!best || span < best.span)) best = { pick: combo, span }
    }
  }
  return best?.pick ?? null
}

// ===== Coaching with reasons (and alts support) =====
function bestHoldDW_25_16_13(hand: Card[]): CoachReturn {
  const deucesIdx = idxOf(hand, c => c.rank === '2')
  const wilds = deucesIdx.length
  const evalRank = evaluateHandDW(hand)

  const ex = (idx: number[], reason: string): CoachReturn => ({ mask: maskFromIdx(uniq(idx).sort((a,b)=>a-b)), reason })

  // 4 Deuces
  if (wilds === 4) return ex(deucesIdx, '4 deuces: always hold (pat Four Deuces).')

  // 3 Deuces — NEVER pat quads; keep the 3 deuces, draw 2 unless it’s a true pat monster
  if (wilds === 3) {
    if (['Wild Royal Flush','Five of a Kind','Straight Flush'].includes(evalRank as HandName))
      return { mask: [true,true,true,true,true], reason: `3 deuces: pat ${evalRank}.` }
    return ex(deucesIdx, '3 deuces: hold 3 deuces, draw 2 (chase 4-deuces / WRF / SF / 5-kind).')
  }

  // 2 Deuces
  if (wilds === 2) {
    // Pat only WRF / 5-kind / SF. Do NOT pat Four of a Kind (upgrade to 5-kind).
    if (['Wild Royal Flush','Five of a Kind','Straight Flush'].includes(evalRank as HandName))
      return { mask: [true,true,true,true,true], reason: `2 deuces: pat ${evalRank}.` }

    // If Four of a Kind (pair + two deuces) → keep those 4, draw 1 for 5-kind
    if (evalRank === 'Four of a Kind') {
      const non = hand.map((c,i)=>({i,c})).filter(x=>x.c.rank!=='2')
      const counts = countBy(non.map(x=>x.c.rank as Rank))
      const pairRank = (Object.keys(counts) as Rank[]).find(r => counts[r] === 2)!
      const pairIdx = non.filter(x=>x.c.rank===pairRank).map(x=>x.i)
      const fourIdx = deucesIdx.slice(0,2).concat(pairIdx)
      return ex(fourIdx, '2 deuces: quads — discard kicker, draw 1 for Five of a Kind.')
    }

    const wr4 = find4ToWRF_With2Deuces(hand, deucesIdx)
    if (wr4) return ex(wr4, '2 deuces: 4 to a Wild Royal (two suited royals + two deuces).')

    for (const s of new Set(hand.map(c=>c.suit))) {
      const pair = find2SuitedConsecMin(hand, s as Suit, 6)
      if (pair) return ex(pair.concat(deucesIdx.slice(0,2)), '2 deuces: chase Straight Flush — two suited consecutive (≥6) + two deuces.')
    }
    return ex(deucesIdx, '2 deuces: default — keep deuces, draw 3.')
  }

  // 1 Deuce
  if (wilds === 1) {
    // Pat only WRF / 5-kind / SF. Do NOT pat quads (upgrade path).
    if (['Wild Royal Flush','Five of a Kind','Straight Flush'].includes(evalRank as HandName))
      return { mask: [true,true,true,true,true], reason: `1 deuce: pat ${evalRank}.` }

    // NEW: If Four of a Kind (natural trips + deuce), keep trip + deuce (4 cards), draw 1 for 5-kind
    if (evalRank === 'Four of a Kind') {
      const non = hand.map((c,i)=>({i,c})).filter(x=>x.c.rank!=='2')
      const counts = countBy(non.map(x=>x.c.rank as Rank))
      const tripRank = (Object.keys(counts) as Rank[]).find(r => counts[r] === 3)
      if (tripRank) {
        const tripIdx = non.filter(x=>x.c.rank===tripRank).map(x=>x.i)
        return ex(tripIdx.concat(deucesIdx[0]), '1 deuce: quads — discard kicker, draw 1 for Five of a Kind.')
      }
    }

    const nrf4 = find4ToNaturalRoyal_NoDeuce(hand)
    if (nrf4) return ex(nrf4, '1 deuce: 4 to a Natural Royal.')

    // 4 to a WRF with ONE deuce (three suited royals + deuce), with alts
    {
      const picks = findAll4ToWRF_With1Deuce_3Royals(hand, deucesIdx[0])
      if (picks.length) {
        const { primary, alts } = pickPrimaryWRF3Royals(hand, picks)
        const altMasks = alts.map(maskFromIdx)
        return {
          mask: maskFromIdx(primary),
          alts: altMasks,
          reason: '1 deuce: 4 to a Wild Royal (three suited royals + deuce).'
        }
      }
    }

    // If it’s a pat Full House, we’ll still pat — but accept either (pair + deuce) as alts if the non-deuces show two pairs.
    if (evalRank === 'Full House') {
      const non = hand.map((c,i)=>({i,c})).filter(x=>x.c.rank!=='2')
      const counts = countBy(non.map(x=>x.c.rank as Rank))
      const pairRanks = (Object.keys(counts) as Rank[]).filter(r => counts[r] === 2)
      if (pairRanks.length === 2) {
        const [rHi, rLo] = pairRanks.slice().sort((a,b)=>V[b]-V[a])
        const idxHi = idxOf(hand, c => c.rank === rHi)
        const idxLo = idxOf(hand, c => c.rank === rLo)
        const alts = [maskFromIdx(idxHi.concat(deucesIdx[0])), maskFromIdx(idxLo.concat(deucesIdx[0]))]
        return {
          mask: [true,true,true,true,true], // prefer pat
          alts,
          reason: '1 deuce: Full House (two natural pairs) — stand pat; either pair+deuce is accepted.'
        }
      }
      return { mask: [true,true,true,true,true], reason: '1 deuce: keep Full House (pat).' }
    }

    // Strong SF line outranks pat flush on 16/13
    for (const s of new Set(hand.map(c=>c.suit))) {
      const sf3hi = find3SuitedConsecMin(hand, s as Suit, 5)
      if (sf3hi) return ex(sf3hi.concat(deucesIdx[0]), '1 deuce: 3 consecutive suited (≥5) + deuce — outranks pat flush on 16/13.')
    }

    // True pat Straight/Flush
    if (evalRank === 'Straight' || evalRank === 'Flush')
      return { mask: [true,true,true,true,true], reason: `1 deuce: pat ${evalRank}.` }

    // One or two pairs among non-deuces → keep (pair + deuce); if two pairs, either pair + deuce is OK
    {
      const non = hand.map((c,i)=>({i,c})).filter(x=>x.c.rank!=='2')
      const counts = countBy(non.map(x=>x.c.rank as Rank))
      const pairRanks = (Object.keys(counts) as Rank[]).filter(r => counts[r] === 2)
      if (pairRanks.length >= 1) {
        const primary = non.filter(x=>x.c.rank===pairRanks[0]).map(x=>x.i).concat(deucesIdx[0])
        if (pairRanks.length >= 2) {
          const alt = non.filter(x=>x.c.rank===pairRanks[1]).map(x=>x.i).concat(deucesIdx[0])
          const altMasks = [maskFromIdx(alt)]
          return {
            mask: maskFromIdx(primary),
            alts: altMasks,
            reason: '1 deuce: pair + deuce → keep 3-of-a-kind; two pairs present — either pair + deuce is equivalent.'
          }
        }
        return ex(primary, '1 deuce: pair + deuce → keep 3-of-a-kind, draw 2.')
      }
    }

    // Other SF routes
    const any3sf = findAny3ToSF_Consecutive(hand)
    if (any3sf) return ex(any3sf.concat(deucesIdx[0]), '1 deuce: other Straight-Flush draw (3 consecutive suited + deuce).')

    // 3 to a Royal (two suited royals + deuce) — after WRF-4 check
    for (const s of new Set(hand.map(c=>c.suit))) {
      const roy = hand.map((c,i)=>({i,c})).filter(x=>x.c.suit===s && x.c.rank!=='2' && ROYAL_SET.has(x.c.rank as Rank)).map(x=>x.i)
      if (roy.length >= 2) return ex(roy.slice(0,2).concat(deucesIdx[0]), '1 deuce: 3 to a Royal (two suited royals + deuce).')
    }

    // Two suited consecutive (≥6) + deuce toward SF
    for (const s of new Set(hand.map(c=>c.suit))) {
      const tight2 = find2SuitedConsecMin(hand, s as Suit, 6)
      if (tight2) return ex(tight2.concat(deucesIdx[0]), '1 deuce: two suited consecutive (≥6) + deuce toward SF.')
    }

    // Fallback: deuce only
    return ex([deucesIdx[0]], '1 deuce: deuce only — discard four.')
  }

  // 0 Deuces
  {
    const nrf4 = find4ToNaturalRoyal_NoDeuce(hand)
    if (nrf4) return ex(nrf4, '0 deuces: 4 to a Natural Royal.')
    if (isNaturalRoyal(hand)) return { mask: [true,true,true,true,true], reason: '0 deuces: Natural Royal (pat).' }

    // Pat hands EXCEPT trips (we'll handle trips explicitly)
    if (['Straight','Flush','Full House','Four of a Kind','Straight Flush'].includes(evalRank as HandName))
      return { mask: [true,true,true,true,true], reason: `0 deuces: pat ${evalRank}.` }

    // Natural trips → hold the three, draw two
    if (evalRank === 'Three of a Kind') {
      const countsTrips = countBy(hand.map(c=>c.rank as Rank))
      const tripRank = (Object.keys(countsTrips) as Rank[]).find(r => countsTrips[r] === 3)!
      const tripIdx = idxOf(hand, c => c.rank === tripRank)
      return ex(tripIdx, '0 deuces: keep trips, draw 2 for Full House/Quads — discard unrelated kickers.')
    }

    // Two pair → keep ONE pair; EV equivalent for non-deuce ranks → return alts
    {
      const counts = countBy(hand.map(c=>c.rank as Rank))
      const pairRanks = (Object.keys(counts) as Rank[]).filter(r => counts[r] === 2)
      if (pairRanks.length >= 2) {
        const [rHi, rLo] = pairRanks.slice().sort((a,b)=>V[b]-V[a])
        const idxHi = idxOf(hand, c => c.rank === rHi)
        const idxLo = idxOf(hand, c => c.rank === rLo)
        const altMask = maskFromIdx(idxLo)
        return {
          mask: maskFromIdx(idxHi),
          alts: [altMask],
          reason: '0 deuces: two pair — keep either pair; EV is equivalent in DW (non-2 pairs).'
        }
      }
      if (pairRanks.length === 1) {
        const idx = idxOf(hand, c => c.rank === pairRanks[0])
        return ex(idx, '0 deuces: one pair — never keep two pair.')
      }
    }

    const sf4 = find4ToSF_NoWild(hand)
    if (sf4) return ex(sf4, '0 deuces: 4 to a Straight Flush.')

    const nrf3 = find3ToNaturalRoyal_NoDeuce(hand)
    if (nrf3) return ex(nrf3, '0 deuces: 3 to a Natural Royal.')

    const fl4 = find4ToFlush_NoWild(hand)
    if (fl4) return ex(fl4, '0 deuces: 4 to a Flush.')

    const st4 = find4ToOutsideStraight_NoWild(hand)
    if (st4) return ex(st4, '0 deuces: 4 to an outside straight.')

    const sf3 = findAny3ToSF_Consecutive(hand)
    if (sf3) return ex(sf3, '0 deuces: 3 to a Straight Flush.')

    // Inside straight with alts — accept any equal-EV 4-card choice
    {
      const allInside = findAll4ToInside_NoWild_NotMissingDeuce(hand)
      if (allInside.length) {
        const { primary, alts } = pickPrimaryInsideAndAlts(hand, allInside)
        const altMasks = alts.map(maskFromIdx)
        return {
          mask: maskFromIdx(primary),
          alts: altMasks,
          reason: '0 deuces: 4 to an inside straight — multiple equivalent holds are OK.'
        }
      }
    }

    const r2 = find2ToRoyal_JQHigh_NoTen_NoDeuce(hand)
    if (r2) return ex(r2, '0 deuces: 2 to a Royal (JQ-high suited).')

    return { mask: [false,false,false,false,false], reason: '0 deuces: toss everything.' }
  }
}

export const DW_SPEC_25_16_13: GameSpec = {
  id: 'DW_25_16_13',
  title: 'Deuces Wild',
  handOrder: DW_ORDER,
  paytable: DW_PAYTABLE,
  evaluateHand: evaluateHandDW,
  bestHold: bestHoldDW_25_16_13,
  notes: 'Deuces are wild. Paytable 25/16/13/4/3/2.',
  coaching: 'on'
}

