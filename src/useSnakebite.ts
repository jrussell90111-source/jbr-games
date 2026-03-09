// src/useSnakebite.ts
// Snake Attack! game state hook

import { useState, useCallback, useRef, useEffect } from 'react'
import { buildBoard, drawCard, TOTAL_SPACES } from './games/snakebite'
import type { SnakeSpace, MathProblem } from './games/snakebite'

/* ------------------------------------------------------------------ */
/*                              TYPES                                  */
/* ------------------------------------------------------------------ */

export type SnakebitePhase =
  | 'idle'        // waiting for player to roll
  | 'rolling'     // die animation
  | 'moving'      // piece moving along board
  | 'card_draw'   // showing the card briefly
  | 'answering'   // timer running, waiting for answer
  | 'correct'     // feedback: correct answer
  | 'wrong'       // feedback: wrong answer / timeout
  | 'snakebite'   // feedback: snake bite penalty
  | 'won'         // game over — player reached finish

export interface SnakebiteGame {
  // Board
  board: SnakeSpace[]
  playerPosition: number

  // Die
  dieValue: number | null

  // Phase
  phase: SnakebitePhase

  // Problem
  currentProblem: MathProblem | null
  userAnswer: string
  timerRemaining: number   // 0-20 seconds (tenths)

  // Stats
  turnCount: number
  correctCount: number
  wrongCount: number
  snakeBiteCount: number

  // Flags
  turnLocked: boolean      // snake bite penalty — skip next turn
  feedbackMessage: string

  // Actions
  rollDie: () => void
  submitAnswer: () => void
  setUserAnswer: (val: string) => void
  resetGame: () => void
}

/* ------------------------------------------------------------------ */
/*                           CONSTANTS                                 */
/* ------------------------------------------------------------------ */

const TIMER_SECONDS = 20
const ROLL_DELAY = 600       // ms — die spin animation
const MOVE_DELAY = 400       // ms — per-space movement
const CARD_SHOW_DELAY = 1200 // ms — show card before input
const FEEDBACK_DELAY = 1500  // ms — show correct/wrong feedback
const SNAKEBITE_DELAY = 2000 // ms — show snake bite feedback

/* ------------------------------------------------------------------ */
/*                             HOOK                                    */
/* ------------------------------------------------------------------ */

