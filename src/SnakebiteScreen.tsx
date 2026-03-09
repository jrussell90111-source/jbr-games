// src/SnakebiteScreen.tsx
// Snake Attack! — Main game screen component

import React, { useRef, useEffect, useCallback } from 'react'
import { useSnakebite } from './useSnakebite'
import SnakebiteBoard from './SnakebiteBoard'
import { audio } from './audio'

/* ------------------------------------------------------------------ */
/*                          DIE FACE                                   */
/* ------------------------------------------------------------------ */

/** Simple SVG die face */
function DieFace({ value }: { value: number | null }) {
  if (value === null) return null

  // Dot positions for each die face (on a 3×3 grid: positions 0-8)
  const dotMap: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  }

  const dots = dotMap[value] || []

  return (
    <svg viewBox="0 0 60 60" width={54} height={54} style={{ display: 'block' }}>
      <rect x={2} y={2} width={56} height={56} rx={8} fill="#fff" stroke="#333" strokeWidth={2} />
      {dots.map(pos => {
        const col = pos % 3
        const row = Math.floor(pos / 3)
        return (
          <circle
            key={pos}
            cx={14 + col * 16}
            cy={14 + row * 16}
            r={5}
            fill="#222"
          />
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*                        TIMER BAR                                    */
/* ------------------------------------------------------------------ */

function TimerBar({ remaining, total }: { remaining: number; total: number }) {
  const pct = (remaining / total) * 100
  const seconds = Math.ceil(remaining / 10)
  const urgent = seconds <= 5

  return (
    <div className="sb-timer-wrap">
      <div className="sb-timer-bar" style={{ width: `${pct}%`, background: urgent ? '#ef5350' : '#4caf50' }} />
      <span className="sb-timer-text" style={{ color: urgent ? '#ef5350' : 'var(--text)' }}>
        {seconds}s
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*                     SCREEN COMPONENT                                */
/* ------------------------------------------------------------------ */

export default function SnakebiteScreen({ onBack }: { onBack?: () => void }) {
  const g = useSnakebite()
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input when answering
  useEffect(() => {
    if (g.phase === 'answering' && inputRef.current) {
      inputRef.current.focus()
    }
  }, [g.phase])

  // Play audio on phase changes
  useEffect(() => {
    if (g.phase === 'rolling') audio.click()
    if (g.phase === 'correct') {
      try { (audio as any).win?.('small') } catch { audio.click() }
    }
    if (g.phase === 'wrong') audio.thud()
    if (g.phase === 'snakebite') audio.thud()
    if (g.phase === 'won') {
      try { (audio as any).win?.('big') } catch { audio.clickHi() }
    }
  }, [g.phase])

  // Keyboard: Enter to submit during answering
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && g.phase === 'answering') {
      e.preventDefault()
      g.submitAnswer()
    }
  }, [g.phase, g.submitAnswer])

  // Keyboard: Space or Enter to roll die during idle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (g.phase === 'idle' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        g.rollDie()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [g.phase, g.rollDie])

  const isRolling = g.phase === 'rolling' || g.phase === 'moving'
  const showProblem = g.phase === 'card_draw' || g.phase === 'answering'
  const showFeedback = g.phase === 'correct' || g.phase === 'wrong' || g.phase === 'snakebite'
  const cardColor = g.currentProblem
    ? (g.board[g.playerPosition]?.type === 'red' ? 'red' : 'brown')
    : 'brown'

  return (
    <div className="sb-screen" style={{ opacity: 1, pointerEvents: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', width: '100%', maxWidth: 900, alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 className="title" style={{ margin: 0 }}>Snake Attack!</h2>
        {onBack && (
          <button type="button" onClick={onBack}>
            Games
          </button>
        )}
      </div>

      <div className="sb-layout">
        {/* Left column: Board */}
        <div className="sb-board-col">
          <SnakebiteBoard
            spaces={g.board}
            playerPosition={g.playerPosition}
          />
        </div>

        {/* Right column: Controls + Status */}
        <div className="sb-control-col">
          {/* Stats */}
          <div className="sb-stats">
            <div>Turn: <b>{g.turnCount}</b></div>
            <div>Correct: <b>{g.correctCount}</b></div>
            <div>Wrong: <b>{g.wrongCount}</b></div>
            <div>Snake Bites: <b>{g.snakeBiteCount}</b></div>
            <div>Position: <b>{g.playerPosition}</b> / {g.board.length - 1}</div>
          </div>

          {/* Die */}
          <div className="sb-die-area">
            {g.dieValue !== null && (
              <div className={`sb-die ${isRolling ? 'sb-die-rolling' : ''}`}>
                <DieFace value={g.dieValue} />
              </div>
            )}
            {g.dieValue === null && (
              <div className="sb-die-placeholder">
                Roll to start!
              </div>
            )}
          </div>

          {/* Roll button */}
          {g.phase === 'idle' && (
            <div className="controls" style={{ justifyContent: 'center', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => { audio.click(); g.rollDie() }}
                style={{ transform: 'scale(1.15)', padding: '10px 28px', fontSize: '1.1rem' }}
              >
                {g.turnLocked ? 'Skip Turn (Snake Bite)' : 'Roll Die'}
              </button>
            </div>
          )}

          {/* Moving indicator */}
          {isRolling && (
            <div className="sb-moving-indicator">
              Moving {g.dieValue} spaces...
            </div>
          )}

          {/* Problem Card */}
          {(showProblem || showFeedback) && g.currentProblem && (
            <div className={`sb-card sb-card-${g.currentProblem.isSnakeBite ? 'snakebite' : cardColor}`}>
              {g.currentProblem.isSnakeBite ? (
                <div className="sb-card-snakebite-text">
                  <span style={{ fontSize: '2rem' }}>&#x1F40D;</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 4 }}>SNAKE BITE!</div>
                  <div style={{ fontSize: '0.9rem', marginTop: 6, opacity: 0.9 }}>
                    Go back 3 spaces &amp; lose your turn
                  </div>
                </div>
              ) : (
                <>
                  <div className="sb-card-label">
                    {cardColor === 'brown' ? 'Easy Card' : 'Hard Card'}
                  </div>
                  <div className="sb-card-problem">
                    {g.currentProblem.text}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Answer input + timer */}
          {g.phase === 'answering' && g.currentProblem && !g.currentProblem.isSnakeBite && (
            <div className="sb-answer-area">
              <TimerBar remaining={g.timerRemaining} total={200} />
              <div className="sb-input-row">
                <input
                  ref={inputRef}
                  type="number"
                  className="sb-answer-input"
                  value={g.userAnswer}
                  onChange={e => g.setUserAnswer(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="?"
                  autoComplete="off"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={g.submitAnswer}
                  style={{ padding: '8px 20px' }}
                >
                  Submit
                </button>
              </div>
            </div>
          )}

          {/* Feedback message */}
          {showFeedback && (
            <div className={`sb-feedback sb-feedback-${g.phase}`}>
              {g.feedbackMessage}
            </div>
          )}

          {/* Won! */}
          {g.phase === 'won' && (
            <div className="sb-won-modal">
              <div style={{ fontSize: '2.5rem' }}>&#x1F389;</div>
              <h3 style={{ margin: '6px 0' }}>You Won!</h3>
              <div className="sb-stats" style={{ marginBottom: 10 }}>
                <div>Turns: <b>{g.turnCount}</b></div>
                <div>Correct Answers: <b>{g.correctCount}</b></div>
                <div>Wrong Answers: <b>{g.wrongCount}</b></div>
                <div>Snake Bites: <b>{g.snakeBiteCount}</b></div>
              </div>
              <button type="button" onClick={g.resetGame}>Play Again</button>
            </div>
          )}

          {/* Game info */}
          <div className="sb-info">
            <small style={{ opacity: 0.6 }}>
              Created by Ricky Russell &middot; Land on brown or red to draw a card &middot; Answer within 20 seconds &middot; Snake Bite = back 3 + skip turn
            </small>
          </div>

          {/* Reset */}
          {g.phase === 'idle' && g.turnCount > 0 && (
            <div className="controls" style={{ justifyContent: 'center', marginTop: 6 }}>
              <button type="button" onClick={g.resetGame} style={{ opacity: 0.7, fontSize: '0.85rem' }}>
                New Game
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
