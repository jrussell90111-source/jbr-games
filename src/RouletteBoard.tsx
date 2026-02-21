// src/RouletteBoard.tsx
import React, { useMemo } from 'react'

type Phase = 'bet' | 'spin' | 'show'
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
  if (n === 0) return 'green'
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

// ─── chip display ─────────────────────────────────────────────────────────────
function ChipAmount({ amount }: { amount: number }) {
  if (amount <= 0) return null
  const rounded = Math.round(amount)
  const label = LABEL_WITH_DOLLAR ? `$${rounded}` : String(rounded)
  return (
    <div className="rb-chips" aria-label={`${label} chip`}>
      <div className="rb-chip">
        <span className="rb-chip-label">{label}</span>
      </div>
    </div>
  )
}

// ─── dolly ────────────────────────────────────────────────────────────────────
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
  n, disabled, color, amount, showDolly, onAdd, onRemove
}: {
  n: number
  disabled: boolean
  color: 'red' | 'black' | 'green'
  amount: number
  showDolly: boolean
  onAdd: () => void
  onRemove: () => void
}) {
  return (
    <div
      className={`rb-cell num ${color}${disabled ? ' disabled' : ''}`}
      onClick={(e) => { e.preventDefault(); if (!disabled) onAdd() }}
      onContextMenu={(e) => { e.preventDefault(); if (!disabled) onRemove() }}
      role="button"
      title={`${n} — Left-click: +$${INSIDE_UNIT}, Right-click: -$${INSIDE_UNIT}`}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) onAdd() }}
    >
      <span className="rb-num-label">{n}</span>
      <ChipAmount amount={amount} />
      {showDolly && <Dolly label={n} />}
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
//
// Grid layout — 27 columns × 8 rows
//
//  Col  1 : zero (56 px)
//  Col  2 : hit zone col between zero and numbers (12 px)
//  Cols 3,5,7…25 (index = 2c+1 for c=1..12) : number columns (1fr each)
//  Cols 4,6,8…26 (index = 2c+2 for c=1..12) : vertical hit / corner cols (12 px each)
//  Col 27 : 2:1 column-bet cells (52 px)
//
//  Row 1 : top-number row    (54 px) — numbers 3,6,9…36
//  Row 2 : H-split hit row   (12 px)
//  Row 3 : mid-number row    (54 px) — numbers 2,5,8…35
//  Row 4 : H-split hit row   (12 px)
//  Row 5 : bot-number row    (54 px) — numbers 1,4,7…34
//  Row 6 : street/line strip (12 px)
//  Row 7 : dozens            (42 px)
//  Row 8 : even-money bets   (42 px)
//
// Number formula:  n at column c (1..12), number-row r (1=top, 3=bot)
//   n = 3c − (r−1)   →  c=1,r=1→3   c=1,r=3→1   c=12,r=1→36   c=12,r=3→34

