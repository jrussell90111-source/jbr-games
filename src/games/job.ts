// src/games/job.ts
import type { Card, Rank } from '../cards';
import type { GameSpec, HandName, HandOutcome, Paytable } from './spec';

// 8/5 JoB paytable
export const PAYTABLE_8_5: Paytable = {
  'Royal Flush':[250,500,750,1000,4000],
  'Straight Flush':[50,100,150,200,250],
  'Four of a Kind':[25,50,75,100,125],
  'Full House':[8,16,24,32,40],
  'Flush':[5,10,15,20,25],
  'Straight':[4,8,12,16,20],
  'Three of a Kind':[3,6,9,12,15],
  'Two Pair':[2,4,6,8,10],
  'Jacks or Better':[1,2,3,4,5],
  // Unused in JoB (type parity only)
  'Natural Royal Flush':[250,500,750,1000,4000],
  'Wild Royal Flush':[0,0,0,0,0],
  'Five of a Kind':[0,0,0,0,0],
  'Four Deuces':[0,0,0,0,0],
};

const SUITS = ['♠','♥','♦','♣'] as const;
const HIGHS = new Set<Rank>(['J','Q','K','A']);
const ROYAL_SET = new Set<Rank>(['10','J','Q','K','A']);
const V: Record<Rank, number> = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14
};

// ---------- Utilities ----------
const idxs = (cards: Card[], pred: (c: Card)=>boolean) =>
  cards.map((c,i)=>pred(c)?i:-1).filter(i=>i>=0);

const byRank = (cards: Card[]) => {
  const m = new Map<Rank, number>();
  for (const c of cards) m.set(c.rank, (m.get(c.rank) ?? 0) + 1);
  return m;
};
const bySuit = (cards: Card[]) => {
  const m = new Map<Card['suit'], number[]>();
  cards.forEach((c,i)=>{
    const arr = m.get(c.suit) ?? [];
    arr.push(i);
    m.set(c.suit, arr);
  });
  return m;
};

const isFlush = (cards: Card[]) => cards.every(c => c.suit === cards[0].suit);
function isStraight(vals: number[]) {
  const s = [...new Set(vals)].sort((a,b)=>a-b);
  if (s.length !== 5) return false;
  if (s[4]-s[0] === 4) return true;
  // wheel A-2-3-4-5
  const wheel = [14,5,4,3,2].sort((a,b)=>a-b);
  return s.join(',') === wheel.join(',');
}
const isRoyal = (cards: Card[]) => {
  const rs = new Set<Rank>(cards.map(c=>c.rank));
  const need: Rank[] = ['10','J','Q','K','A'];
  return need.every(r => rs.has(r));
};

const mask = (keep: number[]) => {
  const m = [false,false,false,false,false];
  keep.forEach(i => m[i] = true);
  return m;
};

function chooseK<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, pick: T[]) => {
    if (pick.length === k) { out.push(pick.slice()); return; }
    for (let i=start; i<arr.length; i++) rec(i+1, pick.concat(arr[i]));
  };
  rec(0, []);
  return out;
}

function uniqNums(a: number[]) {
  return Array.from(new Set(a));
}

// ---------- Evaluator (returns a HandOutcome STRING) ----------
function evaluateHandJOB(cards: Card[]): HandOutcome {
  const vals = cards.map(c=>V[c.rank]);
  const flush = isFlush(cards);
  const straight = isStraight(vals);

  if (flush && isRoyal(cards)) return 'Royal Flush';
  if (flush && straight) return 'Straight Flush';

  const counts = [...byRank(cards).values()].sort((a,b)=>b-a);
  if (counts[0] === 4) return 'Four of a Kind';
  if (counts[0] === 3 && counts[1] === 2) return 'Full House';
  if (flush) return 'Flush';
  if (straight) return 'Straight';
  if (counts[0] === 3) return 'Three of a Kind';
  if (counts[0] === 2 && counts[1] === 2) return 'Two Pair';

  if (counts[0] === 2) {
    const m = byRank(cards);
    for (const [r, n] of m) if (n === 2 && HIGHS.has(r)) return 'Jacks or Better';
  }
  return 'Nothing';
}

// ---------- Pattern finders for JoB coach ----------

// 4 to a Royal (same suit, subset of ROYAL, size 4)
function find4ToRoyal(cards: Card[]): number[] | null {
  for (const s of SUITS) {
    const idx = idxs(cards, c => c.suit === s && ROYAL_SET.has(c.rank));
    if (idx.length >= 4) {
      return idx.slice(0,4);
    }
  }
  return null;
}

