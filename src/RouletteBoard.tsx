// src/RouletteBoard.tsx
import React, { useMemo } from 'react'

type Phase = 'bet' | 'spin' | 'show'
type RouletteAPI = {
  phase: Phase
  bets: any[] // { type, amount, number? } and/or { numbers?: number[] }
  addChip: (type: any, nums?: number | number[]) => void
  removeChip: (type: any, nums?: number | number[]) => void
  addAmount?: (type: any, nums: number | number[] | undefined, delta: number) => void
  removeAmount?: (type: any, nums: number | number[] | undefined, delta: number) => void
}

const INSIDE_UNIT = 2
const OUTSIDE_MIN = 10
const OUTSIDE_UNIT = 2
const LABEL_WITH_DOLLAR = true

const RED_SET = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
function colorOf(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}

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

  const amt = (type: string, nums?: number | number[]) => {
    const arr = typeof nums === 'number' ? [nums] : (nums ?? [])
    const key = `${type}:${arr.slice().sort((a, c) => a - c).join('-')}`
    return map.get(key) ?? 0
  }
  return amt
}

function ChipAmount({ amount }: { amount: number }) {
  if (amount <= 0) return null
  const rounded = Math.round(amount)
  const label = LABEL_WITH_DOLLAR ? `$${rounded}` : String(rounded)
  return (
    <div className="rb-chips" aria-label={`${label} chip`}>
      <div className="rb-chip" style={{ display: 'grid', placeItems: 'center', fontWeight: 800 }}>
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

function isOutsideType(t: string): boolean {
  return (
    t === 'red' || t === 'black' ||
    t === 'even' || t === 'odd' ||
    t === 'low' || t === 'high' ||
    t === 'dozen1' || t === 'dozen2' || t === 'dozen3' ||
    t === 'column1' || t === 'column2' || t === 'column3'
  )
}
function addExact(g: RouletteAPI, type: string, nums: number | number[] | undefined, delta: number, fallbackUnit: number) {
  if (delta <= 0) return
  if (typeof g.addAmount === 'function') { g.addAmount(type, nums, delta); return }
  const steps = Math.round(delta / fallbackUnit)
  for (let i = 0; i < steps; i++) g.addChip(type, nums)
}
function removeExact(g: RouletteAPI, type: string, nums: number | number[] | undefined, delta: number, fallbackUnit: number) {
  if (delta <= 0) return
  if (typeof g.removeAmount === 'function') { g.removeAmount(type, nums, delta); return }
  const steps = Math.round(delta / fallbackUnit)
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

function NumberCell({
  n, disabled, amount, showDolly, onAdd, onRemove
}: {
  n: number
  disabled: boolean
  amount: number
  showDolly: boolean
  onAdd: () => void
  onRemove: () => void
}) {
  const kind = colorOf(n)
  return (
    <div
      className={`rb-cell num ${disabled ? 'disabled' : ''}`}
      onClick={(e) => { e.preventDefault(); if (!disabled) onAdd() }}
      onContextMenu={(e) => { e.preventDefault(); if (!disabled) onRemove() }}
      role="button"
      title="Left-click: +$2, Right-click: -$2"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) onAdd() }}
    >
      <div className={`rb-oval ${kind}`}>
        <span className="rb-oval-num">{n}</span>
      </div>
      <ChipAmount amount={amount} />
      {showDolly && <Dolly label={n} />}
    </div>
  )
}

const rowStart = (r: number) => (r - 1) * 3 + 1
const numRowIndex = (r: number) => 2 * r

