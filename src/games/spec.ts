// src/games/spec.ts
import type { Card } from '../cards'

/** Unified set of hand names across JoB, DW, and DDB */
export type HandName =
  // JoB core
  | 'Royal Flush' | 'Straight Flush' | 'Four of a Kind' | 'Full House'
  | 'Flush' | 'Straight' | 'Three of a Kind' | 'Two Pair' | 'Jacks or Better'
  // Deuces Wild extras
  | 'Natural Royal Flush' | 'Wild Royal Flush' | 'Five of a Kind' | 'Four Deuces'
  // DDB specialty quads
  | 'Four Aces w/2,3,4'
  | 'Four 2s,3s,4s w/A,2,3,4'
  | 'Four Aces'
  | 'Four 2s,3s,4s'
  | 'Four 5s thru Ks'

/** Evaluators can also return 'Nothing' for non-paying hands */
export type HandOutcome = HandName | 'Nothing'

/** Paytable rows for the current game only.
 *  Missing rows are treated as 0 payout by payoutFromSpec().
 */
export type Paytable = Partial<Record<HandName, [n1:number,n2:number,n3:number,n4:number,n5:number]>>

/** What a coach can return */
export type CoachReturn =
  | boolean[]
  | {
      mask: boolean[]
      reason?: string
      ruleId?: string
      /** Accept any of these as equally optimal */
      alts?: boolean[][]
    }

/** Contract each GameSpec implements */
export interface GameSpec {
  id: string
  title: string
  handOrder: HandName[]          // display order for the paytable
  paytable: Paytable             // only rows used by this game
  evaluateHand: (cards: Card[]) => HandOutcome
  bestHold: (cards: Card[]) => CoachReturn
  notes?: string
  coaching?: 'on' | 'off'
}