// 3 to a Royal (same suit, subset of ROYAL, size >=3) -> choose best 3 (highest ranks)
function find3ToRoyal(cards: Card[]): number[] | null {
  for (const s of SUITS) {
    const suited = idxs(cards, c => c.suit === s && ROYAL_SET.has(c.rank));
    if (suited.length >= 3) {
      const sorted = suited.sort((a,b)=>V[cards[b].rank]-V[cards[a].rank]); // high-to-low
      return sorted.slice(0,3);
    }
  }
  return null;
}

// 4 to a Flush (exactly 4 of same suit)
function find4ToFlush(cards: Card[]): number[] | null {
  const suitMap = bySuit(cards);
  for (const s of SUITS) {
    const list = suitMap.get(s) ?? [];
    if (list.length === 4) return list.slice();
  }
  return null;
}

// 4 to a Straight Flush (any suit where 4 ranks fit in a 5-long window)
function find4ToStraightFlush(cards: Card[]): number[] | null {
  const suitMap = bySuit(cards);
  for (const s of SUITS) {
    const list = (suitMap.get(s) ?? []);
    if (list.length < 4) continue;
    const vals = list.map(i=>V[cards[i].rank]);
    for (let start=2; start<=10; start++) {
      const window = new Set([start,start+1,start+2,start+3,start+4]);
      const fit = list.filter(i => window.has(V[cards[i].rank]));
      if (fit.length >= 4) return fit.slice(0,4);
    }
    // wheel A-5
    const wheel = new Set([14,5,4,3,2]);
    const fitWheel = list.filter(i => wheel.has(V[cards[i].rank]));
    if (fitWheel.length >= 4) return fitWheel.slice(0,4);
  }
  return null;
}

// 4 to an OUTSIDE straight with X high cards (X in [0..2])
function find4ToOutsideStraight_withHighs(cards: Card[], maxHighs: number): number[] | null {
  const allIdx = [0,1,2,3,4];
  for (const combo of chooseK(allIdx, 4)) {
    const ranks = combo.map(i=>V[cards[i].rank]).sort((a,b)=>a-b);
    const uniq = uniqNums(ranks);
    if (uniq.length !== 4) continue;
    if (uniq[3] - uniq[0] === 3 &&
        uniq[1]-uniq[0]===1 && uniq[2]-uniq[1]===1 && uniq[3]-uniq[2]===1) {
      const highs = combo.filter(i => HIGHS.has(cards[i].rank)).length;
      if (highs <= maxHighs) return combo;
    }
  }
  return null;
}

// 4 to an INSIDE straight (gutshot) with N highs (N = 4 or 3)
function find4ToInsideStraight_withHighs(cards: Card[], highsNeeded: number): number[] | null {
  const allIdx = [0,1,2,3,4];
  for (const combo of chooseK(allIdx, 4)) {
    const vals = combo.map(i=>V[cards[i].rank]).sort((a,b)=>a-b);
    const uniq = uniqNums(vals);
    if (uniq.length !== 4) continue;
    const span = uniq[3] - uniq[0];
    if (span !== 4) continue; // must cover 5 ranks
    const highs = combo.filter(i => HIGHS.has(cards[i].rank)).length;
    const have = new Set(uniq);
    const missing = [uniq[0]+1, uniq[0]+2, uniq[0]+3].filter(v => !have.has(v));
    if (missing.length === 1) {
      if (highs === highsNeeded) return combo;
    }
  }
  return null;
}

// 3 to a Straight Flush: classify by gaps (exclude 3-to-Royal)
// gaps = (max - min) - 2 ; Type1: 0 gaps (consecutive), Type2: 1 gap, Type3: 2+ gaps
function find3ToStraightFlush_Type(cards: Card[], type: 1|2|3): number[] | null {
  for (const s of SUITS) {
    const suitedIdx = idxs(cards, c => c.suit === s);
    if (suitedIdx.length < 3) continue;
    for (const triple of chooseK(suitedIdx, 3)) {
      const ranks = triple.map(i=>cards[i].rank);
      // skip if it's a 3-to-ROYAL (handled earlier)
      const royalCount = ranks.filter(r => ROYAL_SET.has(r)).length;
      if (royalCount === 3) continue;

      const vs = triple.map(i=>V[cards[i].rank]).sort((a,b)=>a-b);
      const gaps = (vs[2] - vs[0]) - 2;
      const t = gaps <= 0 ? 1 : (gaps === 1 ? 2 : 3);
      if (t === type) return triple;
    }
  }
  return null;
}

