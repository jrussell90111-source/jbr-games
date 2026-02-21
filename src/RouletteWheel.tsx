// src/RouletteWheel.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { colorOf } from './games/roulette'
import { audio } from './audio'

const ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]
const SLICE = 360 / ORDER.length

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
  const tickRef = useRef<number | null>(null)

  useEffect(() => {
    if (!spinning || targetNumber == null) return
    const idx = ORDER.indexOf(targetNumber)
    if (idx === -1) return
    turnsRef.current += 8 + Math.floor(Math.random() * 4) // 8–11 turns
    const targetCenter = (idx + 0.5) * SLICE
    const nextDeg = turnsRef.current * 360 - targetCenter
    requestAnimationFrame(() => setDeg(nextDeg))

    // ticking sound
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
    <div className="rw-wrap" aria-label="roulette wheel">
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