export default function RouletteBoard({
  g,
  winnerNumber = null,
  spinMs = 0,
}: {
  g: RouletteAPI,
  winnerNumber?: number | null,
  spinMs?: number
}) {
  const disabled = g.phase !== 'bet'
  const amt = useAmount(g.bets)

  return (
    <div className="rb-board">
      {/* ==== SLIM WHEEL (unchanged) ==== */}
      <div className="rw-wrap" aria-label="Roulette wheel">
        <div
          className={`rw-wheel ${g.phase === 'spin' ? 'is-spinning' : ''}`}
          style={{ ['--spinMs' as any]: `${Math.max(1, spinMs || 0)}ms` }}
        >
          <div className="rw-ring" />
        </div>
        <div className="rw-pointer" />
      </div>

      {/* ======= NEW: SIDE-RAIL LAYOUT WRAPPER ======= */}
      <div className="rb-layout">
        {/* CENTER — NUMBERS GRID (unchanged inside logic) */}
        <div className="rb-grid">
          {/* Right rail (internal) for streets/lines stays */}
          <div className="rb-rail" aria-hidden style={{ gridColumn: 4, gridRow: '1 / -1' }} />

          {/* ZERO */}
          <div className="rb-zero" style={{ gridColumn: '1 / span 3', gridRow: 1 }}>
            <NumberCell
              n={0}
              disabled={disabled}
              amount={amt('straight', 0)}
              showDolly={winnerNumber === 0}
              onAdd={() => addInside(g, 'straight', 0)}
              onRemove={() => removeInside(g, amt('straight', 0), 'straight', 0)}
            />
          </div>

          {/* 0-combos */}
          <div className="rb-hit trio"
               style={{ gridRow: '1 / span 2', gridColumn: 1 }}
               onClick={() => addInside(g, 'trio012', [0, 1, 2])}
               onContextMenu={(e) => { e.preventDefault(); removeInside(g, amt('trio012', [0,1,2]), 'trio012', [0,1,2]) }}>
            <ChipAmount amount={amt('trio012', [0,1,2])} />
          </div>
          <div className="rb-hit first4"
               style={{ gridRow: '1 / span 2', gridColumn: 2 }}
               onClick={() => addInside(g, 'first4', [0, 1, 2, 3])}
               onContextMenu={(e) => { e.preventDefault(); removeInside(g, amt('first4', [0,1,2,3]), 'first4', [0,1,2,3]) }}>
            <ChipAmount amount={amt('first4', [0,1,2,3])} />
          </div>
          <div className="rb-hit trio"
               style={{ gridRow: '1 / span 2', gridColumn: 3 }}
               onClick={() => addInside(g, 'trio023', [0, 2, 3])}
               onContextMenu={(e) => { e.preventDefault(); removeInside(g, amt('trio023', [0,2,3]), 'trio023', [0,2,3]) }}>
            <ChipAmount amount={amt('trio023', [0,2,3])} />
          </div>

          {/* 12 rows of numbers + inside hits */}
          {Array.from({ length: 12 }, (_, idx) => {
            const r = idx + 1
            const row = numRowIndex(r)
            const a = rowStart(r), b = a + 1, c = a + 2
            return (
              <React.Fragment key={r}>
                <div className="c1" style={{ gridRow: row, gridColumn: 1 }}>
                  <NumberCell
                    n={a} disabled={disabled}
                    amount={amt('straight', a)} showDolly={winnerNumber === a}
                    onAdd={() => addInside(g, 'straight', a)}
                    onRemove={() => removeInside(g, amt('straight', a), 'straight', a)}
                  />
                </div>
                <div className="c2" style={{ gridRow: row, gridColumn: 2 }}>
                  <NumberCell
                    n={b} disabled={disabled}
                    amount={amt('straight', b)} showDolly={winnerNumber === b}
                    onAdd={() => addInside(g, 'straight', b)}
                    onRemove={() => removeInside(g, amt('straight', b), 'straight', b)}
                  />
                </div>
                <div className="c3" style={{ gridRow: row, gridColumn: 3 }}>
                  <NumberCell
                    n={c} disabled={disabled}
                    amount={amt('straight', c)} showDolly={winnerNumber === c}
                    onAdd={() => addInside(g, 'straight', c)}
                    onRemove={() => removeInside(g, amt('straight', c), 'straight', c)}
                  />
                </div>

                {/* Horizontal splits */}
                <div className="rb-hit hsplit"
                     style={{ gridRow: row, gridColumn: '1 / span 2' }}
                     onClick={() => addInside(g, 'split', [a, b])}
                     onContextMenu={(e) => { e.preventDefault(); removeInside(g, amt('split', [a, b]), 'split', [a, b]) }}>
                  <ChipAmount amount={amt('split', [a, b])} />
                </div>
                <div className="rb-hit hsplit"
                     style={{ gridRow: row, gridColumn: '2 / span 2' }}
                     onClick={() => addInside(g, 'split', [b, c])}
                     onContextMenu={(e) => { e.preventDefault(); removeInside(g, amt('split', [b, c]), 'split', [b, c]) }}>
                  <ChipAmount amount={amt('split', [b, c])} />
                </div>

                {/* Street at internal rail */}
                <div className="rb-hit street"
                     style={{ gridRow: row, gridColumn: 4 }}
                     onClick={() => addInside(g, 'street', [a, b, c])}
                     onContextMenu={(e) => { e.preventDefault(); removeInside(g, amt('street', [a, b, c]), 'street', [a, b, c]) }}>
                  <ChipAmount amount={amt('street', [a, b, c])} />
                </div>

                {/* With next row */}
                {r < 12 && (
                  <>
                    {/* Vertical splits */}
                    <div className="rb-hit vsplit"
                         style={{ gridRow: `${row} / span 2`, gridColumn: 1 }}
                         onClick={() => addInside(g, 'split', [a, a + 3])}
                         onContextMenu={(e) => { e.preventDefault(); removeInside(g, amt('split', [a, a + 3]), 'split', [a, a + 3]) }}>
                      <ChipAmount amount={amt('split', [a, a + 3])} />
                    </div>
                    <div className="rb-hit vsplit"
                         style={{ gridRow: `${row} / span 2`, gridColumn: 2 }}
                         onClick={() => addInside(g, 'split', [b, b + 3])}
                         onContextMenu={(e) => { e.preventDefault(); removeInside(g, amt('split', [b, b + 3]), 'split', [b, b + 3]) }}>
                      <ChipAmount amount={amt('split', [b, b + 3])} />
                    </div>
                    <div className="rb-hit vsplit"
                         style={{ gridRow: `${row} / span 2`, gridColumn: 3 }}
                         onClick={() => addInside(g, 'split', [c, c + 3])}
                         onContextMenu={(e) => { e.preventDefault(); removeInside(g, amt('split', [c, c + 3]), 'split', [c, c + 3]) }}>
                      <ChipAmount amount={amt('split', [c, c + 3])} />
                    </div>

                    {/* Corners */}
                    <div className="rb-hit corner"
                         style={{ gridRow: `${row} / span 2`, gridColumn: '1 / span 2' }}
                         onClick={() => addInside(g, 'corner', [a, b, a + 3, b + 3])}
                         onContextMenu={(e) => { e.preventDefault(); removeInside(g, amt('corner', [a, b, a + 3, b + 3]), 'corner', [a, b, a + 3, b + 3]) }}>
                      <ChipAmount amount={amt('corner', [a, b, a + 3, b + 3])} />
                    </div>
                    <div className="rb-hit corner"
                         style={{ gridRow: `${row} / span 2`, gridColumn: '2 / span 2' }}
                         onClick={() => addInside(g, 'corner', [b, c, b + 3, c + 3])}
                         onContextMenu={(e) => { e.preventDefault(); removeInside(g, amt('corner', [b, c, b + 3, c + 3]), 'corner', [b, c, b + 3, c + 3]) }}>
                      <ChipAmount amount={amt('corner', [b, c, b + 3, c + 3])} />
                    </div>

                    {/* Line (double street) */}
                    <div className="rb-hit line"
                         style={{ gridRow: `${row} / span 2`, gridColumn: 4 }}
                         onClick={() => addInside(g, 'line', [a, b, c, a + 3, b + 3, c + 3])}
                         onContextMenu={(e) => { e.preventDefault(); removeInside(g, amt('line', [a, b, c, a + 3, b + 3, c + 3]), 'line', [a, b, c, a + 3, b + 3, c + 3]) }}>
                      <ChipAmount amount={amt('line', [a, b, c, a + 3, b + 3, c + 3])} />
                    </div>
                  </>
                )}
              </React.Fragment>
            )
          })}
        </div>

        {/* RIGHT RAIL — Even-money */}
        <div className="rb-rail-right">
          <div
            className="rb-rail-cell"
            onClick={() => addOutside(g, amt('low'), 'low')}
            onContextMenu={(e) => { e.preventDefault(); removeOutside(g, amt('low'), 'low') }}
          >
            <div className="rb-label">1–18</div>
            <ChipAmount amount={amt('low')} />
          </div>
          <div
            className="rb-rail-cell"
            onClick={() => addOutside(g, amt('even'), 'even')}
            onContextMenu={(e) => { e.preventDefault(); removeOutside(g, amt('even'), 'even') }}
          >
            <div className="rb-label">EVEN</div>
            <ChipAmount amount={amt('even')} />
          </div>
          <div
            className="rb-rail-cell rb-rail-red"
            onClick={() => addOutside(g, amt('red'), 'red')}
            onContextMenu={(e) => { e.preventDefault(); removeOutside(g, amt('red'), 'red') }}
          >
            <div className="rb-label">RED</div>
            <ChipAmount amount={amt('red')} />
          </div>
          <div
            className="rb-rail-cell rb-rail-black"
            onClick={() => addOutside(g, amt('black'), 'black')}
            onContextMenu={(e) => { e.preventDefault(); removeOutside(g, amt('black'), 'black') }}
          >
            <div className="rb-label">BLACK</div>
            <ChipAmount amount={amt('black')} />
          </div>
          <div
            className="rb-rail-cell"
            onClick={() => addOutside(g, amt('odd'), 'odd')}
            onContextMenu={(e) => { e.preventDefault(); removeOutside(g, amt('odd'), 'odd') }}
          >
            <div className="rb-label">ODD</div>
            <ChipAmount amount={amt('odd')} />
          </div>
          <div
            className="rb-rail-cell"
            onClick={() => addOutside(g, amt('high'), 'high')}
            onContextMenu={(e) => { e.preventDefault(); removeOutside(g, amt('high'), 'high') }}
          >
            <div className="rb-label">19–36</div>
            <ChipAmount amount={amt('high')} />
          </div>
        </div>
      </div>

      {/* LEFT RAIL — Dozens */}
      <div className="rb-rail-left">
        <div className="rb-dozens-stack">
          <div
            className="rb-rail-cell rb-dozen rb-dozen-1"
            onClick={() => addOutside(g, amt('dozen1'), 'dozen1')}
            onContextMenu={(e) => { e.preventDefault(); removeOutside(g, amt('dozen1'), 'dozen1') }}
  >
            <div className="rb-label">1st 12</div>
            <ChipAmount amount={amt('dozen1')} />
          </div>
          <div
            className="rb-rail-cell rb-dozen rb-dozen-2"
            onClick={() => addOutside(g, amt('dozen2'), 'dozen2')}
            onContextMenu={(e) => { e.preventDefault(); removeOutside(g, amt('dozen2'), 'dozen2') }}
          >
            <div className="rb-label">2nd 12</div>
            <ChipAmount amount={amt('dozen2')} />
          </div>
          <div
            className="rb-rail-cell rb-dozen rb-dozen-3"
            onClick={() => addOutside(g, amt('dozen3'), 'dozen3')}
            onContextMenu={(e) => { e.preventDefault(); removeOutside(g, amt('dozen3'), 'dozen3') }}
          >
            <div className="rb-label">3rd 12</div>
            <ChipAmount amount={amt('dozen3')} />
        </div>
      </div>
    </div>

      {/* ======= BOTTOM: Columns (2:1) aligned with each number column ======= */}
      <div className="rb-cols-bottom">
        <div
          className="rb-col-cell"
          onClick={() => addOutside(g, amt('column1'), 'column1')}
          onContextMenu={(e) => { e.preventDefault(); removeOutside(g, amt('column1'), 'column1') }}
        >
          <div className="rb-label">2:1</div>
          <ChipAmount amount={amt('column1')} />
        </div>
        <div
          className="rb-col-cell"
          onClick={() => addOutside(g, amt('column2'), 'column2')}
          onContextMenu={(e) => { e.preventDefault(); removeOutside(g, amt('column2'), 'column2') }}
        >
          <div className="rb-label">2:1</div>
          <ChipAmount amount={amt('column2')} />
        </div>
        <div
          className="rb-col-cell"
          onClick={() => addOutside(g, amt('column3'), 'column3')}
          onContextMenu={(e) => { e.preventDefault(); removeOutside(g, amt('column3'), 'column3') }}
        >
          <div className="rb-label">2:1</div>
          <ChipAmount amount={amt('column3')} />
        </div>
      </div>
    </div>
  )
}