// Specific suited pairs
const findSuitedPair = (cards: Card[], a: Rank, b: Rank): number[] | null => {
  for (const s of SUITS) {
    const ia = idxs(cards, c => c.rank === a && c.suit === s)[0];
    const ib = idxs(cards, c => c.rank === b && c.suit === s)[0];
    if (ia !== undefined && ib !== undefined) return [ia, ib];
  }
  return null;
};

// Unsuited sets/pairs of highs
function findUnsuitedSet(cards: Card[], ranksNeeded: Rank[]): number[] | null {
  const pick: number[] = [];
  for (const r of ranksNeeded) {
    const all = idxs(cards, c => c.rank === r);
    let chosen: number | undefined;
    for (const i of all) {
      if (!pick.some(pj => cards[pj].suit === cards[i].suit)) { chosen = i; break; }
    }
    if (chosen === undefined) return null;
    pick.push(chosen);
  }
  return pick.length === ranksNeeded.length ? pick : null;
}

function findTwoUnsuitedHighs_K_high(cards: Card[]): number[] | null {
  // K with Q or J, unsuited
  const pairs: [Rank,Rank][] = [['K','Q'], ['K','J']];
  for (const [a,b] of pairs) {
    for (const ia of idxs(cards, c => c.rank === a)) {
      for (const ib of idxs(cards, c => c.rank === b)) {
        if (ia >= 0 && ib >= 0 && cards[ia].suit !== cards[ib].suit) return [ia, ib];
      }
    }
  }
  return null;
}
function findTwoUnsuitedHighs_A_high(cards: Card[]): number[] | null {
  // A with K/Q/J, unsuited
  const pairs: [Rank,Rank][] = [['A','K'], ['A','Q'], ['A','J']];
  for (const [a,b] of pairs) {
    for (const ia of idxs(cards, c => c.rank === a)) {
      for (const ib of idxs(cards, c => c.rank === b)) {
        if (ia >= 0 && ib >= 0 && cards[ia].suit !== cards[ib].suit) return [ia, ib];
      }
    }
  }
  return null;
}

// Single high preference order J > Q > K > A
function findSingleHigh(cards: Card[]): number[] | null {
  for (const r of ['J','Q','K','A'] as Rank[]) {
    const i = idxs(cards, c => c.rank === r)[0];
    if (i !== undefined) return [i];
  }
  return null;
}

