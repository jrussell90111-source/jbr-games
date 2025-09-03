import type { HandRank } from './evaluate'

export const PAYTABLE_8_5: Record<HandRank, number[]> = {
  'Royal Flush':      [250, 500, 750, 1000, 4000], // 4000 on max bet (5 coins)
  'Straight Flush':   [50, 100, 150, 200, 250],
  'Four of a Kind':   [25, 50, 75, 100, 125],
  'Full House':       [8, 16, 24, 32, 40],        // 8/5 change
  'Flush':            [5, 10, 15, 20, 25],        // 8/5 change
  'Straight':         [4, 8, 12, 16, 20],
  'Three of a Kind':  [3, 6, 9, 12, 15],
  'Two Pair':         [2, 4, 6, 8, 10],
  'Jacks or Better':  [1, 2, 3, 4, 5],
  'Nothing':          [0, 0, 0, 0, 0],
}

export function payoutFor(rank: HandRank, bet: number) {
  const clamped = Math.min(Math.max(bet,1),5)
  return PAYTABLE_8_5[rank][clamped-1]
}

export type Paytable = Record<string, [number, number, number, number, number]>

export function payoutForRank(paytable: Paytable, rank: string, bet: number): number {
  const row = (paytable as any)[rank] as number[] | undefined
  if (!row) return 0
  const idx = Math.min(4, Math.max(0, bet - 1))
  return row[idx] ?? 0
}

