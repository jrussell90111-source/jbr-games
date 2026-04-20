// src/SnakebiteBoard.tsx
// SVG spiral snake board for Snake Attack! — v3d: smooth arc bands, head attached to END circle,
// true arc-midpoint token/label placement.

import React, { useMemo } from 'react'
import type { SnakeSpace } from './games/snakebite'
import type { Player } from './useSnakebite'

/* ------------------------------------------------------------------ */
/*                         SPIRAL GEOMETRY                            */
/* ------------------------------------------------------------------ */

interface Point { x: number; y: number }

/** Archimedean spiral point at parameter t ∈ [0,1] */
function spiralPoint(t: number, cx: number, cy: number, maxR: number, minR: number, totalRot: number): Point {
  const angle = Math.PI / 2 + t * totalRot    // start at bottom (6 o'clock)
  const radius = maxR - t * (maxR - minR)
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
}

interface SpiralData {
  positions: Point[]     // count entries — band endpoints at equal arc-length intervals
  midpoints: Point[]     // count entries — true arc midpoints per space (last = its own position)
  bandPaths: string[]    // count-1 entries — smooth SVG path "d" for each band (polyline along the arc)
}

/**
 * Build everything needed to render the coral-snake spiral:
 *  1. Dense sample of the spiral, then integrate to get arc length.
 *  2. Space endpoints at equal arc-length intervals (for band boundaries).
 *  3. True arc midpoints for each band (for centered tokens / labels).
 *  4. A smooth SVG path per band made from ~8 samples along its arc (not a chord).
 */
function calculateSpiralData(count: number): SpiralData {
  const cx = 300
  const cy = 330              // shifted down 30px for title breathing room
  const maxRadius = 255
  const minRadius = 45
  const totalRotation = 3.5 * Math.PI

  // Step 1: dense sampling
  const SAMPLES = 2000
  const raw: Point[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    raw.push(spiralPoint(i / SAMPLES, cx, cy, maxRadius, minRadius, totalRotation))
  }

  // Step 2: cumulative arc lengths
  const cumLen: number[] = [0]
  for (let i = 1; i <= SAMPLES; i++) {
    const dx = raw[i].x - raw[i - 1].x
    const dy = raw[i].y - raw[i - 1].y
    cumLen.push(cumLen[i - 1] + Math.sqrt(dx * dx + dy * dy))
  }
  const totalLen = cumLen[SAMPLES]

  // Point at a given arc-length fraction [0,1]
  function pointAtArcFrac(frac: number): Point {
    const clamped = Math.max(0, Math.min(1, frac))
    const targetLen = clamped * totalLen
    let lo = 0, hi = SAMPLES
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cumLen[mid] < targetLen) lo = mid + 1
      else hi = mid
    }
    if (lo === 0) return raw[0]
    const segStart = cumLen[lo - 1]
    const segEnd = cumLen[lo]
    const f = segEnd > segStart ? (targetLen - segStart) / (segEnd - segStart) : 0
    return {
      x: raw[lo - 1].x + f * (raw[lo].x - raw[lo - 1].x),
      y: raw[lo - 1].y + f * (raw[lo].y - raw[lo - 1].y),
    }
  }

  // Step 3: band endpoints at equal arc-length intervals
  const positions: Point[] = []
  for (let i = 0; i < count; i++) {
    positions.push(pointAtArcFrac(i / (count - 1)))
  }

  // Step 4a: true arc-midpoints per band (last space = its own position)
  const midpoints: Point[] = []
  for (let i = 0; i < count; i++) {
    if (i >= count - 1) {
      midpoints.push(positions[i])
    } else {
      midpoints.push(pointAtArcFrac((i + 0.5) / (count - 1)))
    }
  }

  // Step 4b: smooth band paths — each band is a polyline of SUB samples along its arc
  const SUB = 8
  const bandPaths: string[] = []
  for (let i = 0; i < count - 1; i++) {
    const a = i / (count - 1)
    const b = (i + 1) / (count - 1)
    let d = ''
    for (let j = 0; j <= SUB; j++) {
      const p = pointAtArcFrac(a + (b - a) * (j / SUB))
      d += (j === 0 ? `M${p.x.toFixed(2)},${p.y.toFixed(2)}` : ` L${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    }
    bandPaths.push(d)
  }

  return { positions, midpoints, bandPaths }
}

/* ------------------------------------------------------------------ */
/*                        COLOR MAPPING                               */
/* ------------------------------------------------------------------ */

const DARK_BROWN = '#5D3A1A'
const DARK_BROWN_STROKE = '#3E2710'

const SPACE_COLORS: Record<string, { fill: string; stroke: string }> = {
  start:  { fill: DARK_BROWN, stroke: DARK_BROWN_STROKE },
  finish: { fill: '#ffd54f', stroke: '#f9a825' },
  white:  { fill: '#e0e4ef', stroke: '#94a3b8' },
  brown:  { fill: '#c4936d', stroke: '#8d6e4a' },
  red:    { fill: '#ef5350', stroke: '#b71c1c' },
}

/* ------------------------------------------------------------------ */
/*                 SNAKE HEAD SVG — menacing side view                */
/* ------------------------------------------------------------------ */

function SnakeHead({ x, y, angle }: { x: number; y: number; angle: number }) {
  // Side-view menacing snake head — dark brown to match start band.
  // Local +x is the snout direction; local -x is the neck/back.
  return (
    <g transform={`translate(${x},${y}) rotate(${angle})`}>
      {/* Head shape — angular/triangular side profile, wider snout */}
      <path
        d="M-22,-14 C-16,-20 8,-22 26,-10 C30,-6 30,6 26,10 C8,22 -16,20 -22,14 Z"
        fill={DARK_BROWN}
        stroke={DARK_BROWN_STROKE}
        strokeWidth={2}
      />
      {/* Brow ridge — gives menacing look */}
      <path
        d="M-8,-14 C2,-18 16,-17 24,-10"
        fill="none"
        stroke={DARK_BROWN_STROKE}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* Eye — angry slit pupil */}
      <ellipse cx={6} cy={-7} rx={6} ry={5} fill="#ffe066" />
      <ellipse cx={6} cy={-7} rx={2} ry={4.5} fill="#111" />
      {/* Eye highlight */}
      <circle cx={4} cy={-9} r={1.5} fill="rgba(255,255,255,0.6)" />
      {/* Nostril */}
      <circle cx={22} cy={-4} r={1.5} fill="#111" />
      {/* Mouth line — slight snarl */}
      <path
        d="M26,0 C18,4 4,5 -18,2"
        fill="none"
        stroke={DARK_BROWN_STROKE}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Forked tongue — flicking out from mouth */}
      <path
        d="M26,0 L38,-2 L44,-8 M38,-2 L44,4"
        stroke="#c62828"
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
      />
      {/* Scale texture on head */}
      <path
        d="M-10,-8 C-6,-10 -2,-10 2,-8 M-6,0 C-2,-2 2,-2 6,0 M-14,4 C-10,2 -6,2 -2,4"
        fill="none"
        stroke="rgba(0,0,0,0.15)"
        strokeWidth={1}
        strokeLinecap="round"
      />
    </g>
  )
}

/* ------------------------------------------------------------------ */
/*                        SNAKE TAIL SVG                              */
/* ------------------------------------------------------------------ */

function SnakeTail({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${angle})`}>
      {/* Tapered tail tip */}
      <path
        d="M-18,0 Q0,-30 18,0"
        fill={DARK_BROWN}
        stroke={DARK_BROWN_STROKE}
        strokeWidth={1.5}
      />
    </g>
  )
}

