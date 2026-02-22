// src/RouletteScreen00.tsx
// American double-zero roulette screen.
import React from 'react'
import { useRoulette00 } from './useRoulette00'
import RouletteBoard00 from './RouletteBoard00'
import RouletteWheel00 from './RouletteWheel00'
import { labelOf } from './games/roulette'
import { audio } from './audio'

const CHIP_VALUE = 2
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

export default function RouletteScreen00({ onBack }: { onBack?: () => void }) {
  const g = useRoulette00()

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{
        background: 'linear-gradient(180deg, #1e0e0e, #180b0b)',
        border: '2px solid #3a1a1a',
        borderRadius: 14,
        padding: 12,
        boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
        marginBottom: 12,
        position: 'relative',
      }}>
        <h3 className="title" style={{ marginTop: 0 }}>
          Roulette — Double Zero (American)
        </h3>

        {/* Top info row */}
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <div>Credits: <b>{fmt(g.credits)}</b></div>
          <div>Stake: <b>{fmt(g.totalStake)}</b></div>
        </div>

        {/* Money controls */}
        <div className="controls" style={{ marginTop: 0 }}>
          <button onClick={() => { g.insert(10); audio.thud() }}>+$10</button>
          <button onClick={() => { g.insert(50); audio.thud() }}>+$50</button>
          <button onClick={() => { g.insert(100); audio.thud() }}>+$100</button>
          <button onClick={g.cashOutAll} disabled={g.credits === 0}>Cash Out</button>
        </div>

        {/* Wheel left, board right */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 14, flexWrap: 'wrap' }}>

          <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <RouletteWheel00
              targetNumber={g.outcome?.number ?? null}
              spinning={g.phase === 'spin'}
              durationMs={g.spinMs || 8000}
            />
            {g.phase === 'show' && g.outcome && (
              <div style={{
                background: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: '4px 10px',
                fontSize: 13, color: '#fff', textAlign: 'center',
              }}>
                <span style={{ fontWeight: 700, fontSize: 18 }}>
                  {labelOf(g.outcome.number)}
                </span>
                {' '}
                <span style={{
                  color: g.outcome.color === 'red' ? '#ff6b6b'
                       : g.outcome.color === 'black' ? '#aaa' : '#4caf50'
                }}>
                  {g.outcome.color}
                </span>
              </div>
            )}
          </div>

          <div className="rb-board-wrap" style={{ flex: '1 1 0', minWidth: 0 }}>
            <RouletteBoard00
              g={{
                phase: g.phase,
                bets: g.bets,
                addChip: (type: any, nums?: number | number[]) => {
                  if (g.phase !== 'bet') return
                  const amount = CHIP_VALUE
                  if (Array.isArray(nums)) g.addBet({ type, numbers: nums, amount })
                  else if (typeof nums === 'number') g.addBet({ type, number: nums, amount })
                  else g.addBet({ type, amount })
                  try { audio.chipUp() } catch {}
                },
                removeChip: (type: any, nums?: number | number[]) => {
                  if (g.phase !== 'bet') return
                  const idx = g.bets.findIndex(b => {
                    if (b.type !== type) return false
                    const norm = (x: any) => Array.isArray(x?.numbers)
                      ? x.numbers.slice().sort().join('-')
                      : (typeof x?.number === 'number' ? String(x.number) : '')
                    const want = Array.isArray(nums) ? nums.slice().sort().join('-')
                               : (typeof nums === 'number' ? String(nums) : '')
                    return norm(b) === want
                  })
                  if (idx >= 0) {
                    g.removeBet(idx)
                    try { audio.chipDown() } catch {}
                  }
                },
              }}
              winnerNumber={g.phase === 'show' ? g.outcome?.number ?? null : null}
            />
          </div>
        </div>

        {/* Actions bar */}
        <div className="rb-actions">
          <div className="rb-actions-left">
            <button onClick={() => { if (onBack) onBack() }} type="button">
              Games
            </button>
          </div>
          <div className="rb-actions-center">
            <button
              onClick={() => { audio.clickHi(); g.spin() }}
              disabled={!g.canSpin}
              className="primary"
            >
              Spin
            </button>
            <button onClick={g.newRound} disabled={g.phase !== 'show'}>
              New Round
            </button>
            <button onClick={g.clearBets} disabled={g.phase !== 'bet' || g.bets.length === 0}>
              Clear Bets
            </button>
          </div>
          <div className="rb-actions-right">
            {g.phase !== 'bet' && g.outcome && (
              <div className="rb-outcome">
                <span>Net: <b style={{ color: (g.lastNet ?? 0) >= 0 ? '#7CFF7C' : '#FF8B8B' }}>
                  {fmt(g.lastNet ?? 0)}
                </b></span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
