// src/games/snakebite.ts
// Snake Attack! — Created by Ricky Russell
// Types, board definition, and math problem generation

/* ------------------------------------------------------------------ */
/*                             TYPES                                   */
/* ------------------------------------------------------------------ */

export type SpaceType = 'start' | 'white' | 'brown' | 'red' | 'finish'

export interface SnakeSpace {
  id: number
  type: SpaceType
}

export interface MathProblem {
  text: string       // e.g. "17 × 3 ="
  answer: number     // correct answer
  isSnakeBite: boolean
}

/* ------------------------------------------------------------------ */
/*                         BOARD LAYOUT                                */
/* ------------------------------------------------------------------ */

// Deterministic color pattern for 40 spaces.
// Space 0 = START, Space 39 = FINISH
// ~13 brown, ~13 red, ~12 white (+ start + finish)
const SPACE_PATTERN: SpaceType[] = [
  'start',
  'white', 'brown', 'red',  'white', 'brown',
  'red',   'white', 'brown', 'white', 'red',
  'brown', 'white', 'red',  'brown', 'white',
  'red',   'brown', 'white', 'red',  'white',
  'brown', 'red',  'white', 'brown', 'white',
  'red',   'brown', 'white', 'red',  'brown',
  'white', 'red',  'brown', 'white', 'brown',
  'red',   'white', 'brown',
  'finish',
]

export function buildBoard(): SnakeSpace[] {
  return SPACE_PATTERN.map((type, i) => ({ id: i, type }))
}

export const TOTAL_SPACES = SPACE_PATTERN.length   // 40

/* ------------------------------------------------------------------ */
/*                      PROBLEM GENERATION                             */
/* ------------------------------------------------------------------ */

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Snake Bite probability: ~4 in 60 draws ≈ 6.67%
const SNAKE_BITE_CHANCE = 4 / 60

export function drawCard(deck: 'brown' | 'red'): MathProblem {
  // Check for snake bite first
  if (Math.random() < SNAKE_BITE_CHANCE) {
    return { text: 'SNAKE BITE!', answer: 0, isSnakeBite: true }
  }
  return deck === 'brown' ? generateEasyProblem() : generateHardProblem()
}

/* ---------- Easy Deck (brown cards) ---------- */

function generateEasyProblem(): MathProblem {
  const type = randInt(0, 2)

  if (type === 0) {
    // Addition: a + b  (1-9)
    const a = randInt(1, 9)
    const b = randInt(1, 9)
    return { text: `${a} + ${b} =`, answer: a + b, isSnakeBite: false }
  }
  if (type === 1) {
    // Subtraction: a - b  (a > b, both 1-9)
    let a = randInt(2, 9)
    let b = randInt(1, a - 1)
    return { text: `${a} - ${b} =`, answer: a - b, isSnakeBite: false }
  }
  // Multiplication: a × b  (2-9)
  const a = randInt(2, 9)
  const b = randInt(2, 9)
  return { text: `${a} \u00d7 ${b} =`, answer: a * b, isSnakeBite: false }
}

/* ---------- Hard Deck (red cards) ---------- */

function generateHardProblem(): MathProblem {
  const type = randInt(0, 2)

  if (type === 0) {
    // Double-digit × single-digit
    const a = randInt(10, 50)
    const b = randInt(2, 9)
    return { text: `${a} \u00d7 ${b} =`, answer: a * b, isSnakeBite: false }
  }
  if (type === 1) {
    // Division with clean result
    const divisor = randInt(2, 9)
    const result = randInt(2, 12)
    const dividend = divisor * result
    return { text: `${dividend} \u00f7 ${divisor} =`, answer: result, isSnakeBite: false }
  }
  // Two-step: a + b × c  (order of operations)
  const a = randInt(1, 9)
  const b = randInt(2, 6)
  const c = randInt(2, 6)
  return { text: `${a} + ${b} \u00d7 ${c} =`, answer: a + b * c, isSnakeBite: false }
}
