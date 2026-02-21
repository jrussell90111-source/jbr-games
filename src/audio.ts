// src/audio.ts
// Robust WebAudio manager with iOS unlock helpers (Safari/A2HS safe).
// Adds roulette-specific sounds (chip up/down, spin start, ticking, dolly, lose).
// Provides spinStartEx(...) which returns a promise you can await for timing accuracy.
// NEW: rouletteSpinPlay() — randomly plays one of /public/audio/roulette_wheel_*.wav and
// returns exact duration + a stop() handle.

type Tier = 'small'|'med'|'big'|'royal'

const BASE = (import.meta as any)?.env?.BASE_URL ?? '/';
const resolve = (p: string) => `${BASE}${p.replace(/^\//, '')}`;

// tiny sleep helper used for fallbacks
function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

class AudioManager {
  private ctx?: AudioContext
  private master?: GainNode
  enabled = true
  /** Optional console logging for troubleshooting */
  debug = false

  /** Create context if missing */
  init() {
    if (this.ctx) return
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    this.ctx = new AC({ latencyHint: 'interactive' } as any)
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.35
    this.master.connect(this.ctx.destination)
  }

  get state(): AudioContextState | 'none' {
    return this.ctx?.state ?? 'none'
  }

  toggle(on: boolean) { this.enabled = on }

  /** Call synchronously inside the same user gesture */
  unlockSyncInGesture() {
    this.init()
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return

    // 1) Resume immediately (MUST be in same tick as the gesture)
    try { ctx.resume?.() } catch {}

    // 2) Play a 1-sample silent buffer to "tickle" the audio pipeline
    try {
      const buffer = ctx.createBuffer(1, 1, 22050)
      const src = ctx.createBufferSource()
      const g = ctx.createGain()
      g.gain.value = 0.0001
      src.buffer = buffer
      src.connect(g).connect(master)
      src.start(0)
    } catch {}
  }

  /** Best-effort resume when app returns to foreground */
  resume() { try { this.ctx?.resume?.() } catch {} }

  private now() { return this.ctx?.currentTime ?? 0 }

  private tone(opts: {
    freq: number
    dur?: number
    type?: OscillatorType
    gain?: number
    attack?: number
    decay?: number
    startAt?: number
  }) {
    if (!this.ctx || !this.master || !this.enabled) return
    const {
      freq,
      dur = 0.08,
      type = 'square',
      gain = 0.35,
      attack = 0.005,
      decay = 0.05,
      startAt
    } = opts

    // iOS dislikes scheduling exactly at now(); give it a tiny lead
    const t0 = Math.max(this.now() + 0.002, (startAt ?? this.now()) + 0.002)

    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)

    // ADSR-ish envelope with non-zero floors (iOS can choke on exact 0)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(gain, t0 + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + decay, dur - 0.01))

