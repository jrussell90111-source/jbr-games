// src/games/spec.ts
import type { Card } from '../cards'

export type HandName =
  | 'Royal Flush' | 'Straight Flush' | 'Four of a Kind' | 'Full House'
  | 'Flush' | 'Straight' | 'Three of a Kind' | 'Two Pair' | 'Jacks or Better'
  | 'Natural Royal Flush' | 'Wild Royal Flush' | 'Five of a Kind' | 'Four Deuces';

// Evaluators may return a paytable hand OR "Nothing"
export type HandOutcome = HandName | 'Nothing';

export type Paytable = Record<HandName, [n1:number,n2:number,n3:number,n4:number,n5:number]>;

// ⬇️ NEW: `alts?: boolean[][]` lets a spec list other masks that are equally optimal
export type CoachReturn =
  | boolean[]
  | { mask: boolean[]; reason?: string; ruleId?: string; alts?: boolean[][] };

// Back-compat alias used in useGame
export type BestHoldResult = CoachReturn;

export interface GameSpec {
  id: string;
  title: string;
  handOrder: HandName[];
  paytable: Paytable;
  // Allow plain outcome string or object { name }
  evaluateHand: (cards: Card[]) => HandOutcome | { name: HandOutcome; payoutIndex?: number };
  bestHold: (cards: Card[]) => CoachReturn;
  notes?: string;
  coaching?: 'on' | 'off';
}

