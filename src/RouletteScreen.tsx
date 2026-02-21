// src/RouletteScreen.tsx
import React from 'react'
import { useRoulette } from './useRoulette'
import RouletteBoard from './RouletteBoard'
import { audio } from './audio'

const CHIP_VALUE = 2
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

export default function RouletteScreen({ onBack }: { onBack?: () => void }) {
  const g = useRoulette()

  return (
    <div className="layout">
      <div className="table" style={{ position:'relative' }}>
        <h3 className="title" style={{ marginTop: 0 }}>Roulette (single zero)</h3>

        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>Credits: <b>{fmt(g.credits)}</b></div>
          <div>Stake: <b>{fmt(g.totalStake)}</b></div>
          <div>Phase: <b>{g.phase}</b></div>
        </div>

        {/* Money controls */}
        <div className="controls" style={{ marginTop: 8 }}>
          <button onClick={() => { g.insert(10); audio.thud() }}>+$10</button>
          <button onClick={() => { g.insert(50); audio.thud() }}>+$50</button>
          <button onClick={() => { g.insert(100); audio.thud() }}>+$100</button>
          <button onClick={g.cashOutAll} disabled={g.credits === 0}>Cash Out</button>
        </div>

        {/* Board area in a bounded container so it never hides the action bar */}
        <div className="rb-board-wrap">
          <RouletteBoard
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
                // find first matching bet (very simple matcher)
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

        {/* Persistent actions bar (always visible & on top) */}
        <div className="rb-actions">
          <div className="rb-actions-left">
            <button
              onClick={() => { if (onBack) onBack(); }}
              type="button"
            >
              Games
            </button>
          </div>

          <div className="rb-actions-center">
            <button
              onClick={() => { audio.clickHi(); g.spin(); }}
              disabled={!g.canSpin}
              className="primary"
            >
              Spin
            </button>
            <button
              onClick={g.newRound}
              disabled={g.phase !== 'show'}
            >
              New Round
            </button>
            <button
              onClick={g.clearBets}
              disabled={g.phase !== 'bet' || g.bets.length === 0}
            >
              Clear Bets
            </button>
          </div>

          <div className="rb-actions-right">
            {g.phase !== 'bet' && g.outcome && (
              <div className="rb-outcome">
                <span>Outcome: <b>{g.outcome.number}</b> ({g.outcome.color})</span>
                <span style={{ marginLeft: 10 }}>
                  Net: <b style={{ color: (g.lastNet ?? 0) >= 0 ? '#7CFF7C' : '#FF8B8B' }}>
                    {fmt(g.lastNet ?? 0)}
                  </b>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

