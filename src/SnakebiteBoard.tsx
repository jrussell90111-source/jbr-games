// src/SnakebiteBoard.tsx
// SVG spiral snake board for Snake Attack!

import React, { useMemo } from 'react'
import type { SnakeSpace } from './games/snakebite'

/* ------------------------------------------------------------------ */
/*                         SPIRAL GEOMETRY                             */
/* ------------------------------------------------------------------ */

interface Point { x: number; y: number }

/**
 * Generate positions for spaces along an Archimedean spiral.
 * The snake head (START) is at the outer edge; FINISH is at the center.
 */
function calculateSpiralPositions(count: number): Point[] {
  const cx = 250       // center x
  const cy = 250       // center y
  const maxRadius = 210 // outermost radius
  const minRadius = 25  // innermost radius
  const totalRotation = 3.2 * Math.PI  // ~1.6 full turns

  const positions: Point[] = []

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)  // 0 → 1
    const angle = -Math.PI / 2 + t * totalRotation  // start at top, spiral inward
    const radius = maxRadius - t * (maxRadius - minRadius)

    positions.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    })
  }
  return positions
}

/* ------------------------------------------------------------------ */
/*                        COLOR MAPPING                                */
/* ------------------------------------------------------------------ */

const SPACE_COLORS: Record<string, { fill: string; stroke: string }> = {
  start:  { fill: '#4caf50', stroke: '#388e3c' },
  finish: { fill: '#ffd54f', stroke: '#ffc107' },
  white:  { fill: '#e0e4ef', stroke: '#94a3b8' },
  brown:  { fill: '#c4936d', stroke: '#9d7554' },
  red:    { fill: '#ef5350', stroke: '#c62828' },
}

/* ------------------------------------------------------------------ */
/*                        SNAKE HEAD SVG                               */
/* ------------------------------------------------------------------ */

function SnakeHead({ x, y, angle }: { x: number; y: number; angle: number }) {
  // Simple triangular snake head pointing in the direction of the path
  return (
    <g transform={`translate(${x},${y}) rotate(${angle})`}>
      {/* Head shape */}
      <ellipse cx={0} cy={0} rx={18} ry={12} fill="#2e7d32" stroke="#1b5e20" strokeWidth={1.5} />
      {/* Eyes */}
      <circle cx={-6} cy={-6} r={3} fill="#fff" />
      <circle cx={-6} cy={-6} r={1.5} fill="#111" />
      <circle cx={6} cy={-6} r={3} fill="#fff" />
      <circle cx={6} cy={-6} r={1.5} fill="#111" />
      {/* Tongue */}
      <path d="M0,12 L-4,22 M0,12 L4,22" stroke="#c62828" strokeWidth={1.5} fill="none" strokeLinecap="round" />
    </g>
  )
}

/* ------------------------------------------------------------------ */
/*                         BOARD COMPONENT                             */
/* ------------------------------------------------------------------ */

interface SnakeBoardProps {
  spaces: SnakeSpace[]
  playerPosition: number
  highlightSpace?: number | null    // Optional: highlight a target space
}

const SnakebiteBoard = React.memo(function SnakebiteBoard({
  spaces,
  playerPosition,
  highlightSpace,
}: SnakeBoardProps) {

  const positions = useMemo(() => calculateSpiralPositions(spaces.length), [spaces.length])

  // Calculate angle for snake head (tangent direction at first point)
  const headAngle = useMemo(() => {
    if (positions.length < 2) return 0
    const p0 = positions[0]
    const p1 = positions[1]
    return Math.atan2(p1.y - p0.y, p1.x - p0.x) * (180 / Math.PI) - 90
  }, [positions])

  const SPACE_RADIUS = 14

  return (
    <svg
      viewBox="0 0 500 500"
      className="snakeboard"
      role="img"
      aria-label="Snake Attack game board — spiral path from START to FINISH"
    >
      {/* Background */}
      <rect x={0} y={0} width={500} height={500} rx={16} fill="#0a1628" />

      {/* Title */}
      <text x={250} y={28} textAnchor="middle" fill="#ffd54f" fontSize={18} fontWeight={700} fontFamily="sans-serif">
        Snake Attack!
      </text>

      {/* Snake body path (connecting line between spaces) */}
      {positions.length > 1 && (
        <path
          d={positions.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#2e7d32"
          strokeWidth={22}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.5}
        />
      )}

      {/* Scale pattern on snake body */}
      {positions.length > 1 && (
        <path
          d={positions.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#43a047"
          strokeWidth={18}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 8"
          opacity={0.3}
        />
      )}

      {/* Spaces */}
      {spaces.map((space, i) => {
        const pos = positions[i]
        if (!pos) return null
        const colors = SPACE_COLORS[space.type] || SPACE_COLORS.white
        const isHighlighted = highlightSpace === i
        const isPlayerHere = playerPosition === i

        return (
          <g key={space.id}>
            {/* Space circle */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={isHighlighted ? SPACE_RADIUS + 2 : SPACE_RADIUS}
              fill={colors.fill}
              stroke={isHighlighted ? '#fff' : colors.stroke}
              strokeWidth={isHighlighted ? 2.5 : 1.5}
              className="snakespace"
            />

            {/* Space label */}
            <text
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={space.type === 'white' || space.type === 'finish' ? '#333' : '#fff'}
              fontSize={space.type === 'start' || space.type === 'finish' ? 7 : 9}
              fontWeight={600}
              fontFamily="sans-serif"
              pointerEvents="none"
            >
              {space.type === 'start' ? 'START' : space.type === 'finish' ? 'END' : i}
            </text>

            {/* Player marker */}
            {isPlayerHere && (
              <>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={SPACE_RADIUS + 5}
                  fill="none"
                  stroke="#ffd54f"
                  strokeWidth={3}
                  className="playermarker"
                />
                <text
                  x={pos.x}
                  y={pos.y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={16}
                  pointerEvents="none"
                >
                  &#x1F3F4;&#x200D;&#x2620;&#xFE0F;
                </text>
              </>
            )}
          </g>
        )
      })}

      {/* Snake head at START */}
      {positions[0] && (
        <SnakeHead x={positions[0].x} y={positions[0].y - 22} angle={0} />
      )}

      {/* FINISH star at center */}
      {positions[positions.length - 1] && (
        <text
          x={positions[positions.length - 1].x}
          y={positions[positions.length - 1].y - 22}
          textAnchor="middle"
          fontSize={18}
          pointerEvents="none"
        >
          &#x2B50;
        </text>
      )}
    </svg>
  )
})

export default SnakebiteBoard