    osc.connect(g).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.03)
  }

  // ------------ Existing game tones ------------
  click()   { this.tone({ freq: 660, dur: 0.045, type: 'square',   gain: 0.25 }) }
  clickHi() { this.tone({ freq: 880, dur: 0.05,  type: 'square',   gain: 0.28 }) }
  thud()    { this.tone({ freq: 240, dur: 0.06,  type: 'sine',     gain: 0.22 }) }
  draw()    { this.tone({ freq: 520, dur: 0.07,  type: 'triangle', gain: 0.28 }) }

  dealBurst() {
    const base = this.now() + 0.01
    for (let i = 0; i < 5; i++) {
      this.tone({ freq: 520 + i * 18, dur: 0.05, type: 'square', gain: 0.22, startAt: base + i * 0.055 })
    }
  }

  holdOn()  { this.tone({ freq: 920, dur: 0.06, type: 'sine', gain: 0.22 }) }
  holdOff() { this.tone({ freq: 480, dur: 0.06, type: 'sine', gain: 0.18 }) }

  win(tier: Tier) {
    const sets: Record<Tier, number[]> = {
      small: [784, 988],
      med:   [659, 880, 1175],
      big:   [587, 784, 988, 1319],
      royal: [523, 659, 784, 988, 1319, 1760]
    }
    const seq = sets[tier]
    const base = this.now() + 0.02
    const gap = 0.07
    seq.forEach((f, i) => this.tone({
      freq: f, dur: 0.09, type: 'triangle', gain: 0.3, attack: 0.01, decay: 0.06, startAt: base + i * gap
    }))
  }

  // ------------ Roulette extras ------------
  /** Place one chip (+$2). */
  chipUp()   { this.tone({ freq: 760, dur: 0.04, type: 'square', gain: 0.22 }) }
  /** Remove one chip (-$2). */
  chipDown() { this.tone({ freq: 360, dur: 0.05, type: 'sine',   gain: 0.20 }) }

  /** Short tick used repeatedly during the spin animation. */
  tick()     { this.tone({ freq: 980, dur: 0.015, type: 'square', gain: 0.18 }) }

  /** New: Start the spin sound and return timing info + a promise that resolves when it actually ends. */
  spinStartEx(opts: { durMs?: number; riseMs?: number; fallMs?: number } = {}) {
    this.init() // ensure context/master exist

    const durMs  = Math.max(100, opts.durMs ?? 2400)  // steady “spin” part
    const riseMs = Math.max(0,   opts.riseMs ?? 180)  // quick ramp up
    const fallMs = Math.max(0,   opts.fallMs ?? 220)  // quick ramp down
    const totalMs = riseMs + durMs + fallMs

    if (!this.enabled || !this.ctx || !this.master) {
      this.debug && console.warn('[audio] spinStartEx: disabled or no ctx; simulating', { totalMs })
      return { totalMs, endAtSec: (this.now() + totalMs/1000), done: sleep(totalMs) }
    }

    const ctx = this.ctx!
    const master = this.master!

    // simple filtered noise “motor”
    const totalSec = (totalMs + 60) / 1000
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * totalSec), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6

    const t0 = this.now() + 0.01
    const src = ctx.createBufferSource()
    src.buffer = buffer

    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 900
    bp.Q.value = 0.7

    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)                              // start silent
    g.gain.exponentialRampToValueAtTime(0.35, t0 + riseMs / 1000)  // rise
    g.gain.setValueAtTime(0.35,               t0 + (riseMs + durMs) / 1000) // hold
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + totalMs / 1000)        // fall

    src.connect(bp).connect(g).connect(master)

    const endAtSec = t0 + totalMs / 1000
    const done = new Promise<void>((resolve) => {
      src.onended = () => {
        this.debug && console.log('[audio] spin ended @', ctx.currentTime.toFixed(3))
        resolve()
      }
      // Safety net in case onended is missed (rare)
      setTimeout(resolve, totalMs + 80)
    })

    this.debug && console.log('[audio] spin start @', t0.toFixed(3), 'end @', endAtSec.toFixed(3), '≈', totalMs, 'ms')
    try { src.start(t0) } catch {}
    try { src.stop(endAtSec + 0.05) } catch {}

    return { totalMs, endAtSec, done }
  }

  /** Legacy helper kept for compatibility: returns totalMs only. */
  spinStart(opts: { durMs?: number; riseMs?: number; fallMs?: number } = {}): number {
    return this.spinStartEx(opts).totalMs
  }

  /** White dolly marker landing on the winning number. */
  dolly()    { this.tone({ freq: 420, dur: 0.06, type: 'sine', gain: 0.25 }) }

  /** Small "lose" tone for negative net. */
  lose()     { this.tone({ freq: 220, dur: 0.12, type: 'sine', gain: 0.18 }) }

  /* =====================================================================
     NEW: Roulette WAV playback from /public/audio with exact durations
     ===================================================================== */

  // pool and metadata for your three clips in public/audio
  private _spinClips = [
    { path: resolve('audio/roulette_wheel_8s_ball_drop.wav'), ms: 8000 },
    { path: resolve('audio/roulette_wheel_9s_ball_drop.wav'), ms: 9000 },
    { path: resolve('audio/roulette_wheel_10s.wav'),          ms: 10000 },
  ];


  /**
   * Randomly plays one of the roulette WAV clips.
   * Returns the exact clip duration (from filename metadata above), a stop() handle,
   * and the chosen index. If audio is disabled, we still return duration and skip play.
   */
  rouletteSpinPlay(): { durationMs: number; stop: () => void; index: number } {
    // Lazy init pool
    if (!this._spinPool) {
      this._spinPool = this._spinClips.map(c => {
        const el = new Audio()
        el.preload = 'auto'
        el.src = c.path
        el.crossOrigin = 'anonymous'
        return el
      })
    }

    // Choose at random
    const i = Math.floor(Math.random() * this._spinClips.length)
    const meta = this._spinClips[i]
    const el = this._spinPool[i]

    // Prepare element
    try { el.pause(); el.currentTime = 0 } catch {}
    this.init(); this.resume()

    if (this.enabled) {
      // Best-effort play; ignore autoplay errors (mobile without gesture, etc.)
      void el.play().catch(err => {
        this.debug && console.warn('[audio] rouletteSpinPlay play() failed; simulating timing', err)
      })
    } else {
      this.debug && console.log('[audio] rouletteSpinPlay: audio disabled, timing only')
    }

    const stop = () => { try { el.pause(); el.currentTime = 0 } catch {} }
    return { durationMs: meta.ms, stop, index: i }
  }
}

export const audio = new AudioManager()

/** Attach unlock listeners in capture phase so we always see the first gesture */
export function installIOSAudioUnlockOnce() {
  let done = false
  const handler = () => {
    if (done) return
    done = true
    audio.unlockSyncInGesture()
    // Clean up all listeners once unlocked
    window.removeEventListener('pointerdown', handler, true)
    window.removeEventListener('touchstart', handler, true)
    window.removeEventListener('mousedown', handler, true)
    window.removeEventListener('keydown', handler, true)
  }
  // capture=true ensures we run before React's onClick/onPointerDown
  window.addEventListener('pointerdown', handler, { capture: true, passive: true })
  window.addEventListener('touchstart', handler, { capture: true, passive: true })
  window.addEventListener('mousedown', handler, { capture: true, passive: true })
  window.addEventListener('keydown', handler, { capture: true })
}

/** Resume on visibility/focus changes (helps after app-switching) */
export function installVisibilityResumer() {
  const resume = () => audio.resume()
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('focus', resume)
}

