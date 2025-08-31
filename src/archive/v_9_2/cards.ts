export type Suit = '♣' | '♦' | '♥' | '♠'
export type Rank = 'A'|'K'|'Q'|'J'|'10'|'9'|'8'|'7'|'6'|'5'|'4'|'3'|'2'

export interface Card {
  id: string
  suit: Suit
  rank: Rank
}

const ranks: Rank[] = ['A','K','Q','J','10','9','8','7','6','5','4','3','2']
const suits: Suit[] = ['♣','♦','♥','♠']

export function newDeck(): Card[] {
  const deck: Card[] = []
  for (const s of suits) {
    for (const r of ranks) {
      deck.push({ id: `${r}${s}`, suit: s, rank: r })
    }
  }
  return shuffle(deck)
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

