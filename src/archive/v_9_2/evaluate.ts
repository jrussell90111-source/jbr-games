import type { Card, Rank } from './cards'

export type HandRank =
  | 'Royal Flush'
  | 'Straight Flush'
  | 'Four of a Kind'
  | 'Full House'
  | 'Flush'
  | 'Straight'
  | 'Three of a Kind'
  | 'Two Pair'
  | 'Jacks or Better'
  | 'Nothing'

const RANK_ORDER: Rank[] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
const rankValue = (r: Rank) => RANK_ORDER.indexOf(r)

export function evaluateHand(hand: Card[]): HandRank {
  const ranks = hand.map(c => c.rank).sort((a,b)=>rankValue(a)-rankValue(b))
  const suits = hand.map(c => c.suit)
  const counts = countBy(ranks)
  const isFlush = suits.every(s => s === suits[0])
  const isStraight = checkStraight(ranks)

  if (isFlush && isStraight && ranks[0]==='10' && ranks[1]==='J' && ranks[2]==='Q' && ranks[3]==='K' && ranks[4]==='A')
    return 'Royal Flush'
  if (isFlush && isStraight) return 'Straight Flush'
  if (hasOfAKind(counts, 4)) return 'Four of a Kind'
  if (hasFullHouse(counts)) return 'Full House'
  if (isFlush) return 'Flush'
  if (isStraight) return 'Straight'
  if (hasOfAKind(counts, 3)) return 'Three of a Kind'
  if (hasTwoPair(counts)) return 'Two Pair'
  if (hasJacksOrBetter(counts)) return 'Jacks or Better'
  return 'Nothing'
}

function countBy(arr: Rank[]) {
  const m = new Map<Rank, number>()
  for (const r of arr) m.set(r, (m.get(r) ?? 0) + 1)
  return m
}
function hasOfAKind(m: Map<Rank, number>, n: number) {
  for (const v of m.values()) if (v===n) return true
  return false
}
function hasTwoPair(m: Map<Rank, number>) {
  let pairs = 0
  for (const v of m.values()) if (v===2) pairs++
  return pairs===2
}
function hasFullHouse(m: Map<Rank, number>) {
  let has3 = false, has2 = false
  for (const v of m.values()) { if (v===3) has3=true; if (v===2) has2=true }
  return has3 && has2
}
function hasJacksOrBetter(m: Map<Rank, number>) {
  const winners: Rank[] = ['J','Q','K','A']
  for (const [r, v] of m) if (v===2 && winners.includes(r)) return true
  return false
}
function checkStraight(ranks: Rank[]) {
  const values = ranks.map(rankValue)
  // wheel straight sorted form: 2,3,4,5,A
  if (ranks.join(',') === ['2','3','4','5','A'].join(',')) return true
  for (let i=0;i<values.length-1;i++) if (values[i+1]-values[i]!==1) return false
  return true
}

