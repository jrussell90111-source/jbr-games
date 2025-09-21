// src/games/roulette.ts
// Minimal, single-zero roulette helpers (1–36 + 0). Payouts: straight 35:1; even-money 1:1; dozens/columns 2:1.
export type RouletteBetType =
  | 'straight'   // pick an exact number (0..36)
  | 'red' | 'black'
  | 'even' | 'odd'
  | 'low'  | 'high'       // 1-18, 19-36
  | 'dozen1' | 'dozen2' | 'dozen3'   // 1-12, 13-24, 25-36
  | 'column1' | 'column2' | 'column3';

export type RouletteColor = 'red' | 'black' | 'green';

export interface RouletteBet {
  type: RouletteBetType;
  amount: number;     // dollars/credits
  number?: number;    // required for 'straight'
}

export interface RouletteOutcome {
  number: number;     // 0..36
  color: RouletteColor;
}

const RED_SET = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function colorOf(n: number): RouletteColor {
  if (n === 0) return 'green';
  return RED_SET.has(n) ? 'red' : 'black';
}

function inDozen(n: number, d: 1|2|3) {
  if (n === 0) return false;
  if (d === 1) return n >= 1 && n <= 12;
  if (d === 2) return n >= 13 && n <= 24;
  return n >= 25 && n <= 36;
}
function inColumn(n: number, c: 1|2|3) {
  if (n === 0) return false;
  if (c === 1) return n % 3 === 1;
  if (c === 2) return n % 3 === 2;
  return n % 3 === 0;
}

/** Spin with injectable RNG for tests. Returns 0..36 */
export function spinWheel(rand: () => number = Math.random): RouletteOutcome {
  // 37 pockets (european single-zero)
  const i = Math.floor(rand() * 37); // 0..36
  return { number: i, color: colorOf(i) };
}

/** Return the full return (stake + winnings) for a single bet, given the outcome. 0 if it loses. */
export function settleBet(b: RouletteBet, o: RouletteOutcome): number {
  const n = o.number;
  switch (b.type) {
    case 'straight':
      if (typeof b.number !== 'number') return 0;
      return b.number === n ? b.amount * (35 + 1) : 0;

    case 'red':    return o.color === 'red'   ? b.amount * 2 : 0;
    case 'black':  return o.color === 'black' ? b.amount * 2 : 0;

    case 'even':   return n !== 0 && n % 2 === 0 ? b.amount * 2 : 0;
    case 'odd':    return n % 2 === 1 ? b.amount * 2 : 0;

    case 'low':    return n >= 1 && n <= 18 ? b.amount * 2 : 0;
    case 'high':   return n >= 19 && n <= 36 ? b.amount * 2 : 0;

    case 'dozen1': return inDozen(n, 1) ? b.amount * 3 : 0;
    case 'dozen2': return inDozen(n, 2) ? b.amount * 3 : 0;
    case 'dozen3': return inDozen(n, 3) ? b.amount * 3 : 0;

    case 'column1': return inColumn(n, 1) ? b.amount * 3 : 0;
    case 'column2': return inColumn(n, 2) ? b.amount * 3 : 0;
    case 'column3': return inColumn(n, 3) ? b.amount * 3 : 0;
  }
}

/** Net change for a list of bets (wins - total stake). Also returns total stake and total returned. */
export function settleAll(bets: RouletteBet[], outcome: RouletteOutcome) {
  const stake = bets.reduce((s, b) => s + b.amount, 0);
  const returned = bets.reduce((s, b) => s + settleBet(b, outcome), 0);
  const net = returned - stake;
  return { stake, returned, net };
}

