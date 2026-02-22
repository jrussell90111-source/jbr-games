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

// Ball orbit radii (px). Wheel is 160px wide so center = 80px.
const BALL_OUTER_R = 68
const BALL_INNER_R = 48

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
  const tickRef  = useRef<number | null>(null)
  const rafRef   = useRef<number | null>(null)
  const ballRef  = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!spinning || targetNumber == null) return

    // ── Wheel rotation ──────────────────────────────────────────────────
    const idx = ORDER.indexOf(targetNumber)
    if (idx === -1) return
    turnsRef.current += 8 + Math.floor(Math.random() * 4)  // 8–11 full rotations
    const targetCenter = (idx + 0.5) * SLICE
    const nextDeg = turnsRef.current * 360 - targetCenter
    requestAnimationFrame(() => setDeg(nextDeg))

    // ── Ticking sound ───────────────────────────────────────────────────
    const start = performance.now()
    const tick = () => {
      const t = performance.now() - start
      if (t >= durationMs) { tickRef.current = null; return }
      audio.tick?.()
      tickRef.current = window.setTimeout(tick, Math.max(70, 230 - Math.floor(t / 10))) as any
    }
    tick()

    // ── Ball animation (rAF, no React state) ────────────────────────────
    // Orbits counterclockwise (negative angle) with cubic ease-out.
    // totalOrbitRad is an exact multiple of 2π → ball ends at angle 0
    // (12 o'clock = pointer) where the winning pocket has rotated to.
    const orbits   = 6 + Math.floor(Math.random() * 4)   // 6–9 full CCW orbits
    const totalRad = orbits * Math.PI * 2

    // Jump ball to outer rim immediately
    if (ballRef.current) {
      ballRef.current.style.transition = 'none'
      ballRef.current.style.opacity    = '1'
      ballRef.current.style.transform  = `rotate(0rad) translateY(-${BALL_OUTER_R}px)`
    }

    const animStart = performance.now()
    const loop = (now: number) => {
      const t      = Math.min((now - animStart) / durationMs, 1)
      const eased  = 1 - Math.pow(1 - t, 3)              // cubic ease-out
      const angle  = -totalRad * eased                    // CCW = negative

      // Spiral inward during the final 25 % of the spin
      const dropT  = Math.max(0, (t - 0.75) / 0.25)
      const radius = BALL_OUTER_R - (BALL_OUTER_R - BALL_INNER_R) * dropT

      if (ballRef.current) {
        ballRef.current.style.transform = `rotate(${angle}rad) translateY(-${radius}px)`
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(loop)
      }
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (tickRef.current != null) clearTimeout(tickRef.current)
      if (rafRef.current  != null) cancelAnimationFrame(rafRef.current)
    }
  }, [spinning, targetNumber, durationMs])

  return (
    <div className="rw-wrap" aria-label="American roulette wheel (double zero)">
      <div
        className="rw-wheel"
        style={{
          background: gradient,
          transform:  `rotate(${deg}deg)`,
          transition: spinning ? `transform ${durationMs}ms cubic-bezier(.17,.72,.2,1)` : 'none',
        }}
      >
        <div className="rw-ring" />
      </div>
      <div className="rw-ball" ref={ballRef} />
      <div className="rw-pointer" aria-hidden />
    </div>
  )
}