// ---------- Coach implementing the provided priority list ----------
function bestHoldMaskJOB(cards: Card[]): boolean[] {
  const rankMap = byRank(cards);
  const counts = [...rankMap.values()].sort((a,b)=>b-a);
  const vals = cards.map(c=>V[c.rank]);
  const flush = isFlush(cards);
  const straight = isStraight(vals);

  const keepAll = [true,true,true,true,true];

  // 1 Royal pat
  if (flush && isRoyal(cards)) return keepAll;
  // 2 Straight Flush pat
  if (flush && straight) return keepAll;
  // 3 Quads pat
  if (counts[0] === 4) return keepAll;
  // 4 4 to a Royal
  {
    const k = find4ToRoyal(cards);
    if (k) return mask(k);
  }
  // 5 Full House pat
  if (counts[0] === 3 && counts[1] === 2) return keepAll;
  // 6 Flush pat
  if (flush) return keepAll;
  // 7 3 of a kind (keep trips, draw 2)
  if (counts[0] === 3) {
    const tripRank = [...rankMap.entries()].find(([,n]) => n === 3)![0];
    return mask(idxs(cards, c => c.rank === tripRank));
  }
  // 8 Straight pat
  if (straight) return keepAll;
  // 9 4 to a Straight Flush
  {
    const k = find4ToStraightFlush(cards);
    if (k) return mask(k);
  }
  // 10 Two Pair (keep both)
  if (counts[0] === 2 && counts[1] === 2) {
    const pairRanks = [...rankMap.entries()].filter(([,n])=>n===2).map(([r])=>r);
    return mask(
      idxs(cards, c => c.rank === pairRanks[0]).concat(
      idxs(cards, c => c.rank === pairRanks[1]))
    );
  }
  // 11 High pair (JJ+)
  {
    const pr = [...rankMap.entries()].find(([r,n]) => n===2 && HIGHS.has(r))?.[0];
    if (pr) return mask(idxs(cards, c => c.rank === pr));
  }
  // 12 3 to a Royal
  {
    const k = find3ToRoyal(cards);
    if (k) return mask(k);
  }
  // 13 4 to a Flush
  {
    const k = find4ToFlush(cards);
    if (k) return mask(k);
  }
  // 14 Unsuited TJQK
  {
    const need: Rank[] = ['10','J','Q','K'];
    const hasAll = need.every(r => (rankMap.get(r) ?? 0) >= 1);
    if (hasAll) {
      const pick = findUnsuitedSet(cards, need);
      if (pick) return mask(pick);
    }
  }
  // 15 Low pair
  {
    const lp = [...rankMap.entries()].find(([r,n]) => n===2 && !HIGHS.has(r))?.[0];
    if (lp) return mask(idxs(cards, c => c.rank === lp));
  }
  // 16 4 to an outside straight with 0-2 high cards
  {
    const k = find4ToOutsideStraight_withHighs(cards, 2);
    if (k) return mask(k);
  }
  // 17 3 to a Straight Flush (Type 1: 0 gaps, non-royal)
  {
    const k = find3ToStraightFlush_Type(cards, 1);
    if (k) return mask(k);
  }
  // 18 Suited QJ
  {
    const k = findSuitedPair(cards, 'Q','J');
    if (k) return mask(k);
  }
  // 19 4 to an inside straight, 4 high cards
  {
    const k = find4ToInsideStraight_withHighs(cards, 4);
    if (k) return mask(k);
  }
  // 20 Suited KQ or KJ
  {
    const k1 = findSuitedPair(cards, 'K','Q');
    if (k1) return mask(k1);
    const k2 = findSuitedPair(cards, 'K','J');
    if (k2) return mask(k2);
  }
  // 21 Suited AK, AQ, or AJ
  {
    const k =
      findSuitedPair(cards, 'A','K') ||
      findSuitedPair(cards, 'A','Q') ||
      findSuitedPair(cards, 'A','J');
    if (k) return mask(k);
  }
  // 22 4 to an inside straight, 3 high cards
  {
    const k = find4ToInsideStraight_withHighs(cards, 3);
    if (k) return mask(k);
  }
  // 23 3 to a Straight Flush (Type 2: 1 gap, non-royal)
  {
    const k = find3ToStraightFlush_Type(cards, 2);
    if (k) return mask(k);
  }
  // 24 Unsuited JQK
  {
    const need: Rank[] = ['J','Q','K'];
    const hasAll = need.every(r => (rankMap.get(r) ?? 0) >= 1);
    if (hasAll) {
      const pick = findUnsuitedSet(cards, need);
      if (pick) return mask(pick);
    }
  }
  // 25 Unsuited JQ
  {
    const pick = findUnsuitedSet(cards, ['J','Q']);
    if (pick) return mask(pick);
  }
  // 26 Suited TJ
  {
    const k = findSuitedPair(cards, '10','J');
    if (k) return mask(k);
  }
  // 27 Two unsuited high cards, king highest (KQ or KJ, unsuited)
  {
    const k = findTwoUnsuitedHighs_K_high(cards);
    if (k) return mask(k);
  }
  // 28 Suited TQ
  {
    const k = findSuitedPair(cards, '10','Q');
    if (k) return mask(k);
  }
  // 29 Two unsuited high cards, ace highest (AK/AQ/AJ unsuited)
  {
    const k = findTwoUnsuitedHighs_A_high(cards);
    if (k) return mask(k);
  }
  // 30 J only
  {
    const k = findSingleHigh(cards);
    if (k && cards[k[0]].rank === 'J') return mask(k);
  }
  // 31 Suited TK
  {
    const k = findSuitedPair(cards, '10','K');
    if (k) return mask(k);
  }
  // 32 Q only
  {
    const i = idxs(cards, c => c.rank === 'Q')[0];
    if (i !== undefined) return mask([i]);
  }
  // 33 K only
  {
    const i = idxs(cards, c => c.rank === 'K')[0];
    if (i !== undefined) return mask([i]);
  }
  // 34 A only
  {
    const i = idxs(cards, c => c.rank === 'A')[0];
    if (i !== undefined) return mask([i]);
  }
  // 35 3 to a Straight Flush (Type 3: 2+ gaps, non-royal)
  {
    const k = find3ToStraightFlush_Type(cards, 3);
    if (k) return mask(k);
  }
  // 36 Garbage: hold nothing
  return [false,false,false,false,false];
}

export const JOB_SPEC_8_5: GameSpec = {
  id: 'job_8_5',
  title: 'Jacks or Better (8/5)',
  handOrder: [
    'Royal Flush','Straight Flush','Four of a Kind','Full House',
    'Flush','Straight','Three of a Kind','Two Pair','Jacks or Better'
  ],
  paytable: PAYTABLE_8_5,
  evaluateHand: evaluateHandJOB,
  bestHold: (cards: Card[]) => bestHoldMaskJOB(cards),
};