/* ------------------------------------------------------------------ */
/*                          BAND WIDTH                                */
/* ------------------------------------------------------------------ */

const BAND_WIDTH = 44
const BORDER_WIDTH = 48

/* ------------------------------------------------------------------ */
/*                       BOARD COMPONENT                              */
/* ------------------------------------------------------------------ */

interface SnakeBoardProps {
  spaces: SnakeSpace[]
  players: Player[]
  currentPlayerIndex: number
  highlightSpace?: number | null
}

const SnakebiteBoard = React.memo(function SnakebiteBoard({
  spaces,
  players,
  currentPlayerIndex,
  highlightSpace,
}: SnakeBoardProps) {

  const { positions, midpoints, bandPaths } = useMemo(
    () => calculateSpiralData(spaces.length),
    [spaces.length],
  )

  // Head angle — direction from second-to-last → last position, rotated to point "forward"
  const headAngle = useMemo(() => {
    const n = positions.length
    if (n < 2) return 0
    const pA = positions[n - 2]
    const pB = positions[n - 1]
    return Math.atan2(pB.y - pA.y, pB.x - pA.x) * (180 / Math.PI) - 90
  }, [positions])

  // Tail angle — direction from second → first position (pointing outward)
  const tailAngle = useMemo(() => {
    if (positions.length < 2) return 0
    const p0 = positions[0]
    const p1 = positions[1]
    return Math.atan2(p0.y - p1.y, p0.x - p1.x) * (180 / Math.PI) - 90
  }, [positions])

  // Head anchor — shifted in the head's own forward (local +x) direction so the
  // back of the head overlaps the END circle instead of floating off of it.
  // Head back sits at local x = -22; the END circle has radius BAND_WIDTH/2 = 22.
  // forwardOffset = 6 puts the head's back 16px from the END circle center — an
  // ~6px overlap with the yellow circle, enough to read "attached" without hiding END.
  const headPos = useMemo(() => {
    if (positions.length < 2) return { x: 0, y: 0 }
    const last = positions[positions.length - 1]
    const rad = headAngle * Math.PI / 180
    const forwardOffset = 6
    return {
      x: last.x + Math.cos(rad) * forwardOffset,
      y: last.y + Math.sin(rad) * forwardOffset,
    }
  }, [positions, headAngle])

  // Group players by position for offset rendering
  const playersByPosition = useMemo(() => {
    const map = new Map<number, Player[]>()
    for (const p of players) {
      const list = map.get(p.position) || []
      list.push(p)
      map.set(p.position, list)
    }
    return map
  }, [players])

  const lastIdx = spaces.length - 1

  return (
    <svg
      viewBox="0 0 600 660"
      className="snakeboard"
      role="img"
      aria-label="Snake Attack game board — coral snake spiral from tail to head"
      shapeRendering="geometricPrecision"
    >
      {/* Background */}
      <rect x={0} y={0} width={600} height={660} rx={16} fill="#0a1628" />

      {/* Title */}
      <text x={300} y={34} textAnchor="middle" fill="#ffd54f" fontSize={22} fontWeight={700} fontFamily="sans-serif">
        Snake Attack!
      </text>

      {/* ============ CORAL SNAKE BANDS ============ */}

      {/* Band borders (drawn first, underneath fills) */}
      {spaces.map((space, i) => {
        if (i >= bandPaths.length) return null
        const colors = SPACE_COLORS[space.type] || SPACE_COLORS.white
        return (
          <path
            key={`border-${i}`}
            d={bandPaths[i]}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={BORDER_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}

      {/* Band fills (round caps + round joins = smooth snake body) */}
      {spaces.map((space, i) => {
        if (i >= bandPaths.length) return null
        const colors = SPACE_COLORS[space.type] || SPACE_COLORS.white
        const isHighlighted = highlightSpace === i
        return (
          <path
            key={`band-${i}`}
            d={bandPaths[i]}
            fill="none"
            stroke={isHighlighted ? '#fff' : colors.fill}
            strokeWidth={BAND_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={isHighlighted ? 0.9 : 1}
            className={isHighlighted ? 'snakeband-highlight' : undefined}
          />
        )
      })}

      {/* Last space (finish) — filled circle at the last position */}
      {(() => {
        const lastPos = positions[lastIdx]
        if (!lastPos) return null
        const colors = SPACE_COLORS[spaces[lastIdx].type] || SPACE_COLORS.white
        const isHighlighted = highlightSpace === lastIdx
        return (
          <circle
            cx={lastPos.x}
            cy={lastPos.y}
            r={BAND_WIDTH / 2}
            fill={isHighlighted ? '#fff' : colors.fill}
            stroke={colors.stroke}
            strokeWidth={2}
          />
        )
      })()}

      {/* START label — drawn under the head (no conflict, START is at the outer tail) */}
      {spaces.map((space, i) => {
        if (space.type !== 'start') return null
        const mid = midpoints[i]
        if (!mid) return null
        return (
          <text
            key={`label-start-${i}`}
            x={mid.x}
            y={mid.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fontSize={9}
            fontWeight={700}
            fontFamily="sans-serif"
            pointerEvents="none"
          >
            START
          </text>
        )
      })}

      {/* ============ SNAKE TAIL (outside, position 0) ============ */}
      {positions[0] && (
        <SnakeTail
          x={positions[0].x}
          y={positions[0].y}
          angle={tailAngle}
        />
      )}

      {/* ============ SNAKE HEAD (attached to END circle) ============ */}
      <SnakeHead x={headPos.x} y={headPos.y} angle={headAngle} />

      {/* END label — rendered AFTER the head so it remains readable over the dark head */}
      {(() => {
        const lastPos = positions[lastIdx]
        if (!lastPos) return null
        return (
          <text
            x={lastPos.x}
            y={lastPos.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#3a2106"
            fontSize={10}
            fontWeight={800}
            fontFamily="sans-serif"
            pointerEvents="none"
            style={{
              paintOrder: 'stroke',
              stroke: '#ffd54f',
              strokeWidth: 3,
              strokeLinejoin: 'round',
            }}
          >
            END
          </text>
        )
      })()}

      {/* ============ PLAYER MARKERS ============ */}
      {Array.from(playersByPosition.entries()).map(([pos, playersAtPos]) => {
        const mid = midpoints[pos]
        if (!mid) return null
        // Offset tokens when multiple players share a space
        const offsets = playersAtPos.length === 1
          ? [{ dx: 0, dy: 0 }]
          : playersAtPos.map((_, i) => {
              const angle = (i / playersAtPos.length) * Math.PI * 2 - Math.PI / 2
              return { dx: Math.cos(angle) * 10, dy: Math.sin(angle) * 10 }
            })
        return playersAtPos.map((p, i) => {
          const isCurrent = players.indexOf(p) === currentPlayerIndex
          return (
            <g key={p.id}>
              {isCurrent && (
                <circle
                  cx={mid.x + offsets[i].dx}
                  cy={mid.y + offsets[i].dy}
                  r={22}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={3}
                  opacity={0.8}
                  className="playermarker"
                />
              )}
              <circle
                cx={mid.x + offsets[i].dx}
                cy={mid.y + offsets[i].dy}
                r={14}
                fill={p.color}
                stroke="#fff"
                strokeWidth={2}
              />
              <text
                x={mid.x + offsets[i].dx}
                y={mid.y + offsets[i].dy + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={14}
                pointerEvents="none"
              >
                {p.emoji}
              </text>
            </g>
          )
        })
      })}
    </svg>
  )
})

export default SnakebiteBoard
