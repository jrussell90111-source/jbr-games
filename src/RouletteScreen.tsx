// src/RouletteScreen.tsx
import React from 'react'
import { useRoulette } from './useRoulette'
import RouletteBoard from './RouletteBoard'
import RouletteWheel from './RouletteWheel'
import { audio } from './audio'

const CHIP_VALUE = 2
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

export default function RouletteScreen({ onBack }: { onBack?: () => void }) {
  const g = useRoulette()

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{
        background: 'linear-gradient(180deg, #0e1e12, #0b1810)',
        border: '2px solid #1a3a22',
        borderRadius: 14,
        padding: 14,
        boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
        marginBottom: 12,
        position: 'relative',
      }}>
        <h3 className="title" style={{ marginTop: 0, marginBottom: 10 }}>
          Roulette — European (single zero)
        </h3>

        {/* ── Top section: controls left · wheel right (hero) ── */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap' }}>

          {/* Left: credits + money controls + outcome */}
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div className="row" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
              <div>Credits: <b>{fmt(g.credits)}</b></div>
              <div>Stake: <b>{fmt(g.totalStake)}</b></div>
            </div>

            <div className="controls" style={{ marginTop: 0, flexWrap: 'wrap' }}>
              <button onClick={() => { g.insert(10);  audio.thud() }}>+$10</button>
              <button onClick={() => { g.insert(50);  audio.thud() }}>+$50</button>
              <button onClick={() => { g.insert(100); audio.thud() }}>+$100</button>
              <button onClick={g.cashOutAll} disabled={g.credits === 0}>Cash Out</button>
            </div>

            {/* Outcome badge — shown after spin completes */}
            {g.phase !== 'bet' && g.outcome && (
              <div style={{
                marginTop: 14,
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(0,0,0,0.45)', borderRadius: 10,
                padding: '8px 14px', border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: '#fff' }}>
                  {g.outcome.number}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 700, textTransform: 'capitalize',
                    color: g.outcome.color === 'red'   ? '#ff6b6b'
                         : g.outcome.color === 'black' ? '#ccc'
                         : '#4caf50',
                  }}>
                    {g.outcome.color}
                  </span>
                  {g.phase === 'show' && g.lastNet != null && (
                    <span style={{
                      fontSize: 12,
                      color: g.lastNet >= 0 ? '#7CFF7C' : '#FF8B8B',
                      fontWeight: 700,
                    }}>
                      Net: {g.lastNet >= 0 ? '+' : ''}{fmt(g.lastNet)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: the wheel — the main attraction */}
          <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <RouletteWheel
              targetNumber={g.outcome?.number ?? null}
              spinning={g.phase === 'spin'}
              durationMs={g.spinMs || 8000}
            />
          </div>

        </div>

        {/* ── Board (full width below) ── */}
        <div className="rb-board-wrap">
          <RouletteBoard
            g={{
              phase: g.phase,
              bets: g.bets,
              addChip: (type: any, nums?: number | number[]) => {
                if (g.phase !== 'bet') return
                const amount = CHIP_VALUE
                if (Array.isArray(nums))        g.addBet({ type, numbers: nums, amount })
                else if (typeof nums === 'number') g.addBet({ type, number: nums, amount })
                else                            g.addBet({ type, amount })
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

        {/* ── Actions bar ── */}
        <div className="rb-actions">
          <div className="rb-actions-left">
            <button onClick={() => { if (onBack) onBack() }} type="button">Games</button>
          </div>
          <div className="rb-actions-center">
            <button
              onClick={() => { audio.clickHi(); g.spin() }}
              disabled={!g.canSpin}
              className="primary"
            >
              Spin
            </button>
            <button onClick={g.newRound} disabled={g.phase !== 'show'}>New Round</button>
            <button onClick={g.clearBets} disabled={g.phase !== 'bet' || g.bets.length === 0}>
              Clear Bets
            </button>
          </div>
          <div className="rb-actions-right" />
        </div>

      </div>
    </div>
  )
}
