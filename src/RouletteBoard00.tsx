// src/RouletteBoard00.tsx
// American double-zero roulette board.
//
// Layout identical to RouletteBoard.tsx EXCEPT the zero column (col 1):
//   - 0  at gridRow 1  (top number row)
//   - [0,00] split hit at gridRows 2-4
//   - 00 at gridRow 5  (bot number row)
//
// And col 2 (the zero-side hit column):
//   - [0,2,3] street   at gridRow 2
//   - topline [0,00,1,2,3] at gridRow 3  (unique American bet, 6:1)
//   - [00,1,2] street  at gridRow 4
//
// 00 is stored internally as 37 throughout.
import React, { useMemo } from 'react'
import { labelOf } from './games/roulette'

type Phase = 'bet' | 'spin' | 'clear' | 'pay' | 'show'
type RouletteAPI = {
  phase: Phase
  bets: any[]
  addChip: (type: any, nums?: number | number[]) => void
  removeChip: (type: any, nums?: number | number[]) => void
  addAmount?: (type: any, nums: number | number[] | undefined, delta: number) => void
  removeAmount?: (type: any, nums: number | number[] | undefined, delta: number) => void
}

const INSIDE_UNIT  = 2
const OUTSIDE_MIN  = 10
const OUTSIDE_UNIT = 2
const LABEL_WITH_DOLLAR = true

const RED_SET = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
function colorOf(n: number): 'red' | 'black' | 'green' {
  if (n === 0 || n === 37) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}

// ─── bet-amount lookup ────────────────────────────────────────────────────────
function useAmount(bets: any[]) {
  const map = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of bets) {
      const arr: number[] =
        Array.isArray(b.numbers) ? b.numbers.slice()
        : typeof b.number === 'number' ? [b.number]
        : []
      arr.sort((a, c) => a - c)
      const key = `${b.type}:${arr.join('-')}`
      m.set(key, (m.get(key) ?? 0) + (b.amount ?? 0))
    }
    return m
  }, [bets])

  return (type: string, nums?: number | number[]) => {
    const arr = typeof nums === 'number' ? [nums] : (nums ?? [])
    const key = `${type}:${arr.slice().sort((a, c) => a - c).join('-')}`
    return map.get(key) ?? 0
  }
}

// ─── chip visual-state helper ─────────────────────────────────────────────────
function chipStateClass(
  type: string,
  nums: number | number[] | undefined,
  loserKeys?: Set<string>,
  payingKey?: string | null,
): string | undefined {
  if (!loserKeys && !payingKey) return undefined
  const arr = typeof nums === 'number' ? [nums] : (nums ?? [])
  const key = `${type}:${arr.slice().sort((a, c) => a - c).join('-')}`
  if (payingKey === key) return 'rb-chips--paying'
  if (loserKeys?.has(key)) return 'rb-chips--losing'
  return undefined
}

// ─── chip display ─────────────────────────────────────────────────────────────
function ChipAmount({ amount, chipClass }: { amount: number; chipClass?: string }) {
  if (amount <= 0) return null
  const rounded = Math.round(amount)
  const label = LABEL_WITH_DOLLAR ? `$${rounded}` : String(rounded)
  return (
    <div className={`rb-chips${chipClass ? ' ' + chipClass : ''}`} aria-label={`${label} chip`}>
      <div className="rb-chip">
        <span className="rb-chip-label">{label}</span>
      </div>
    </div>
  )
}

function Dolly({ label }: { label: React.ReactNode }) {
  return (
    <div className="rb-dolly" title="Winning number">
      <span>{label}</span>
    </div>
  )
}