export function useSnakebite(): SnakebiteGame {
  const [board] = useState<SnakeSpace[]>(() => buildBoard())
  const [playerPosition, setPlayerPosition] = useState(0)
  const [dieValue, setDieValue] = useState<number | null>(null)
  const [phase, setPhase] = useState<SnakebitePhase>('idle')
  const [currentProblem, setCurrentProblem] = useState<MathProblem | null>(null)
  const [userAnswer, setUserAnswer] = useState('')
  const [timerRemaining, setTimerRemaining] = useState(TIMER_SECONDS * 10) // tenths of second
  const [turnCount, setTurnCount] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [snakeBiteCount, setSnakeBiteCount] = useState(0)
  const [turnLocked, setTurnLocked] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState('')

  // Refs for timer cleanup
  const timerRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)

  // Cleanup helper
  const clearAllTimers = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => () => clearAllTimers(), [clearAllTimers])

  /* ---------- Timer for answering phase ---------- */

  const autoSubmitRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (phase !== 'answering') {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    setTimerRemaining(TIMER_SECONDS * 10)

    timerRef.current = window.setInterval(() => {
      setTimerRemaining(prev => {
        if (prev <= 1) {
          // Time's up — auto-submit as wrong
          if (timerRef.current !== null) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
          // Defer the state transition to avoid update-during-render
          setTimeout(() => autoSubmitRef.current(), 0)
          return 0
        }
        return prev - 1
      })
    }, 100)

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [phase])

  /* ---------- Move back helper ---------- */

  const moveBack = useCallback((spaces: number) => {
    setPlayerPosition(prev => Math.max(0, prev - spaces))
  }, [])

  /* ---------- Transition to next turn ---------- */

  const finishTurn = useCallback(() => {
    setCurrentProblem(null)
    setUserAnswer('')
    setFeedbackMessage('')
    setPhase('idle')
  }, [])

  /* ---------- Handle answer submission ---------- */

  const handleSubmission = useCallback((timedOut: boolean) => {
    clearAllTimers()

    if (!currentProblem) { finishTurn(); return }

    if (currentProblem.isSnakeBite) {
      // Should not happen — snake bites are handled in card_draw
      finishTurn()
      return
    }

    const parsed = parseInt(userAnswer, 10)
    const isCorrect = !timedOut && !isNaN(parsed) && parsed === currentProblem.answer

    if (isCorrect) {
      setCorrectCount(c => c + 1)
      setFeedbackMessage('Correct!')
      setPhase('correct')

      timeoutRef.current = window.setTimeout(() => {
        finishTurn()
      }, FEEDBACK_DELAY)
    } else {
      setWrongCount(w => w + 1)
      setFeedbackMessage(
        timedOut
          ? `Time\u2019s up! Answer: ${currentProblem.answer}`
          : `Wrong! Answer: ${currentProblem.answer}`
      )
      setPhase('wrong')
      moveBack(1)

      timeoutRef.current = window.setTimeout(() => {
        finishTurn()
      }, FEEDBACK_DELAY)
    }
  }, [clearAllTimers, currentProblem, userAnswer, finishTurn, moveBack])

  // Keep autoSubmitRef current
  autoSubmitRef.current = () => handleSubmission(true)

  /* ---------- Submit answer (user clicks or presses Enter) ---------- */

  const submitAnswer = useCallback(() => {
    if (phase !== 'answering') return
    handleSubmission(false)
  }, [phase, handleSubmission])

  /* ---------- Handle landing on a space ---------- */

  const handleLanding = useCallback((pos: number) => {
    const space = board[pos]
    if (!space) { finishTurn(); return }

    // Check for win
    if (pos >= TOTAL_SPACES - 1) {
      setPhase('won')
      return
    }

    // Safe space
    if (space.type === 'white' || space.type === 'start' || space.type === 'finish') {
      finishTurn()
      return
    }

    // Brown or red — draw a card
    const deck = space.type as 'brown' | 'red'
    const problem = drawCard(deck)
    setCurrentProblem(problem)

    if (problem.isSnakeBite) {
      // Snake Bite!
      setSnakeBiteCount(s => s + 1)
      setFeedbackMessage('SNAKE BITE! Go back 3 spaces and lose your turn!')
      setPhase('snakebite')
      moveBack(3)
      setTurnLocked(true)

      timeoutRef.current = window.setTimeout(() => {
        setTurnLocked(false)
        finishTurn()
      }, SNAKEBITE_DELAY)
    } else {
      // Show the problem card, then transition to answering
      setPhase('card_draw')
      setUserAnswer('')

      timeoutRef.current = window.setTimeout(() => {
        setPhase('answering')
      }, CARD_SHOW_DELAY)
    }
  }, [board, finishTurn, moveBack])

  /* ---------- Roll the die ---------- */

  const rollDie = useCallback(() => {
    if (phase !== 'idle') return

    // If turn is locked from snake bite, skip
    if (turnLocked) {
      setFeedbackMessage('Turn skipped — snake bite penalty!')
      setTurnLocked(false)
      setPhase('wrong')
      timeoutRef.current = window.setTimeout(() => {
        finishTurn()
      }, FEEDBACK_DELAY)
      return
    }

    setTurnCount(t => t + 1)
    const roll = Math.floor(Math.random() * 6) + 1
    setDieValue(roll)
    setPhase('rolling')

    // After roll animation, start moving
    timeoutRef.current = window.setTimeout(() => {
      setPhase('moving')

      // Calculate new position (capped at last space)
      const newPos = Math.min(playerPosition + roll, TOTAL_SPACES - 1)

      // Animate step by step
      let step = 0
      const steps = newPos - playerPosition

      if (steps <= 0) {
        setPhase('moving')
        handleLanding(newPos)
        return
      }

      const stepInterval = window.setInterval(() => {
        step++
        setPlayerPosition(prev => prev + 1)

        if (step >= steps) {
          clearInterval(stepInterval)
          // Small delay then handle landing
          setTimeout(() => handleLanding(newPos), 200)
        }
      }, MOVE_DELAY)

      // Store for cleanup
      timerRef.current = stepInterval as unknown as number
    }, ROLL_DELAY)
  }, [phase, turnLocked, playerPosition, handleLanding, finishTurn, clearAllTimers])

  /* ---------- Reset game ---------- */

  const resetGame = useCallback(() => {
    clearAllTimers()
    setPlayerPosition(0)
    setDieValue(null)
    setPhase('idle')
    setCurrentProblem(null)
    setUserAnswer('')
    setTimerRemaining(TIMER_SECONDS * 10)
    setTurnCount(0)
    setCorrectCount(0)
    setWrongCount(0)
    setSnakeBiteCount(0)
    setTurnLocked(false)
    setFeedbackMessage('')
  }, [clearAllTimers])

  return {
    board,
    playerPosition,
    dieValue,
    phase,
    currentProblem,
    userAnswer,
    timerRemaining,
    turnCount,
    correctCount,
    wrongCount,
    snakeBiteCount,
    turnLocked,
    feedbackMessage,
    rollDie,
    submitAnswer,
    setUserAnswer,
    resetGame,
  }
}
