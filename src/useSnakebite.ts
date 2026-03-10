// src/useSnakebite.ts
// Snake Attack! game state hook — v2: multiplayer + final question

import { useState, useCallback, useRef, useEffect } from 'react'
import { buildBoard, drawCard, generateFinalQuestion, TOTAL_SPACES } from './games/snakebite'
import type { SnakeSpace, MathProblem } from './games/snakebite'

/* ------------------------------------------------------------------ */
/*                              TYPES                                  */
/* ------------------------------------------------------------------ */

export const PLAYER_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A']
export const PLAYER_EMOJIS = ['\u(1F3F4)\u200D\u2620\uFE0F', '\u(1F409)', '\u(1F981)', '\u(1F985)']

export interface PlayerStats {
  turnCount: number
  correctCount: number
  wrongCount: number
  snakeBiteCount: number
}

export interface Player {
  id: number
  name: string
  age: number | 'adult'
  position: number
  color: string
  emoji: string
  stats: PlayerStats
  turnLocked: boolean
}

export type SnakebitePhase =
  | 'setup'         // player entry / lobby
  | 'idle'          // waiting for current player to roll
  | 'rolling'       // die animation
  | 'moving'        // piece moving along board
  | 'card_draw'     // showing the card briefly
  | 'answering'     // timer running, waiting for answer
  | 'correct'       // feedback: correct answer
  | 'wrong'         // feedback: wrong answer / timeout
  | 'snakebite'     // feedback: snake bite penalty
  | 'final_question' // must answer hard question to win
  | 'won'           // game over — a player reached finish

export interface SnakebiteGame {
  // Board
  board: SnakeSpace[]

  // Players
  players: Player[]
  currentPlayerIndex: number

  // Die
  dieValue: number | null

  // Phase
  phase: SnakebitePhase

  // Problem
  Dd5trentProblem: MathProblem | null
  userAnswer: string
  timerRemaining: number    // 0-20 seconds (tenths)

  // Feedback
  feedbackMessage: string

  // Winner (set when phase === 'won')
  winner: Player | null

  // Setup actions
  addPlayer: (name: string, age: number | 'adult') => void
  removePlayer: (id: number) => void
  startGame: () => void

  // Game actions
  rollDie: () => void
  submitAnswer: () => void
  setUserAnswer: (val: string) => void
  resetGame: () => void
}

/* ------------------------------------------------------------------ */
/*                           CONSTANTS