// ─── bet helpers ──────────────────────────────────────────────────────────────
function isOutsideType(t: string): boolean {
  return (
    t === 'red' || t === 'black' ||
    t === 'even' || t === 'odd' ||
    t === 'low' || t === 'high' ||
    t === 'dozen1' || t === 'dozen2' || t === 'dozen3' ||
    t === 'column1' || t === 'column2' || t === 'column3'
  )
}
function addExact(g: RouletteAPI, type: string, nums: number | number[] | undefined, delta: number, unit: number) {
  if (delta <= 0) return
  if (typeof g.addAmount === 'function') { g.addAmount(type, nums, delta); return }
  const steps = Math.round(delta / unit)
  for (let i = 0; i < steps; i++) g.addChip(type, nums)
}
function removeExact(g: RouletteAPI, type: string, nums: number | number[] | undefined, delta: number, unit: number) {
  if (delta <= 0) return
  if (typeof g.removeAmount === 'function') { g.removeAmount(type, nums, delta); return }
  const steps = Math.round(delta / unit)
  for (let i = 0; i < steps; i++) g.removeChip(type, nums)
}
function addInside(g: RouletteAPI, type: string, nums?: number | number[]) {
  addExact(g, type, nums, INSIDE_UNIT, INSIDE_UNIT)
}
function removeInside(g: RouletteAPI, amtNow: number, type: string, nums?: number | number[]) {
  if (amtNow <= 0) return
  removeExact(g, type, nums, INSIDE_UNIT, INSIDE_UNIT)
}
function addOutside(g: RouletteAPI, amtNow: number, type: string) {
  if (!isOutsideType(type)) { addInside(g, type); return }
  if (amtNow < OUTSIDE_MIN) addExact(g, type, undefined, OUTSIDE_MIN - amtNow, OUTSIDE_UNIT)
  else addExact(g, type, undefined, OUTSIDE_UNIT, OUTSIDE_UNIT)
}
function removeOutside(g: RouletteAPI, amtNow: number, type: string) {
  if (!isOutsideType(type) || amtNow <= 0) return
  if (amtNow > OUTSIDE_MIN) removeExact(g, type, undefined, OUTSIDE_UNIT, OUTSIDE_UNIT)
  else removeExact(g, type, undefined, amtNow, OUTSIDE_UNIT)
}

// ─── number cell ─────────────────────────────────────────────────────────────
function NumberCell({
  n, disabled, color, amount, showDolly, chipClass, onAdd, onRemove
}: {
  n: number
  disabled: boolean
  color: 'red' | 'black' | 'green'
  amount: number
  showDolly: boolean
  chipClass?: string
  onAdd: () => void
  onRemove: () => void
}) {
  return (
    <div
      className={`rb-cell num ${color}${disabled ? ' disabled' : ''}`}
      onClick={(e) => { e.preventDefault(); if (!disabled) onAdd() }}
      onContextMenu={(e) => { e.preventDefault(); if (!disabled) onRemove() }}
      role="button"
      title={`${labelOf(n)} — Left-click: +$${INSIDE_UNIT}, Right-click: -$${INSIDE_UNIT}`}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) onAdd() }}
    >
      <span className="rb-num-label">{labelOf(n)}</span>
      <ChipAmount amount={amount} chipClass={chipClass} />
      {showDolly && <Dolly label={labelOf(n)} />}
    </div>
  )
}

