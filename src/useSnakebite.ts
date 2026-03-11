// src/useSnakebite.ts
// Snake Attack! game state hook — v2: multiplayer + final question

import { useState, useCallback, useRef, useEffect } from 'react'
import { buildBoard, drawCard, generateFinalQuestion, TOTAL_SPACES } from './games/snakebite'
import type { SnakeSpace, MathProblem } from './games/snakebite'

/* ------------------------------------------------------------------ */
/*                              TYPES                                  */
/* ------------------------------------------------------------------ */

export const PLAYER_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A']
export const PLAYER_EMOJIS = ['\u{1F3F4}\u200D\u2620\uFE0F', '\u{1F409}', '\u{1F981}', '\u{1F985}']

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
  currentProblem: MathProblem | null
  userAnswer: string
  timerRemaining: number   // 0-20 seconds (tenths)

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
/*                           CONSTANTS                                 */
/* ------------------------------------------------------------------ */

const TIMER_SECONDS = 20
const ROLL_DELAY = 600
const MOVE_DELAY = 400
const CARD_SHOW_DELAY = 1200
const FEEDBACK_DELAY = 1500
const SNAKEBITE_DELAY = 2000
const TURN_TRANSITION_DELAY = 800

/* ------------------------------------------------------------------ */
/*                             HOOK                                    */
/* ------------------------------------------------------------------ */

