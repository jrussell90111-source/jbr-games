// src/audio.ts
// Robust WebAudio manager with iOS unlock helpers (Safari/A2HS safe).

type Tier = 'small'|'med'|'big'|'royal'

class AudioManager {
  private ctx?: AudioContext
  private master?: GainNode
  enabled = true

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