// ─── hit zone shorthand ───────────────────────────────────────────────────────
function Hit({
  cls, gc, gr, onClick, onCtx, children
}: {
  cls: string
  gc: number | string
  gr: number | string
  onClick: () => void
  onCtx: (e: React.MouseEvent) => void
  children?: React.ReactNode
}) {
  return (
    <div
      className={`rb-hit ${cls}`}
      style={{ gridColumn: gc, gridRow: gr }}
      onClick={onClick}
      onContextMenu={onCtx}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function RouletteBoard00({
  g,
  winnerNumber = null,
  loserKeys,
  payingKey,
}: {
  g: RouletteAPI
  winnerNumber?: number | null   // 0..37 where 37 = "00"
  loserKeys?: Set<string>
  payingKey?: string | null
}) {
  const disabled = g.phase !== 'bet'
  const amt = useAmount(g.bets)

  const cc = (type: string, nums?: number | number[]) =>
    chipStateClass(type, nums, loserKeys, payingKey)

  const oi = (type: string, nums?: number | number[]) =>
    () => addInside(g, type, nums)
  const ri = (type: string, nums?: number | number[]) =>
    (e: React.MouseEvent) => { e.preventDefault(); removeInside(g, amt(type, nums), type, nums) }
  const oo = (type: string) =>
    () => addOutside(g, amt(type), type)
  const ro = (type: string) =>
    (e: React.MouseEvent) => { e.preventDefault(); removeOutside(g, amt(type), type) }

  // 00 = 37 internally
  const NN = 37

  return (
    <div className="rb-board">
      <div className="rb-htable">

        {/* ── ZERO (col 1, row 1 only) ─────────────────────────────────────── */}
        <div style={{ gridColumn: 1, gridRow: 1, position: 'relative' }}
             className="rb-zero-cell rb-zero-top">
          <NumberCell
            n={0} disabled={disabled} color="green"
            amount={amt('straight', 0)} showDolly={winnerNumber === 0}
            chipClass={cc('straight', 0)}
            onAdd={oi('straight', 0)}
            onRemove={() => removeInside(g, amt('straight', 0), 'straight', 0)}
          />
        </div>

        {/* ── [0, 00] SPLIT HIT (col 1, rows 2-4) ─────────────────────────── */}
        <Hit cls="vsplit rb-zero-split" gc={1} gr={'2 / 5'}
          onClick={oi('split', [0, NN])} onCtx={ri('split', [0, NN])}>
          <ChipAmount amount={amt('split', [0, NN])} chipClass={cc('split', [0, NN])} />
        </Hit>

        {/* ── DOUBLE ZERO (col 1, row 5) ───────────────────────────────────── */}
        <div style={{ gridColumn: 1, gridRow: 5, position: 'relative' }}
             className="rb-zero-cell rb-zero-bot">
          <NumberCell
            n={NN} disabled={disabled} color="green"
            amount={amt('straight', NN)} showDolly={winnerNumber === NN}
            chipClass={cc('straight', NN)}
            onAdd={oi('straight', NN)}
            onRemove={() => removeInside(g, amt('straight', NN), 'straight', NN)}
          />
        </div>

        {/* ── ZERO-SIDE HIT COLUMN (col 2) ─────────────────────────────────── */}
        <Hit cls="street" gc={2} gr={2}
          onClick={oi('street', [0, 2, 3])} onCtx={ri('street', [0, 2, 3])}>
          <ChipAmount amount={amt('street', [0, 2, 3])} chipClass={cc('street', [0, 2, 3])} />
        </Hit>
        <Hit cls="first4 rb-topline" gc={2} gr={3}
          onClick={oi('topline', [0, NN, 1, 2, 3])} onCtx={ri('topline', [0, NN, 1, 2, 3])}>
          <ChipAmount amount={amt('topline', [0, NN, 1, 2, 3])} chipClass={cc('topline', [0, NN, 1, 2, 3])} />
        </Hit>
        <Hit cls="street" gc={2} gr={4}
          onClick={oi('street', [NN, 1, 2])} onCtx={ri('street', [NN, 1, 2])}>
          <ChipAmount amount={amt('street', [NN, 1, 2])} chipClass={cc('street', [NN, 1, 2])} />
        </Hit>

        {/* ── 12 NUMBER COLUMNS (identical to single-zero board) ───────────── */}
        {Array.from({ length: 12 }, (_, idx) => {
          const c  = idx + 1
          const gc = 2 * c + 1
          const hc = 2 * c + 2
          const n3 = 3 * c
          const n2 = 3 * c - 1
          const n1 = 3 * c - 2

          return (
            <React.Fragment key={c}>
              {/* Number cells */}
              <div style={{ gridColumn: gc, gridRow: 1 }}>
                <NumberCell n={n3} disabled={disabled} color={colorOf(n3)}
                  amount={amt('straight', n3)} showDolly={winnerNumber === n3}
                  chipClass={cc('straight', n3)}
                  onAdd={oi('straight', n3)}
                  onRemove={() => removeInside(g, amt('straight', n3), 'straight', n3)} />
              </div>
              <div style={{ gridColumn: gc, gridRow: 3 }}>
                <NumberCell n={n2} disabled={disabled} color={colorOf(n2)}
                  amount={amt('straight', n2)} showDolly={winnerNumber === n2}
                  chipClass={cc('straight', n2)}
                  onAdd={oi('straight', n2)}
                  onRemove={() => removeInside(g, amt('straight', n2), 'straight', n2)} />
              </div>
              <div style={{ gridColumn: gc, gridRow: 5 }}>
                <NumberCell n={n1} disabled={disabled} color={colorOf(n1)}
                  amount={amt('straight', n1)} showDolly={winnerNumber === n1}
                  chipClass={cc('straight', n1)}
                  onAdd={oi('straight', n1)}
                  onRemove={() => removeInside(g, amt('straight', n1), 'straight', n1)} />
              </div>

              {/* Horizontal splits */}
              <Hit cls="hsplit" gc={gc} gr={2}
                onClick={oi('split', [n2, n3])} onCtx={ri('split', [n2, n3])}>
                <ChipAmount amount={amt('split', [n2, n3])} chipClass={cc('split', [n2, n3])} />
              </Hit>
              <Hit cls="hsplit" gc={gc} gr={4}
                onClick={oi('split', [n1, n2])} onCtx={ri('split', [n1, n2])}>
                <ChipAmount amount={amt('split', [n1, n2])} chipClass={cc('split', [n1, n2])} />
              </Hit>

              {/* Street */}
              <Hit cls="street" gc={gc} gr={6}
                onClick={oi('street', [n1, n2, n3])} onCtx={ri('street', [n1, n2, n3])}>
                <ChipAmount amount={amt('street', [n1, n2, n3])} chipClass={cc('street', [n1, n2, n3])} />
              </Hit>

              {/* Between-column hits */}
              {c < 12 && (
                <>
                  <Hit cls="vsplit" gc={hc} gr={1}
                    onClick={oi('split', [n3, n3+3])} onCtx={ri('split', [n3, n3+3])}>
                    <ChipAmount amount={amt('split', [n3, n3+3])} chipClass={cc('split', [n3, n3+3])} />
                  </Hit>
                  <Hit cls="vsplit" gc={hc} gr={3}
                    onClick={oi('split', [n2, n2+3])} onCtx={ri('split', [n2, n2+3])}>
                    <ChipAmount amount={amt('split', [n2, n2+3])} chipClass={cc('split', [n2, n2+3])} />
                  </Hit>
                  <Hit cls="vsplit" gc={hc} gr={5}
                    onClick={oi('split', [n1, n1+3])} onCtx={ri('split', [n1, n1+3])}>
                    <ChipAmount amount={amt('split', [n1, n1+3])} chipClass={cc('split', [n1, n1+3])} />
                  </Hit>
                  <Hit cls="corner" gc={hc} gr={2}
                    onClick={oi('corner', [n2, n3, n2+3, n3+3])}
                    onCtx={ri('corner', [n2, n3, n2+3, n3+3])}>
                    <ChipAmount amount={amt('corner', [n2, n3, n2+3, n3+3])} chipClass={cc('corner', [n2, n3, n2+3, n3+3])} />
                  </Hit>
                  <Hit cls="corner" gc={hc} gr={4}
                    onClick={oi('corner', [n1, n2, n1+3, n2+3])}
                    onCtx={ri('corner', [n1, n2, n1+3, n2+3])}>
                    <ChipAmount amount={amt('corner', [n1, n2, n1+3, n2+3])} chipClass={cc('corner', [n1, n2, n1+3, n2+3])} />
                  </Hit>
                  <Hit cls="line" gc={hc} gr={6}
                    onClick={oi('line', [n1, n2, n3, n1+3, n2+3, n3+3])}
                    onCtx={ri('line', [n1, n2, n3, n1+3, n2+3, n3+3])}>
                    <ChipAmount amount={amt('line', [n1, n2, n3, n1+3, n2+3, n3+3])} chipClass={cc('line', [n1, n2, n3, n1+3, n2+3, n3+3])} />
                  </Hit>
                </>
              )}
            </React.Fragment>
          )
        })}

        {/* ── 2:1 COLUMN BETS (col 27) ────────────────────────────────────── */}
        <div className="rb-col21" style={{ gridColumn: 27, gridRow: 1 }}
          onClick={oo('column3')} onContextMenu={ro('column3')}>
          <span className="rb-label">2:1</span>
          <ChipAmount amount={amt('column3')} chipClass={cc('column3')} />
        </div>
        <div className="rb-col21" style={{ gridColumn: 27, gridRow: 3 }}
          onClick={oo('column2')} onContextMenu={ro('column2')}>
          <span className="rb-label">2:1</span>
          <ChipAmount amount={amt('column2')} chipClass={cc('column2')} />
        </div>
        <div className="rb-col21" style={{ gridColumn: 27, gridRow: 5 }}
          onClick={oo('column1')} onContextMenu={ro('column1')}>
          <span className="rb-label">2:1</span>
          <ChipAmount amount={amt('column1')} chipClass={cc('column1')} />
        </div>

        {/* ── DOZENS (row 7) ───────────────────────────────────────────────── */}
        <div className="rb-outside dozen" style={{ gridColumn: '3 / 11', gridRow: 7 }}
          onClick={oo('dozen1')} onContextMenu={ro('dozen1')}>
          <span className="rb-label">1st 12</span>
          <ChipAmount amount={amt('dozen1')} chipClass={cc('dozen1')} />
        </div>
        <div className="rb-outside dozen" style={{ gridColumn: '11 / 19', gridRow: 7 }}
          onClick={oo('dozen2')} onContextMenu={ro('dozen2')}>
          <span className="rb-label">2nd 12</span>
          <ChipAmount amount={amt('dozen2')} chipClass={cc('dozen2')} />
        </div>
        <div className="rb-outside dozen" style={{ gridColumn: '19 / 27', gridRow: 7 }}
          onClick={oo('dozen3')} onContextMenu={ro('dozen3')}>
          <span className="rb-label">3rd 12</span>
          <ChipAmount amount={amt('dozen3')} chipClass={cc('dozen3')} />
        </div>

        {/* ── EVEN-MONEY BETS (row 8) ─────────────────────────────────────── */}
        <div className="rb-outside even-money" style={{ gridColumn: '3 / 7', gridRow: 8 }}
          onClick={oo('low')} onContextMenu={ro('low')}>
          <span className="rb-label">1–18</span>
          <ChipAmount amount={amt('low')} chipClass={cc('low')} />
        </div>
        <div className="rb-outside even-money" style={{ gridColumn: '7 / 11', gridRow: 8 }}
          onClick={oo('even')} onContextMenu={ro('even')}>
          <span className="rb-label">EVEN</span>
          <ChipAmount amount={amt('even')} chipClass={cc('even')} />
        </div>
        <div className="rb-outside even-money red" style={{ gridColumn: '11 / 15', gridRow: 8 }}
          onClick={oo('red')} onContextMenu={ro('red')}>
          <span className="rb-label">RED ♦</span>
          <ChipAmount amount={amt('red')} chipClass={cc('red')} />
        </div>
        <div className="rb-outside even-money black" style={{ gridColumn: '15 / 19', gridRow: 8 }}
          onClick={oo('black')} onContextMenu={ro('black')}>
          <span className="rb-label">BLK ♠</span>
          <ChipAmount amount={amt('black')} chipClass={cc('black')} />
        </div>
        <div className="rb-outside even-money" style={{ gridColumn: '19 / 23', gridRow: 8 }}
          onClick={oo('odd')} onContextMenu={ro('odd')}>
          <span className="rb-label">ODD</span>
          <ChipAmount amount={amt('odd')} chipClass={cc('odd')} />
        </div>
        <div className="rb-outside even-money" style={{ gridColumn: '23 / 27', gridRow: 8 }}
          onClick={oo('high')} onContextMenu={ro('high')}>
          <span className="rb-label">19–36</span>
          <ChipAmount amount={amt('high')} chipClass={cc('high')} />
        </div>

      </div>
    </div>
  )
}