export function useSnakebite(): SnakebiteGame {
  const [board] = useState<SnakeSpace[]>(() => buildBoard())
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [dieValue, setDieValue] = useState<number | null>(null)
  const [phase, setPhase] = useState<SnakebitePhase>('setup')
  const [currentProblem, setCurrentProblem] = useState<MathProblem | null>(null)
  const [userAnswer, setUserAnswer] = useState('')
  const [timerRemaining, setTimerRemaining] = useState(TIMER_SECONDS * 10)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [winner, setWinner] = useState<Player | null>(null)

  // ID counter for players
  const nextIdRef = useRef(1)

  // Refs for timer cleanup
  const timerRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const moveIntervalRef = useRef<number | null>(null)

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
    if (moveIntervalRef.current !== null) {
      clearInterval(moveIntervalRef.current)
      moveIntervalRef.current = null
    }
  }, [])

  useEffect(() => () => clearAllTimers(), [clearAllTimers])

  /* ---------- Timer for answering / final_question phase ---------- */

  const autoSubmitRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (phase !== 'answering' && phase !== 'final_question') {
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
          if (timerRef.current !== null) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
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

  /* ---------- Player management (setup phase) ---------- */

  const addPlayer = useCallback((name: string, age: number | 'adult') => {
    if (phase !== 'setup') return
    setPlayers(prev => {
      if (prev.length >= 4) return prev
      const idx = prev.length
      const player: Player = {
        id: nextIdRef.current++,
        name,
        age,
        position: 0,
        color: PLAYER_COLORS[idx] || '#999',
        emoji: PLAYER_EMOJIS[idx] || '\u{1F3AE}',
        stats: { turnCount: 0, correctCount: 0, wrongCount: 0, snakeBiteCount: 0 },
        turnLocked: false,
      }
      return [...prev, player]
    })
  }, [phase])

  const removePlayer = useCallback((id: number) => {
    if (phase !== 'setup') return
    setPlayers(prev => {
      const filtered = prev.filter(p => p.id !== id)
      // Reassign colors and emojis based on new indices
      return filtered.map((p, i) => ({
        ...p,
        color: PLAYER_COLORS[i] || '#999',
        emoji: PLAYER_EMOJIS[i] || '\u{1F3AE}',
      }))
    })
  }, [phase])

  /* ---------- Start game ---------- */

  const startGame = useCallback(() => {
    if (phase !== 'setup' || players.length === 0) return

    // Sort by age — youngest first; 'adult' goes last
    const sorted = [...players].sort((a, b) => {
      const ageA = a.age === 'adult' ? 999 : a.age
      const ageB = b.age === 'adult' ? 999 : b.age
      return ageA - ageB
    })

    // Reassign colors/emojis after sort
    const withColors = sorted.map((p, i) => ({
      ...p,
      color: PLAYER_COLORS[i] || '#999',
      emoji: PLAYER_EMOJIS[i] || '\u{1F3AE}',
      position: 0,
      stats: { turnCount: 0, correctCount: 0, wrongCount: 0, snakeBiteCount: 0 },
      turnLocked: false,
    }))

    setPlayers(withColors)
    setCurrentPlayerIndex(0)
    setDieValue(null)
    setPhase('idle')
    setFeedbackMessage(`${withColors[0].name}'s turn!`)
  }, [phase, players])

  /* ---------- Advance to next player ---------- */

  const advanceTurn = useCallback(() => {
    setPlayers(prev => {
      const nextIdx = (currentPlayerIndex + 1) % prev.length
      setCurrentPlayerIndex(nextIdx)

      const nextPlayer = prev[nextIdx]
      if (nextPlayer.turnLocked) {
        // Skip this player's turn
        setFeedbackMessage(`${nextPlayer.name}'s turn skipped \u2014 snake bite penalty!`)
        setPhase('wrong')

        // Unlock the player and advance again after feedback
        const updated = [...prev]
        updated[nextIdx] = { ...updated[nextIdx], turnLocked: false }

        timeoutRef.current = window.setTimeout(() => {
          setPlayers(latest => {
            const afterIdx = (nextIdx + 1) % latest.length
            setCurrentPlayerIndex(afterIdx)
            setFeedbackMessage(`${latest[afterIdx].name}'s turn!`)
            setCurrentProblem(null)
            setUserAnswer('')
            setPhase('idle')
            return latest
          })
        }, FEEDBACK_DELAY)

        return updated
      }

      setFeedbackMessage(`${nextPlayer.name}'s turn!`)
      setCurrentProblem(null)
      setUserAnswer('')
      setPhase('idle')
      return prev
    })
  }, [currentPlayerIndex])

  /* ---------- Update current player helper ---------- */

  const updateCurrentPlayer = useCallback((updater: (p: Player) => Player) => {
    setPlayers(prev => {
      const updated = [...prev]
      updated[currentPlayerIndex] = updater(updated[currentPlayerIndex])
      return updated
    })
  }, [currentPlayerIndex])

  /* ---------- Move back helper ---------- */

  const moveBack = useCallback((spaces: number) => {
    updateCurrentPlayer(p => ({
      ...p,
      position: Math.max(0, p.position - spaces),
    }))
  }, [updateCurrentPlayer])

  /* ---------- Transition to next turn ---------- */

  const finishTurn = useCallback(() => {
    timeoutRef.current = window.setTimeout(() => {
      advanceTurn()
    }, TURN_TRANSITION_DELAY)
  }, [advanceTurn])

  /* ---------- Handle answer submission ---------- */

  const handleSubmission = useCallback((timedOut: boolean) => {
    clearAllTimers()

    if (!currentProblem) { finishTurn(); return }

    if (currentProblem.isSnakeBite) {
      finishTurn()
      return
    }

    const parsed = parseInt(userAnswer, 10)
    const isCorrect = !timedOut && !isNaN(parsed) && parsed === currentProblem.answer

    if (phase === 'final_question') {
      // Final question to win
      if (isCorrect) {
        updateCurrentPlayer(p => ({
          ...p,
          stats: { ...p.stats, correctCount: p.stats.correctCount + 1 },
        }))
        setFeedbackMessage('Correct! You WIN!')
        setWinner(players[currentPlayerIndex])
        setPhase('won')
      } else {
        updateCurrentPlayer(p => ({
          ...p,
          position: Math.max(0, p.position - 3),
          stats: { ...p.stats, wrongCount: p.stats.wrongCount + 1 },
        }))
        setFeedbackMessage(
          timedOut
            ? `Time\u2019s up! Answer: ${currentProblem.answer}. Back 3 spaces!`
            : `Wrong! Answer: ${currentProblem.answer}. Back 3 spaces!`
        )
        setPhase('wrong')
        timeoutRef.current = window.setTimeout(() => {
          advanceTurn()
        }, FEEDBACK_DELAY)
      }
      return
    }

    if (isCorrect) {
      updateCurrentPlayer(p => ({
        ...p,
        stats: { ...p.stats, correctCount: p.stats.correctCount + 1 },
      }))
      setFeedbackMessage('Correct!')
      setPhase('correct')
      timeoutRef.current = window.setTimeout(() => {
        finishTurn()
      }, FEEDBACK_DELAY)
    } else {
      updateCurrentPlayer(p => ({
        ...p,
        stats: { ...p.stats, wrongCount: p.stats.wrongCount + 1 },
      }))
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
  }, [clearAllTimers, currentProblem, userAnswer, finishTurn, moveBack, updateCurrentPlayer, phase, players, currentPlayerIndex, advanceTurn])

  autoSubmitRef.current = () => handleSubmission(true)

  /* ---------- Submit answer ---------- */

  const submitAnswer = useCallback(() => {
    if (phase !== 'answering' && phase !== 'final_question') return
    handleSubmission(false)
  }, [phase, handleSubmission])

  /* ---------- Handle landing on a space ---------- */

  const handleLanding = useCallback((pos: number) => {
    const space = board[pos]
    if (!space) { finishTurn(); return }

    // Check for finish — trigger final question
    if (pos >= TOTAL_SPACES - 1) {
      const problem = generateFinalQuestion()
      setCurrentProblem(problem)
      setUserAnswer('')
      setPhase('card_draw')

      timeoutRef.current = window.setTimeout(() => {
        setPhase('final_question')
      }, CARD_SHOW_DELAY)
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
      updateCurrentPlayer(p => ({
        ...p,
        stats: { ...p.stats, snakeBiteCount: p.stats.snakeBiteCount + 1 },
        turnLocked: true,
      }))
      setFeedbackMessage('SNAKE BITE! Go back 3 spaces and lose your next turn!')
      setPhase('snakebite')
      moveBack(3)

      timeoutRef.current = window.setTimeout(() => {
        finishTurn()
      }, SNAKEBITE_DELAY)
    } else {
      setPhase('card_draw')
      setUserAnswer('')

      timeoutRef.current = window.setTimeout(() => {
        setPhase('answering')
      }, CARD_SHOW_DELAY)
    }
  }, [board, finishTurn, moveBack, updateCurrentPlayer])

  /* ---------- Roll the die ---------- */

  const rollDie = useCallback(() => {
    if (phase !== 'idle') return
    if (players.length === 0) return

    const player = players[currentPlayerIndex]
    if (!player) return

    updateCurrentPlayer(p => ({
      ...p,
      stats: { ...p.stats, turnCount: p.stats.turnCount + 1 },
    }))

    const roll = Math.floor(Math.random() * 6) + 1
    setDieValue(roll)
    setPhase('rolling')
    setFeedbackMessage('')

    timeoutRef.current = window.setTimeout(() => {
      setPhase('moving')

      const currentPos = player.position
      const newPos = Math.min(currentPos + roll, TOTAL_SPACES - 1)
      let step = 0
      const steps = newPos - currentPos

      if (steps <= 0) {
        handleLanding(newPos)
        return
      }

      const stepInterval = window.setInterval(() => {
        step++
        updateCurrentPlayer(p => ({ ...p, position: p.position + 1 }))

        if (step >= steps) {
          clearInterval(stepInterval)
          moveIntervalRef.current = null
          setTimeout(() => handleLanding(newPos), 200)
        }
      }, MOVE_DELAY)

      moveIntervalRef.current = stepInterval as unknown as number
    }, ROLL_DELAY)
  }, [phase, players, currentPlayerIndex, handleLanding, updateCurrentPlayer])

  /* ---------- Reset game ---------- */

  const resetGame = useCallback(() => {
    clearAllTimers()
    setPlayers([])
    setCurrentPlayerIndex(0)
    setDieValue(null)
    setPhase('setup')
    setCurrentProblem(null)
    setUserAnswer('')
    setTimerRemaining(TIMER_SECONDS * 10)
    setFeedbackMessage('')
    setWinner(null)
    nextIdRef.current = 1
  }, [clearAllTimers])

  return {
    board,
    players,
    currentPlayerIndex,
    dieValue,
    phase,
    currentProblem,
    userAnswer,
    timerRemaining,
    feedbackMessage,
    winner,
    addPlayer,
    removePlayer,
    startGame,
    rollDie,
    submitAnswer,
    setUserAnswer,
    resetGame,
  }
}
