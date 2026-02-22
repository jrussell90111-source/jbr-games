// src/RouletteWheel00.tsx
// American double-zero roulette wheel (38 pockets).
// 00 is stored as 37 internally; this wheel uses the authentic American pocket order.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { colorOf } from './games/roulette'
import { audio } from './audio'

// Authentic American wheel order (clockwise from 0).
// 37 = "00"
const ORDER = [
  0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3,
  24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18,
  6, 21, 33, 16, 4, 23, 35, 14, 2
]
const SLICE = 360 / ORDER.length  // ≈ 9.47°

function colorHex(n: number): string {
  const c = colorOf(n)
  return c === 'red' ? '#c81919' : c === 'black' ? '#111' : '#0f7b3a'
}

function buildGradient(): string {
  const stops: string[] = []
  let a = 0
  for (const n of ORDER) {
    const next = a + SLICE
    stops.push(`${colorHex(n)} ${a}deg ${next}deg`)
    a = next
  }
  return `conic-gradient(${stops.join(',')})`
}

export default function RouletteWheel00({
  targetNumber,
  spinning,
  durationMs = 2400,
}: {
  targetNumber: number | null   // 0..37 where 37 = "00"
  spinning: boolean
  durationMs?: number
}) {
  const gradient = useMemo(buildGradient, [])
  const [deg, setDeg] = useState(0)
  const turnsRef = useRef(0)
  const tickRef = useRef<number | null>(null)

  useEffect(() => {
    if (!spinning || targetNumber == null) return
    const idx = ORDER.indexOf(targetNumber)
    if (idx === -1) return
    turnsRef.current += 8 + Math.floor(Math.random() * 4)  // 8–11 full rotations
    const targetCenter = (idx + 0.5) * SLICE
    const nextDeg = turnsRef.current * 360 - targetCenter
    requestAnimationFrame(() => setDeg(nextDeg))

    // ticking sound — speeds up then slows near end
    const start = performance.now()
    const tick = () => {
      const t = performance.now() - start
      if (t >= durationMs) { tickRef.current = null; return }
      audio.tick?.()
      tickRef.current = window.setTimeout(tick, Math.max(70, 230 - Math.floor(t / 10))) as any
    }
    tick()
    return () => { if (tickRef.current != null) clearTimeout(tickRef.current) }
  }, [spinning, targetNumber, durationMs])

  return (
    <div className="rw-wrap" aria-label="American roulette wheel (double zero)">
      <div
        className="rw-wheel"
        style={{
          background: gradient,
          transform: `rotate(${deg}deg)`,
          transition: spinning ? `transform ${durationMs}ms cubic-bezier(.17,.72,.2,1)` : 'none',
        }}
      >
        <div className="rw-ring" />
      </div>
      <div className="rw-pointer" aria-hidden />
    </div>
  )
}
