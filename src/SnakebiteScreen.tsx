// src/SnakebiteScreen.tsx
// Snake Attack! — Main game screen component — v2: multiplayer + setup

import React, { useRef, useEffect, useCallback, useState } from 'react'
import { useSnakebite, PLAYER_COLORS, PLAYER_EMOJIS } from './useSnakebite'
import SnakebiteBoard from './SnakebiteBoard'
import { audio } from './audio'

/* ------------------------------------------------------------------ */
/*                          DIE FACE                                   */
/* ------------------------------------------------------------------ */

function DieFace({ value }: { value: number | null }) {
  if (value === null) return null

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
/*                      SETUP SCREEN                                   */
/* ------------------------------------------------------------------ */

function SnakebiteSetup({ onAdd, onRemove, onStart, players, onBack }: {
  onAdd: (name: string, age: number | 'adult') => void
  onRemove: (id: number) => void
  onStart: () => void
  players: { id: number; name: string; age: number | 'adult'; color: string; emoji: string }[]
  onBack?: () => void
}) {
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [isAdult, setIsAdult] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const handleAdd = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const playerAge = isAdult ? 'adult' as const : (parseInt(age, 10) || 10)
    onAdd(trimmed, playerAge)
    setName('')
    setAge('')
    setIsAdult(false)
    nameRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="sb-setup">
      <h2 className="title" style={{ margin: '0 0 6px 0' }}>Snake Attack!</h2>
      <p style={{ margin: '0 0 16px 0', opacity: 0.7 }}>Add up to 4 players. Youngest goes first!</p>

      {/* Player list */}
      {players.length > 0 && (
        <div className="sb-setup-players">
          {players.map(p => (
            <div key={p.id} className="sb-setup-player-row" style={{ borderLeftColor: p.color }}>
              <span className="sb-setup-player-emoji">{p.emoji}</span>
              <span className="sb-setup-player-name">{p.name}</span>
              <span className="sb-setup-player-age">
                {p.age === 'adult' ? 'Adult' : `Age ${p.age}`}
              </span>
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                className="sb-setup-remove"
                title="Remove player"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add player form */}
      {players.length < 4 && (
        <div className="sb-setup-form">
          <div className="sb-setup-input-row">
            <input
              ref={nameRef}
              type="text"
              placeholder="Player name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={onKeyDown}
              className="sb-setup-name-input"
              maxLength={20}
              autoComplete="off"
            />
            {!isAdult && (
              <input
                type="number"
                placeholder="Age"
                value={age}
                onChange={e => setAge(e.target.value)}
                onKeyDown={onKeyDown}
                className="sb-setup-age-input"
                min={1}
                max={120}
              />
            )}
            <label className="sb-setup-adult-label">
              <input
                type="checkbox"
                checked={isAdult}
                onChange={e => setIsAdult(e.target.checked)}
              />
              Adult
            </label>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!name.trim()}
            style={{ padding: '8px 20px' }}
          >
            Add Player
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button
          type="button"
          onClick={onStart}
          disabled={players.length === 0}
          style={{ padding: '12px 32px', fontSize: '1.1rem', transform: players.length > 0 ? 'scale(1.05)' : 'none' }}
        >
          Start Game{players.length > 0 ? ` (${players.length} player${players.length > 1 ? 's' : ''})` : ''}
        </button>
        {onBack && (
          <button type="button" onClick={onBack} style={{ opacity: 0.7 }}>
            Back
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*                     SCREEN COMPONENT                                */
/* ------------------------------------------------------------------ */

export default function SnakebiteScreen({ onBack }: { onBack?: () => void }) {
  const g = useSnakebite()
  const inputRef = useRef<HTMLInputElement>(null)

  const currentPlayer = g.players[g.currentPlayerIndex]

  // Auto-focus input when answering
  useEffect(() => {
    if ((g.phase === 'answering' || g.phase === 'final_question') && inputRef.current) {
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
    if (e.key === 'Enter' && (g.phase === 'answering' || g.phase === 'final_question')) {
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

  // ---------- Setup phase ----------
  if (g.phase === 'setup') {
    return (
      <div className="sb-screen" style={{ opacity: 1, pointerEvents: 'auto' }}>
        <SnakebiteSetup
          onAdd={g.addPlayer}
          onRemove={g.removePlayer}
          onStart={g.startGame}
          players={g.players}
          onBack={onBack}
        />
      </div>
    )
  }

  // ---------- Game phase ----------
  const isRolling = g.phase === 'rolling' || g.phase === 'moving'
  const showProblem = g.phase === 'card_draw' || g.phase === 'answering' || g.phase === 'final_question'
  const showFeedback = g.phase === 'correct' || g.phase === 'wrong' || g.phase === 'snakebite'
  const cardColor = g.phase === 'final_question'
    ? 'final'
    : g.currentProblem
      ? (g.board[currentPlayer?.position ?? 0]?.type === 'red' ? 'red' : 'brown')
      : 'brown'

  return (
    <div className="sb-screen" style={{ opacity: 1, pointerEvents: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', width: '100%', maxWidth: 1000, alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
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
            players={g.players}
            currentPlayerIndex={g.currentPlayerIndex}
          />
        </div>

        {/* Right column: Controls + Status */}
        <div className="sb-control-col">
          {/* Turn indicator */}
          {currentPlayer && g.phase !== 'won' && (
            <div className="sb-turn-header" style={{ borderColor: currentPlayer.color }}>
              <span style={{ fontSize: '1.3rem' }}>{currentPlayer.emoji}</span>
              <span style={{ fontWeight: 700, color: currentPlayer.color }}>{currentPlayer.name}&apos;s Turn</span>
            </div>
          )}

          {/* Player list */}
          <div className="sb-player-list">
            {g.players.map(p => (
              <div
                key={p.id}
                className={`sb-player-item ${p.id === currentPlayer?.id ? 'active' : ''}`}
                style={{ borderLeftColor: p.color }}
              >
                <span className="sb-player-item-emoji">{p.emoji}</span>
                <span className="sb-player-item-name">{p.name}</span>
                <span className="sb-player-item-pos">Pos {p.position}/{g.board.length - 1}</span>
                {p.turnLocked && <span className="sb-player-item-locked" title="Snake bite — skip next turn">&#x1F40D;</span>}
              </div>
            ))}
          </div>

          {/* Current player stats */}
          {currentPlayer && (
            <div className="sb-stats">
              <div>Turn: <b>{currentPlayer.stats.turnCount}</b></div>
              <div>Correct: <b>{currentPlayer.stats.correctCount}</b></div>
              <div>Wrong: <b>{currentPlayer.stats.wrongCount}</b></div>
              <div>Bites: <b>{currentPlayer.stats.snakeBiteCount}</b></div>
            </div>
          )}

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
                Roll Die
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
                    Go back 3 spaces &amp; lose your next turn
                  </div>
                </div>
              ) : (
                <>
                  <div className="sb-card-label">
                    {cardColor === 'final' ? 'FINAL QUESTION' : cardColor === 'brown' ? 'Easy Card' : 'Hard Card'}
                  </div>
                  <div className="sb-card-problem">
                    {g.currentProblem.text}
                  </div>
                  {cardColor === 'final' && (
                    <div style={{ fontSize: '0.8rem', marginTop: 4, opacity: 0.8 }}>
                      Answer correctly to win!
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Answer input + timer */}
          {(g.phase === 'answering' || g.phase === 'final_question') && g.currentProblem && !g.currentProblem.isSnakeBite && (
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
          {g.phase === 'won' && g.winner && (
            <div className="sb-won-modal">
              <div style={{ fontSize: '2.5rem' }}>&#x1F389;</div>
              <h3 style={{ margin: '6px 0', color: g.winner.color }}>
                {g.winner.emoji} {g.winner.name} Wins!
              </h3>
              <div className="sb-won-stats">
                {g.players.map(p => (
                  <div key={p.id} className="sb-won-player-row" style={{ borderLeftColor: p.color }}>
                    <span>{p.emoji} {p.name}</span>
                    <span>Pos {p.position}</span>
                    <span>{p.stats.correctCount}&#x2713; {p.stats.wrongCount}&#x2717;</span>
                    <span>{p.stats.snakeBiteCount} &#x1F40D;</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button type="button" onClick={g.resetGame}>Play Again</button>
                {onBack && <button type="button" onClick={onBack} style={{ opacity: 0.7 }}>Menu</button>}
              </div>
            </div>
          )}

          {/* Game info */}
          <div className="sb-info">
            <small style={{ opacity: 0.6 }}>
              Created by Ricky Russell &middot; Land on brown or red to draw a card &middot; Answer within 20 seconds &middot; Snake Bite = back 3 + skip turn
            </small>
          </div>

          {/* Reset */}
          {g.phase === 'idle' && currentPlayer?.stats.turnCount > 0 && (
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
