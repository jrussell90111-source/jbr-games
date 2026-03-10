// src/SnakebiteBoard.tsx
// SVG spiral snake board for Snake Attack! — v3c: tail at bottom, head at ~2 o'clock, arc-midpoint labels

import React, { useMemo } from 'react'
import type { SnakeSpace } from './games/snakebite'
import type { Player } from './useSnakebite'

/* ------------------------------------------------------------------ */
/*                         SPIRAL GEOMETRY                             */
/* ------------------------------------------------------------------ */

interface Point { x: number; y: number }

/** Archimedean spiral point at parameter t ∈ [0,1] */
function spiralPoint(t: number, cx: number, cy: number, maxR: number, minR: number, totalRot: number): Point {
  const angle = Math.PI / 2 + t * totalRot   // start at bottom (6 o'clock)
  const radius = maxR - t * (maxR - minR)
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
}

/**
 * Calculate evenly-spaced spiral positions AND true arc-length midpoints.
 * 1. Sample a dense set of points along the spiral
 * 2. Compute cumulative arc lengths
 * 3. Re-sample at equal arc-length intervals for band endpoints
 * 4. Compute midpoints at half-step arc lengths (true center of each band)
 */
function calculateSpiralData(count: number): { positions: Point[]; midpoints: Point[] } {
  const cx = 300
  const cy = 330   // shifted down 30px for title breathing room
  const maxRadius = 255
  const minRadius = 30
  const totalRotation = 3.2 * Math.PI

  // Step 1: Dense sampling
  const SAMPLES = 2000
  const raw: Point[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    raw.push(spiralPoint(i / SAMPLES, cx, cy, maxRadius, minRadius, totalRotation))
  }

  // Step 2: Cumulative arc lengths
  const cumLen: number[] = [0]
  for (let i = 1; i <= SAMPLES; i++) {
    const dx = raw[i].x - raw[i - 1].x
    const dy = raw[i].y - raw[i - 1].y
    cumLen.push(cumLen[i - 1] + Math.sqrt(dx * dx + dy * dy))
  }
  const totalLen = cumLen[SAMPLES]

  // Helper: get point at a given arc-length fraction [0,1]
  function pointAtArcFrac(frac: number): Point {
    const targetLen = frac * totalLen
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

  // Step 3: Band endpoint positions at equal arc-length intervals
  const positions: Point[] = []
  for (let i = 0; i < count; i++) {
    positions.push(pointAtArcFrac(i / (count - 1)))
  }

  // Step 4: True arc-length midpoints for each band
  //   Band i spans from positions[i] to positions[i+1],
  //   so its midpoint is at arc fraction (i + 0.5) / (count - 1)
  const midpoints: Point[] = []
  for (let i = 0; i < count; i++) {
    if (i >= count - 1) {
      midpoints.push(positions[i]) // last space (finish) uses its own position
    } else {
      midpoints.push(pointAtArcFrac((i + 0.5) / (count - 1)))
    }
  }

  return { positions, midpoints }
}

/* ------------------------------------------------------------------ */
/*                        COLOR MAPPING                                */
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
/*                   SNAKE HEAD SVG — menacing side view               */
/* ------------------------------------------------------------------ */

function SnakeHead({ x, y, angle }: { x: number; y: number; angle: number }) {
  // Side-view menacing snake head — dark brown to match start band
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
/*                        SNAKE TAIL SVG                               */
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
/*                         BAND WIDTH                                  */
/* ------------------------------------------------------------------ */

const BAND_WIDTH = 44
const BORDER_WIDTH = 48

/* ------------------------------------------------------------------ */
/*                         BOARD COMPONENT                             */
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

  const { positions, midpoints: bandMidpoints } = useMemo(
    () => calculateSpiralData(spaces.length),
    [spaces.length],
  )

  // Head angle: direction from second-to-last → last position, rotated to point "forward"
  const headAngle = useMemo(() => {
    const n = positions.length
    if (n < 2) return 0
    const pA = positions[n - 2]
    const pB = positions[n - 1]
    return Math.atan2(pB.y - pA.y, pB.x - pA.x) * (180 / Math.PI) - 90
  }, [positions])

  // Tail angle: direction from second → first position (pointing outward)
  const tailAngle = useMemo(() => {
    if (positions.length < 2) return 0
    const p0 = positions[0]
    const p1 = positions[1]
    return Math.atan2(p0.y - p1.y, p0.x - p1.x) * (180 / Math.PI) - 90
  }, [positions])

  // Group players by position for stacking
  const playersByPosition = useMemo(() => {
    const map: Record<number, Player[]> = {}
    for (const p of players) {
      if (!map[p.position]) map[p.position] = []
      map[p.position].push(p)
    }
    return map
  }, [players])

  // Offset for stacking multiple players on same space
  const getPlayerOffset = (idx: number, total: number): { dx: number; dy: number } => {
    if (total <= 1) return { dx: 0, dy: 0 }
    const angle = (idx / total) * 2 * Math.PI - Math.PI / 2
    const dist = 28
    return { dx: dist * Math.cos(angle), dy: dist * Math.sin(angle) }
  }

  return (
    <svg
      viewBox="0 0 600 660"
      className="snakeboard"
      role="img"
      aria-label="Snake Attack game board — coral snake spiral from tail to head"
    >
      {/* Background */}
      <rect x={0} y={0} width={600} height={660} rx={16} fill="#0a1628" />

      {/* Title — more room now with spiral pushed down */}
      <text x={300} y={34} textAnchor="middle" fill="#ffd54f" fontSize={22} fontWeight={700} fontFamily="sans-serif">
        Snake Attack!
      </text>

      {/* ============ CORAL SNAKE BANDS ============ */}

      {/* Band borders (darker outline behind each band) */}
      {spaces.map((space, i) => {
        if (i >= positions.length - 1) return null
        const p1 = positions[i]
        const p2 = positions[i + 1]
        const colors = SPACE_COLORS[space.type] || SPACE_COLORS.white
        return (
          <path
            key={`border-${i}`}
            d={`M${p1.x},${p1.y} L${p2.x},${p2.y}`}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={BORDER_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}

      {/* Band fills (main colored segments) */}
      {spaces.map((space, i) => {
        if (i >= positions.length - 1) return null
        const p1 = positions[i]
        const p2 = positions[i + 1]
        const colors = SPACE_COLORS[space.type] || SPACE_COLORS.white
        const isHighlighted = highlightSpace === i
        return (
          <path
            key={`band-${i}`}
            d={`M${p1.x},${p1.y} L${p2.x},${p2.y}`}
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

      {/* Last space (finish) — render as a filled circle at the last position */}
      {(() => {
        const lastIdx = spaces.length - 1
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

      {/* ============ BAND LABELS — only multiples of 5, START, END ============ */}
      {spaces.map((space, i) => {
        // Only show labels for START, END, and multiples of 5
        const isStart = space.type === 'start'
        const isFinish = space.type === 'finish'
        const isMultOf5 = i > 0 && i % 5 === 0 && !isFinish
        if (!isStart && !isFinish && !isMultOf5) return null

        const mid = bandMidpoints[i]
        if (!mid) return null
        const isLight = space.type === 'white' || space.type === 'finish'
        return (
          <text
            key={`label-${i}`}
            x={mid.x}
            y={mid.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill={isLight ? '#333' : '#fff'}
            fontSize={isStart || isFinish ? 9 : 11}
            fontWeight={700}
            fontFamily="sans-serif"
            pointerEvents="none"
          >
            {isStart ? 'START' : isFinish ? 'END' : i}
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

      {/* ============ SNAKE HEAD (center, position 39) ============ */}
      {positions[positions.length - 1] && (() => {
        const last = positions[positions.length - 1]
        // Offset head beyond the last position in the direction of travel
        const prev = positions[positions.length - 2]
        const dx = last.x - prev.x
        const dy = last.y - prev.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const offsetDist = 28
        return (
          <SnakeHead
            x={last.x + (dx / dist) * offsetDist}
            y={last.y + (dy / dist) * offsetDist}
            angle={headAngle}
          />
        )
      })()}

      {/* ============ PLAYER MARKERS ============ */}
      {Object.entries(playersByPosition).map(([posStr, playersAtPos]) => {
        const posIdx = parseInt(posStr, 10)
        const mid = bandMidpoints[posIdx]
        if (!mid) return null

        return playersAtPos.map((player, stackIdx) => {
          const offset = getPlayerOffset(stackIdx, playersAtPos.length)
          const px = mid.x + offset.dx
          const py = mid.y + offset.dy
          const isCurrent = player.id === players[currentPlayerIndex]?.id

          return (
            <g key={player.id}>
              {/* Glow for current player */}
              {isCurrent && (
                <circle
                  cx={px}
                  cy={py}
                  r={22}
                  fill="none"
                  stroke={player.color}
                  strokeWidth={3}
                  opacity={0.8}
                  className="playermarker"
                />
              )}
              {/* Player token circle */}
              <circle
                cx={px}
                cy={py}
                r={isCurrent ? 14 : 11}
                fill={player.color}
                stroke="#fff"
                strokeWidth={2}
                opacity={isCurrent ? 1 : 0.8}
              />
              {/* Player emoji */}
              <text
                x={px}
                y={py + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={isCurrent ? 14 : 11}
                pointerEvents="none"
              >
                {player.emoji}
              </text>
            </g>
          )
        })
      })}
    </svg>
  )
})

export default SnakebiteBoard