export default function RouletteBoard({
  g,
  winnerNumber = null,
}: {
  g: RouletteAPI
  winnerNumber?: number | null
}) {
  const disabled = g.phase !== 'bet'
  const amt = useAmount(g.bets)

  const oi = (type: string, nums?: number | number[]) =>
    () => addInside(g, type, nums)
  const ri = (type: string, nums?: number | number[]) =>
    (e: React.MouseEvent) => { e.preventDefault(); removeInside(g, amt(type, nums), type, nums) }
  const oo = (type: string) =>
    () => addOutside(g, amt(type), type)
  const ro = (type: string) =>
    (e: React.MouseEvent) => { e.preventDefault(); removeOutside(g, amt(type), type) }

  return (
    <div className="rb-board">
      <div className="rb-htable">

        {/* ── ZERO (col 1, rows 1-5) ──────────────────────────────────────── */}
        <div className="rb-zero-cell" style={{ gridColumn: 1, gridRow: '1 / 6' }}>
          <NumberCell
            n={0} disabled={disabled} color="green"
            amount={amt('straight', 0)} showDolly={winnerNumber === 0}
            onAdd={oi('straight', 0)}
            onRemove={() => removeInside(g, amt('straight', 0), 'straight', 0)}
          />
        </div>

        {/* ── ZERO COMBOS (col 2: the thin hit column next to zero) ─────── */}
        {/* trio023 [0,2,3] — between top-row 3 and mid-row 2 */}
        <Hit cls="trio" gc={2} gr={2}
          onClick={oi('trio023', [0,2,3])} onCtx={ri('trio023', [0,2,3])}>
          <ChipAmount amount={amt('trio023', [0,2,3])} />
        </Hit>
        {/* first4 [0,1,2,3] — mid number row */}
        <Hit cls="first4" gc={2} gr={3}
          onClick={oi('first4', [0,1,2,3])} onCtx={ri('first4', [0,1,2,3])}>
          <ChipAmount amount={amt('first4', [0,1,2,3])} />
        </Hit>
        {/* trio012 [0,1,2] — between mid-row 2 and bot-row 1 */}
        <Hit cls="trio" gc={2} gr={4}
          onClick={oi('trio012', [0,1,2])} onCtx={ri('trio012', [0,1,2])}>
          <ChipAmount amount={amt('trio012', [0,1,2])} />
        </Hit>

        {/* ── 12 NUMBER COLUMNS ───────────────────────────────────────────── */}
        {Array.from({ length: 12 }, (_, idx) => {
          const c  = idx + 1          // column index 1..12
          const gc = 2 * c + 1        // CSS grid column for numbers (3,5,7…25)
          const hc = 2 * c + 2        // CSS grid hit column after this col (4,6,8…26)
          const n3 = 3 * c            // top-row number (row 1)
          const n2 = 3 * c - 1        // mid-row number (row 3)
          const n1 = 3 * c - 2        // bot-row number (row 5)

          return (
            <React.Fragment key={c}>

              {/* Number cells */}
              <div style={{ gridColumn: gc, gridRow: 1 }}>
                <NumberCell n={n3} disabled={disabled} color={colorOf(n3)}
                  amount={amt('straight', n3)} showDolly={winnerNumber === n3}
                  onAdd={oi('straight', n3)}
                  onRemove={() => removeInside(g, amt('straight', n3), 'straight', n3)} />
              </div>
              <div style={{ gridColumn: gc, gridRow: 3 }}>
                <NumberCell n={n2} disabled={disabled} color={colorOf(n2)}
                  amount={amt('straight', n2)} showDolly={winnerNumber === n2}
                  onAdd={oi('straight', n2)}
                  onRemove={() => removeInside(g, amt('straight', n2), 'straight', n2)} />
              </div>
              <div style={{ gridColumn: gc, gridRow: 5 }}>
                <NumberCell n={n1} disabled={disabled} color={colorOf(n1)}
                  amount={amt('straight', n1)} showDolly={winnerNumber === n1}
                  onAdd={oi('straight', n1)}
                  onRemove={() => removeInside(g, amt('straight', n1), 'straight', n1)} />
              </div>

              {/* Horizontal splits (same column, between number rows) */}
              {/* Between top (n3) and mid (n2): hit row 2 */}
              <Hit cls="hsplit" gc={gc} gr={2}
                onClick={oi('split', [n2, n3])} onCtx={ri('split', [n2, n3])}>
                <ChipAmount amount={amt('split', [n2, n3])} />
              </Hit>
              {/* Between mid (n2) and bot (n1): hit row 4 */}
              <Hit cls="hsplit" gc={gc} gr={4}
                onClick={oi('split', [n1, n2])} onCtx={ri('split', [n1, n2])}>
                <ChipAmount amount={amt('split', [n1, n2])} />
              </Hit>

              {/* Street bet (all 3 in this column): row 6 */}
              <Hit cls="street" gc={gc} gr={6}
                onClick={oi('street', [n1, n2, n3])} onCtx={ri('street', [n1, n2, n3])}>
                <ChipAmount amount={amt('street', [n1, n2, n3])} />
              </Hit>

              {/* Between-column hits (only when a next column exists) */}
              {c < 12 && (
                <>
                  {/* Vertical splits (between col c and c+1, each number row) */}
                  <Hit cls="vsplit" gc={hc} gr={1}
                    onClick={oi('split', [n3, n3+3])} onCtx={ri('split', [n3, n3+3])}>
                    <ChipAmount amount={amt('split', [n3, n3+3])} />
                  </Hit>
                  <Hit cls="vsplit" gc={hc} gr={3}
                    onClick={oi('split', [n2, n2+3])} onCtx={ri('split', [n2, n2+3])}>
                    <ChipAmount amount={amt('split', [n2, n2+3])} />
                  </Hit>
                  <Hit cls="vsplit" gc={hc} gr={5}
                    onClick={oi('split', [n1, n1+3])} onCtx={ri('split', [n1, n1+3])}>
                    <ChipAmount amount={amt('split', [n1, n1+3])} />
                  </Hit>

                  {/* Corners (between col c and c+1, between number rows) */}
                  <Hit cls="corner" gc={hc} gr={2}
                    onClick={oi('corner', [n2, n3, n2+3, n3+3])}
                    onCtx={ri('corner', [n2, n3, n2+3, n3+3])}>
                    <ChipAmount amount={amt('corner', [n2, n3, n2+3, n3+3])} />
                  </Hit>
                  <Hit cls="corner" gc={hc} gr={4}
                    onClick={oi('corner', [n1, n2, n1+3, n2+3])}
                    onCtx={ri('corner', [n1, n2, n1+3, n2+3])}>
                    <ChipAmount amount={amt('corner', [n1, n2, n1+3, n2+3])} />
                  </Hit>

                  {/* Line (double street: col c + col c+1) */}
                  <Hit cls="line" gc={hc} gr={6}
                    onClick={oi('line', [n1, n2, n3, n1+3, n2+3, n3+3])}
                    onCtx={ri('line', [n1, n2, n3, n1+3, n2+3, n3+3])}>
                    <ChipAmount amount={amt('line', [n1, n2, n3, n1+3, n2+3, n3+3])} />
                  </Hit>
                </>
              )}
            </React.Fragment>
          )
        })}

        {/* ── 2:1 COLUMN BETS (col 27, rows 1/3/5) ────────────────────────── */}
        {/* column3 = top row (3,6,9…36) */}
        <div className="rb-col21" style={{ gridColumn: 27, gridRow: 1 }}
          onClick={oo('column3')} onContextMenu={ro('column3')}>
          <span className="rb-label">2:1</span>
          <ChipAmount amount={amt('column3')} />
        </div>
        {/* column2 = mid row (2,5,8…35) */}
        <div className="rb-col21" style={{ gridColumn: 27, gridRow: 3 }}
          onClick={oo('column2')} onContextMenu={ro('column2')}>
          <span className="rb-label">2:1</span>
          <ChipAmount amount={amt('column2')} />
        </div>
        {/* column1 = bot row (1,4,7…34) */}
        <div className="rb-col21" style={{ gridColumn: 27, gridRow: 5 }}
          onClick={oo('column1')} onContextMenu={ro('column1')}>
          <span className="rb-label">2:1</span>
          <ChipAmount amount={amt('column1')} />
        </div>

        {/* ── DOZENS (row 7) ───────────────────────────────────────────────── */}
        {/* 1st 12 (1–12): cols c=1..4  →  grid cols 3–10  →  3 / 11 */}
        <div className="rb-outside dozen" style={{ gridColumn: '3 / 11', gridRow: 7 }}
          onClick={oo('dozen1')} onContextMenu={ro('dozen1')}>
          <span className="rb-label">1st 12</span>
          <ChipAmount amount={amt('dozen1')} />
        </div>
        {/* 2nd 12 (13–24): cols c=5..8  →  grid cols 11–18  →  11 / 19 */}
        <div className="rb-outside dozen" style={{ gridColumn: '11 / 19', gridRow: 7 }}
          onClick={oo('dozen2')} onContextMenu={ro('dozen2')}>
          <span className="rb-label">2nd 12</span>
          <ChipAmount amount={amt('dozen2')} />
        </div>
        {/* 3rd 12 (25–36): cols c=9..12  →  grid cols 19–26  →  19 / 27 */}
        <div className="rb-outside dozen" style={{ gridColumn: '19 / 27', gridRow: 7 }}
          onClick={oo('dozen3')} onContextMenu={ro('dozen3')}>
          <span className="rb-label">3rd 12</span>
          <ChipAmount amount={amt('dozen3')} />
        </div>

        {/* ── EVEN-MONEY BETS (row 8, 6 × 4-col spans across cols 3–26) ──── */}
        <div className="rb-outside even-money" style={{ gridColumn: '3 / 7', gridRow: 8 }}
          onClick={oo('low')} onContextMenu={ro('low')}>
          <span className="rb-label">1–18</span>
          <ChipAmount amount={amt('low')} />
        </div>
        <div className="rb-outside even-money" style={{ gridColumn: '7 / 11', gridRow: 8 }}
          onClick={oo('even')} onContextMenu={ro('even')}>
          <span className="rb-label">EVEN</span>
          <ChipAmount amount={amt('even')} />
        </div>
        <div className="rb-outside even-money red" style={{ gridColumn: '11 / 15', gridRow: 8 }}
          onClick={oo('red')} onContextMenu={ro('red')}>
          <span className="rb-label">RED ♦</span>
          <ChipAmount amount={amt('red')} />
        </div>
        <div className="rb-outside even-money black" style={{ gridColumn: '15 / 19', gridRow: 8 }}
          onClick={oo('black')} onContextMenu={ro('black')}>
          <span className="rb-label">BLK ♠</span>
          <ChipAmount amount={amt('black')} />
        </div>
        <div className="rb-outside even-money" style={{ gridColumn: '19 / 23', gridRow: 8 }}
          onClick={oo('odd')} onContextMenu={ro('odd')}>
          <span className="rb-label">ODD</span>
          <ChipAmount amount={amt('odd')} />
        </div>
        <div className="rb-outside even-money" style={{ gridColumn: '23 / 27', gridRow: 8 }}
          onClick={oo('high')} onContextMenu={ro('high')}>
          <span className="rb-label">19–36</span>
          <ChipAmount amount={amt('high')} />
        </div>

      </div>
    </div>
  )
}
