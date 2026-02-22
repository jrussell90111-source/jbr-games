// src/RouletteWheel.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { colorOf } from './games/roulette'
import { audio } from './audio'

// European single-zero wheel order (clockwise from 0)
const ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]
const SLICE = 360 / ORDER.length   // ≈ 9.73° per pocket

// Wheel is 300px; center = 150px.
// BALL_*: orbit radii for the animated ball (rw-ball, outside rw-wheel).
// NUM_R:  radius for pocket number labels (inside rw-wheel, rotate with it).
const BALL_OUTER_R = 130   // just inside the gold fret ring at the outer rim
const BALL_INNER_R = 106   // settled in the pocket band
const NUM_R        = 115   // pocket number labels: between ring and inner cone

function colorHex(n: number) {
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

export default function RouletteWheel({
  targetNumber,
  spinning,
  durationMs = 2400,
}: {
  targetNumber: number | null
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
    turnsRef.current += 8 + Math.floor(Math.random() * 4)   // 8–11 full turns
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
    // Orbits counterclockwise (−angle) with cubic ease-out.
    // Total rotation = exact multiple of 2π → ball ends at 0° (pointer, 12 o'clock).
    const orbits   = 6 + Math.floor(Math.random() * 4)
    const totalRad = orbits * Math.PI * 2

    if (ballRef.current) {
      ballRef.current.style.transition = 'none'
      ballRef.current.style.opacity    = '1'
      ballRef.current.style.transform  = `rotate(0rad) translateY(-${BALL_OUTER_R}px)`
    }

    const animStart = performance.now()
    const loop = (now: number) => {
      const t      = Math.min((now - animStart) / durationMs, 1)
      const eased  = 1 - Math.pow(1 - t, 3)
      const angle  = -totalRad * eased
      const dropT  = Math.max(0, (t - 0.75) / 0.25)
      const radius = BALL_OUTER_R - (BALL_OUTER_R - BALL_INNER_R) * dropT

      if (ballRef.current) {
        ballRef.current.style.transform = `rotate(${angle}rad) translateY(-${radius}px)`
      }
      if (t < 1) rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (tickRef.current != null) clearTimeout(tickRef.current)
      if (rafRef.current  != null) cancelAnimationFrame(rafRef.current)
    }
  }, [spinning, targetNumber, durationMs])

  return (
    <div className="rw-wrap" aria-label="roulette wheel">
      {/* The wheel disk — rotates to land winning number at pointer */}
      <div
        className="rw-wheel"
        style={{
          background: gradient,
          transform:  `rotate(${deg}deg)`,
          transition: spinning ? `transform ${durationMs}ms cubic-bezier(.17,.72,.2,1)` : 'none',
        }}
      >
        {/* Pocket numbers — children of rw-wheel, rotate with it */}
        {ORDER.map((n, i) => {
          const pocketDeg = i * SLICE + SLICE / 2   // center of this pocket from 12 o'clock
          return (
            <div
              key={n}
              className="rw-number"
              style={{ transform: `rotate(${pocketDeg}deg) translateY(-${NUM_R}px)` }}
            >
              {n}
            </div>
          )
        })}

        {/* Inner dark cone / shading ring */}
        <div className="rw-ring" />
      </div>

      {/* Animated ball — outside rw-wheel so it doesn't rotate with it */}
      <div className="rw-ball" ref={ballRef} />

      {/* Fixed pointer at 12 o'clock */}
      <div className="rw-pointer" aria-hidden />
    </div>
  )
}
