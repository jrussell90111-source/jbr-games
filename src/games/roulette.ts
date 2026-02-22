// src/games/roulette.ts
// Roulette helpers and bet settlement — supports both single-zero (European)
// and double-zero (American) variants.
//
// AMERICAN NOTE: 00 is represented internally as the number 37.
//   colorOf(37) → 'green'
//   spinWheel38() picks from 0..37 (38 pockets)

export type RouletteOutsideType =
  | 'red' | 'black'
  | 'even' | 'odd'
  | 'low'  | 'high'
  | 'dozen1' | 'dozen2' | 'dozen3'
  | 'column1' | 'column2' | 'column3';

export type RouletteInsideType =
  | 'straight'                 // one number
  | 'split'                    // 2 numbers (adjacent)
  | 'street'                   // 3 numbers (row)
  | 'corner'                   // 4 numbers (square)
  | 'line'                     // 6 numbers (double street)
  | 'trio012' | 'trio023'      // 0-1-2 or 0-2-3 (street, 11:1) — European
  | 'first4'                   // 0-1-2-3 (4-number, 8:1) — European
  | 'topline';                 // 0-00-1-2-3 (5-number, 6:1) — American only

export type RouletteBetType = RouletteOutsideType | RouletteInsideType;
export type RouletteColor = 'red' | 'black' | 'green';

export interface RouletteBet {
  type: RouletteBetType;
  amount: number;
  // For inside bets we store the covered numbers.
  // 'straight' may use either 'number' or 'numbers:[n]'.
  number?: number;
  numbers?: number[];
}

export interface RouletteOutcome {
  number: number;     // 0..36 (European) or 0..37 where 37 = "00" (American)
  color: RouletteColor;
}

// ---- colors ----------------------------------------------------------

const RED_SET = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export function colorOf(n: number): RouletteColor {
  if (n === 0 || n === 37) return 'green';   // 0 and 00 (37) are both green
  return RED_SET.has(n) ? 'red' : 'black';
}

/** Display label — converts internal 37 back to "00" for UI */
export function labelOf(n: number): string {
  return n === 37 ? '00' : String(n);
}

// Outside vs inside helper
export function isOutside(t: RouletteBetType): boolean {
  return !(
    t === 'straight' || t === 'split' || t === 'street' || t === 'corner' ||
    t === 'line' || t === 'trio012' || t === 'trio023' || t === 'first4' ||
    t === 'topline'
  );
}

// ---- set membership helpers -----------------------------------------

function inDozen(n: number, d: 1|2|3) {
  if (n === 0 || n === 37) return false;  // 0 and 00 lose dozens
  if (d === 1) return n >= 1 && n <= 12;
  if (d === 2) return n >= 13 && n <= 24;
  return n >= 25 && n <= 36;
}
function inColumn(n: number, c: 1|2|3) {
  if (n === 0 || n === 37) return false;  // 0 and 00 lose columns
  if (c === 1) return n % 3 === 1;
  if (c === 2) return n % 3 === 2;
  return n % 3 === 0;
}

// ---- RNG -------------------------------------------------------------

/** Spin with injectable RNG for tests. Returns 0..36 (European, 37 pockets) */
export function spinWheel(rand: () => number = Math.random): RouletteOutcome {
  const i = Math.floor(rand() * 37);
  return { number: i, color: colorOf(i) };
}

/** American spin — returns 0..37 where 37 = "00" (38 pockets) */
export function spinWheel38(rand: () => number = Math.random): RouletteOutcome {
  const i = Math.floor(rand() * 38);
  return { number: i, color: colorOf(i) };
}

// ---- settlement ------------------------------------------------------

function has(list: number[] | undefined, n: number) {
  return Array.isArray(list) && list.includes(n);
}

/** Return full return (stake + winnings) for a single bet; 0 if it loses. */
export function settleBet(b: RouletteBet, o: RouletteOutcome): number {
  const n = o.number;

  // ----- Inside bets -----
  if (b.type === 'straight') {
    const want = (typeof b.number === 'number') ? [b.number] : (b.numbers ?? []);
    return has(want, n) ? b.amount * (35 + 1) : 0;
  }
  if (b.type === 'split')  return has(b.numbers, n) ? b.amount * (17 + 1) : 0;
  if (b.type === 'street') return has(b.numbers, n) ? b.amount * (11 + 1) : 0;
  if (b.type === 'corner') return has(b.numbers, n) ? b.amount * (8  + 1) : 0;
  if (b.type === 'line')   return has(b.numbers, n) ? b.amount * (5  + 1) : 0;
  if (b.type === 'trio012' || b.type === 'trio023')
    return has(b.numbers, n) ? b.amount * (11 + 1) : 0;    // 0-1-2 or 0-2-3
  if (b.type === 'first4')
    return has(b.numbers, n) ? b.amount * (8 + 1) : 0;     // 0-1-2-3
  if (b.type === 'topline')
    return has(b.numbers, n) ? b.amount * (6 + 1) : 0;     // 0-00-1-2-3 (American)

  // ----- Outside bets -----
  switch (b.type) {
    case 'red':    return o.color === 'red'   ? b.amount * 2 : 0;
    case 'black':  return o.color === 'black' ? b.amount * 2 : 0;
    // 0 and 00 (37) both lose even/odd/low/high
    case 'even':   return n !== 0 && n !== 37 && n % 2 === 0 ? b.amount * 2 : 0;
    case 'odd':    return n !== 0 && n !== 37 && n % 2 === 1 ? b.amount * 2 : 0;
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

/** Net change for a list of bets (wins - total stake). */
export function settleAll(bets: RouletteBet[], outcome: RouletteOutcome) {
  const stake = bets.reduce((s, b) => s + b.amount, 0);
  const returned = bets.reduce((s, b) => s + settleBet(b, outcome), 0);
  const net = returned - stake;
  return { stake, returned, net };
}

