import React, { useEffect, useMemo, useCallback, useState, useRef } from 'react'
import { useGame } from './useGame'
import BankPanel from './BankPanel'
import { audio, installIOSAudioUnlockOnce, installVisibilityResumer } from './audio'
import { JOB_SPEC_8_5 } from './games/job'
import { DW_SPEC_25_16_13 } from './games/deuces'
import { DDB_SPEC_9_6 } from './games/ddb'
import type { GameSpec } from './games/spec'
import './styles.css'

// Blackjack
import BlackjackScreen from './BlackjackScreen'
import { BJ10_RULES, BJ15_RULES, BJ25_RULES } from './games/blackjack'

/* ------------------------------------------------------------------ */
/*                     TWO-STAGE LOADER: CONFIG                       */
/* ------------------------------------------------------------------ */

// Cache-bust token for card assets (bump if CDN caches a bad path)
const ASSET_VER = 'cards-v1'

// Audio assets to warm (non-blocking stage)
const AUDIO_URLS = [
  '/audio/click.mp3',
  '/audio/click-hi.mp3',
  '/audio/thud.mp3',
  '/audio/deal-burst.mp3',
  '/audio/draw.mp3',
  '/audio/hold-on.mp3',
  '/audio/hold-off.mp3',
  '/audio/win-small.mp3',
  '/audio/win-med.mp3',
  '/audio/win-big.mp3',
  '/audio/win-royal.mp3',
]

/* ------------------------------------------------------------------ */
/*                   CARD IMAGE WARMER (robust)                       */
/* ------------------------------------------------------------------ */

type SuitSym = '♣'|'♦'|'♥'|'♠'
const SUITS: SuitSym[] = ['♠','♥','♦','♣']
const RANKS = ['10','J','Q','K','A','9','8','7','6','5','4','3','2'] // order not important

// Map rank/suit → filename in /public/cards
function mapCardToFile(rank: string, suit: string): string {
  let rankName = ''
  switch(rank) {
    case 'A': rankName = 'ace'; break
    case 'K': rankName = 'king'; break
    case 'Q': rankName = 'queen'; break
    case 'J': rankName = 'jack'; break
    default:  rankName = rank.toLowerCase(); break // 10..2
  }
  const suitName = suit === '♠' ? 'spades' : suit === '♥' ? 'hearts' : suit === '♦' ? 'diamonds' : 'clubs'
  return `${rankName}_of_${suitName}.svg`
}

function buildAllCardUrls(): string[] {
  const faces: string[] = []
  for (const s of SUITS) for (const r of RANKS) faces.push(`/cards/${mapCardToFile(r, s)}`)
  faces.push('/cards/back.svg') // include the back
  return faces.map(u => `${u}?v=${ASSET_VER}`)
}

// Promise-based image warmup with per-image progress + timeout
async function preloadImagesWithProgress(
  urls: string[],
  onOneDone: (url: string, ok: boolean) => void,
  perImageTimeoutMs = 6000
): Promise<void> {
  await Promise.all(urls.map(url => new Promise<void>((resolve) => {
    const img = new Image()
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      img.onload = null as any
      img.onerror = null as any
      onOneDone(url, ok)
      resolve()
    }
    img.onload = () => finish(true)
    img.onerror = () => finish(false)
    try { (img as any).decoding = 'async' } catch {}
    img.src = url
    setTimeout(() => finish(false), perImageTimeoutMs)
  })))
}

/* ------------------------------------------------------------------ */
/*                   AUDIO WARMER (single count/URL)                  */
/* ------------------------------------------------------------------ */

async function preloadAudioWithProgress(
  urls: string[],
  onOneDone: (url: string, ok: boolean) => void
): Promise<void> {
  // Prefer audio.ts preload if available
  if (typeof (audio as any).preload === 'function') {
    try {
      await (audio as any).preload()
      urls.forEach(u => onOneDone(u, true))
      return
    } catch {
      // fall through to element warming
    }
  }

  await Promise.all(
    urls.map(url => new Promise<void>((resolve) => {
      const el = new Audio()
      el.preload = 'auto'
      el.src = url

      let settled = false
      const cleanup = () => {
        el.removeEventListener('canplaythrough', onOk)
        el.removeEventListener('loadeddata', onOk)
        el.removeEventListener('error', onErr)
      }
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        cleanup()
        onOneDone(url, ok)
        resolve()
      }
      const onOk = () => finish(true)
      const onErr = () => finish(false)

      el.addEventListener('canplaythrough', onOk)
      el.addEventListener('loadeddata', onOk)
      el.addEventListener('error', onErr)

      try { el.load() } catch {}
      setTimeout(() => finish(false), 4000)
    }))
  )
}

/* ------------------------------------------------------------------ */
/*                              UI bits                               */
/* ------------------------------------------------------------------ */

type CardFaceProps = { rank: string; suit: SuitSym; held: boolean; onClick: () => void }
const CardFace = React.memo(function CardFace({ rank, suit, held, onClick }: CardFaceProps) {
  const fileName = mapCardToFile(rank, suit)
  const alt = `${rank} of ${suit}`
  return (
    <div
      className="card"
      data-held={held ? 'true' : 'false'}
      onClick={onClick}
      role="button"
      aria-pressed={held}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ position:'relative', borderRadius:8, overflow:'hidden', boxShadow:'2px 4px 8px rgba(0,0,0,0.25)', contain:'content' }}
    >
      <img
        src={`/cards/${fileName}`}
        alt={alt}
        style={{ width:'100%', height:'100%', objectFit:'contain', display:'block' }}
        width={240} height={360}
        decoding="async"
        loading="eager"
        draggable={false}
        onPointerDown={(e) => { if ((e as any).pointerType === 'touch') e.preventDefault() }}
      />
      {held && <div className="holdTag">HOLD</div>}
    </div>
  )
})

/** Generic paytable for any GameSpec */
function PaytableAny({
  bet, order, table, highlight
}: {
  bet: number
  order: string[]
  table: Record<string, number[]>
  highlight?: string | null
}) {
  return (
    <table className="paytable">
      <thead>
        <tr>
          <th>Hand</th>
          {[1,2,3,4,5].map(n=>(
            <th key={n} className={n===bet ? 'active' : ''}>Bet {n}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {order.map((hand) => (
          <tr key={hand} className={highlight === hand ? 'hl' : ''}>
            <td>{hand}</td>
            {(table[hand] ?? [0,0,0,0,0]).map((payout, i)=>(
              <td key={i} className={i+1===bet ? 'active' : ''}>{payout}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ------------------------------------------------------------------ */
/*                              APP                                   */
/* ------------------------------------------------------------------ */

export default function App(){
  // Screens: menu + poker games + blackjack tables
  const [screen, setScreen] = useState<'menu' | 'job' | 'dw' | 'ddb' | 'bj10' | 'bj15' | 'bj25'>('job')

  // Poker specs
  const isPoker = (screen === 'job' || screen === 'dw' || screen === 'ddb')
  const spec: GameSpec =
    screen === 'dw'  ? DW_SPEC_25_16_13 :
    screen === 'ddb' ? DDB_SPEC_9_6    :
    JOB_SPEC_8_5

  // Blackjack rules for the three tables
  const bjRules =
    screen === 'bj10' ? BJ10_RULES :
    screen === 'bj15' ? BJ15_RULES :
    screen === 'bj25' ? BJ25_RULES : null

  // Poker game hook
  const g = useGame(spec)

  /* ========= Audio toggle + iOS unlock ========= */
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    const s = localStorage.getItem('soundOn')
    return s === null ? true : s === 'true'
  })
  useEffect(() => { audio.toggle(soundOn); localStorage.setItem('soundOn', String(soundOn)) }, [soundOn])
  useEffect(() => { installIOSAudioUnlockOnce(); installVisibilityResumer() }, [])

  /* ========= Stage 1: Cards (blocking) ========= */
  const [cardDone, setCardDone] = useState(0)
  const [cardTotal] = useState(buildAllCardUrls().length)
  const [cardFailures, setCardFailures] = useState<string[]>([])
  const [cardsFinished, setCardsFinished] = useState(false)

  useEffect(() => {
    let cancelled = false
    const urls = buildAllCardUrls()
    ;(async () => {
      await preloadImagesWithProgress(urls, (url, ok) => {
        if (cancelled) return
        setCardDone(d => d + 1)
        if (!ok) setCardFailures(f => f.concat(url))
      })
      if (!cancelled) setCardsFinished(true)
    })()
    return () => { cancelled = true }
  }, [])

  const cardPercent = cardTotal ? Math.round((cardDone / cardTotal) * 100) : 0

  /* ========= Stage 2: Audio (non-blocking) ========= */
  const [audioDone, setAudioDone] = useState(0)
  const [audioTotal] = useState(AUDIO_URLS.length)
  const [audioFailures, setAudioFailures] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await preloadAudioWithProgress(AUDIO_URLS, (url, ok) => {
        if (cancelled) return
        setAudioDone(d => d + 1)
        if (!ok) setAudioFailures(f => f.concat(url))
      })
    })()
    return () => { cancelled = true }
  }, [])
  const audioPercent = audioTotal ? Math.round((audioDone / audioTotal) * 100) : 100

  // Gate: block interaction until user starts OR audio completes after cards
  const [startupDone, setStartupDone] = useState(false)
  useEffect(() => {
    if (!startupDone && cardsFinished && audioDone >= audioTotal) setStartupDone(true)
  }, [cardsFinished, audioDone, audioTotal, startupDone])

  const onStartNow = () => {
    if (cardsFinished) setStartupDone(true)
  }

  const blockingLoading = !startupDone

  /* ========= Request persistent storage ========= */
  useEffect(() => {
    (async () => {
      try { if ('storage' in navigator && 'persist' in navigator.storage) await (navigator.storage as any).persist?.() } catch {}
    })()
  }, [])

  /* ========= Preload current hand SVGs (snappy next paints) ========= */
  const onPokerScreen = isPoker
  useEffect(() => {
    if (!onPokerScreen) return
    if (!g.hand?.length) return
    const imgs = g.hand.map(c => {
      const img = new Image()
      img.decoding = 'async'
      img.src = `/cards/${mapCardToFile(c.rank as unknown as string, c.suit as unknown as string)}`
      return img
    })
    return () => { imgs.forEach(img => { (img as any).src = '' }) }
  }, [onPokerScreen, g.hand])

  /* ========= Bet One (cycles 1→5, wraps) + pulse ========= */
  const [wrapPulse, setWrapPulse] = useState(false)
  const triggerWrapPulse = useCallback(() => {
    setWrapPulse(false)
    requestAnimationFrame(() => {
      setWrapPulse(true)
      setTimeout(() => setWrapPulse(false), 240)
    })
  }, [])

  const canAdjustBet = onPokerScreen && (g.phase === 'bet' || g.phase === 'show') && !g.isAnimating
  const betOne = useCallback(() => {
    if (!canAdjustBet) return
    if (g.bet < 5) {
      audio.click()
      g.changeBet(+1)
    } else {
      g.changeBet(-4) // 5 → 1
      audio.clickHi()
      triggerWrapPulse()
    }
  }, [canAdjustBet, g.bet, g.changeBet, triggerWrapPulse])

  /* ========= Win arps when a new result appears ========= */
  const lastWinRef = useRef<string | null>(null)
  useEffect(() => {
    if (!onPokerScreen) return
    if (!g.result) { lastWinRef.current = null; return }
    const key = `${g.result.rank}|${g.result.payout}`
    if (key === lastWinRef.current) return
    lastWinRef.current = key
    if (g.result.payout <= 0) return
    const r = String(g.result.rank)
    const tier: 'small'|'med'|'big'|'royal' =
      r.includes('Jacks or Better') || r === 'Two Pair' ? 'small' :
      r === 'Three of a Kind' ? 'med' :
      r === 'Straight' || r === 'Flush' || r === 'Full House' ? 'big' :
      r.includes('Four of a Kind') || r.includes('Straight Flush') || r.includes('Royal') ? 'royal' : 'small'
    audio.win(tier)
  }, [onPokerScreen, g.result])

  /* ========= Actions ========= */
  const onDeal = useCallback(() => { if (!onPokerScreen) return; g.deal() }, [onPokerScreen, g.deal])
  const onDraw = useCallback(() => { if (!onPokerScreen) return; g.draw() }, [onPokerScreen, g.draw])
  const onMaxBet = useCallback(() => { if (canAdjustBet) audio.clickHi(); if (onPokerScreen) g.setMaxBet() }, [onPokerScreen, g.setMaxBet, canAdjustBet])

  /* ========= Keyboard shortcuts (poker only) ========= */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!onPokerScreen) return
      if (e.repeat) return
      if (g.isAnimating) return
      const k = e.key.toLowerCase()
      if (k >= '1' && k <= '5') {
        const idx = Number(k) - 1
        if (idx < g.hand.length) g.toggleHold(idx)
      } else if (k === 'd') {
        if (g.canDeal) onDeal()
        else if (g.canDraw) onDraw()
      } else if (k === 'b') {
        betOne()
      } else if (k === 'm') {
        if (canAdjustBet) onMaxBet()
      } else if (k === 'h') {
        g.setHintsEnabled(h => !h)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPokerScreen, g.hand, g.canDeal, g.canDraw, canAdjustBet, betOne, onDeal, onDraw, onMaxBet, g])

  const paytableHighlight = useMemo<string | null>(() => {
    if (!onPokerScreen) return null
    return (g.result?.rank as any) || (g.initialRank as any) || null
  }, [onPokerScreen, g.result?.rank, g.initialRank])

  /* ========= Prevent switching games mid-hand (poker) ========= */
  const canLeaveTable = onPokerScreen
    ? (!g.isAnimating && (g.phase === 'bet' || g.phase === 'show' || g.hand.length === 0))
    : true

  /* ========= Settings (gear) for poker timing ========= */
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="app">
      {/* ===== TWO-STAGE STARTUP LOADER ===== */}
      {!startupDone && (
        <div className="modal" style={{ zIndex: 1000 }} role="alertdialog" aria-modal="true" aria-label="Loading Game">
          <div className="modalBox">
            {!cardsFinished ? (
              <>
                <h3 style={{margin:'0 0 6px'}}>Loading cards… <span style={{opacity:.9}}>{cardPercent}%</span></h3>
                <div className="progressBar" style={{marginTop:6, background:'rgba(255,255,255,.12)', borderRadius:8, height:12, overflow:'hidden'}}>
                  <div style={{width:`${cardPercent}%`, height:'100%', background:'rgba(255,255,255,.75)'}} />
                </div>
                <div className="row" style={{marginTop:10, gap:10, fontSize:14}}>
                  <div style={{flex:1}}>Cards: {cardDone}/{cardTotal}{cardFailures.length ? ` (failed ${cardFailures.length})` : ''}</div>
                </div>
                {cardFailures.length > 0 && (
                  <details style={{marginTop:8}}>
                    <summary style={{cursor:'pointer'}}>Show failed card files</summary>
                    <ul style={{margin:'6px 0 0 18px'}}>
                      {cardFailures.map(u => <li key={u} style={{opacity:.85}}>{u}</li>)}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <>
                <h3 style={{margin:'0 0 6px'}}>Loading audio… <span style={{opacity:.9}}>{audioPercent}%</span></h3>
                <div className="progressBar" style={{marginTop:6, background:'rgba(255,255,255,.12)', borderRadius:8, height:12, overflow:'hidden'}}>
                  <div style={{width:`${audioPercent}%`, height:'100%', background:'rgba(255,255,255,.75)'}} />
                </div>
                <div className="row" style={{marginTop:10, gap:10, fontSize:14}}>
                  <div style={{flex:1}}>Audio: {audioDone}/{audioTotal}{audioFailures.length ? ` (failed ${audioFailures.length})` : ''}</div>
                </div>
                <div style={{marginTop:10, fontSize:12, opacity:.75}}>
                  You can start now — audio will finish warming in the background.
                </div>
                <div className="controls" style={{justifyContent:'flex-end', marginTop:12}}>
                  <button onClick={onStartNow}>Start Now</button>
                </div>
                {audioFailures.length > 0 && (
                  <details style={{marginTop:8}}>
                    <summary style={{cursor:'pointer'}}>Show failed audio files</summary>
                    <ul style={{margin:'6px 0 0 18px'}}>
                      {audioFailures.map(u => <li key={u} style={{opacity:.85}}>{u}</li>)}
                    </ul>
                  </details>
                )}
              </>
            )}
            <div style={{marginTop:10, fontSize:12, opacity:.75}}>
              On iOS, turn the ringer ON to hear sound after load.
            </div>
          </div>
        </div>
      )}

      {/* Header with Games / Sound / Settings */}
      <div style={{display:'flex', width:'100%', maxWidth:900, alignItems:'center', justifyContent:'space-between', opacity: blockingLoading ? 0.3 : 1, pointerEvents: blockingLoading ? 'none' : 'auto'}}>
        <h2 className="title" style={{margin:0}}>Video Poker & Blackjack</h2>
        <div style={{display:'flex', gap:8}}>
          {/* Hide the global "Games" button on blackjack screens (use in-screen Back button). */}
          {isPoker && (
            <button
              type="button"
              onClick={() => { if (canLeaveTable) setScreen('menu'); else audio.thud() }}
              disabled={!canLeaveTable}
              title={canLeaveTable ? 'Choose a game' : 'Finish the hand before switching games'}
            >
              Games
            </button>
          )}
          <button
            type="button"
            aria-pressed={soundOn}
            onClick={() => setSoundOn(s => !s)}
            title={soundOn ? 'Turn sound off' : 'Turn sound on'}
          >
            {soundOn ? 'Sound: On' : 'Sound: Off'}
          </button>
          {/* Poker-only settings (card speed). Blackjack has its own trainer toggle inside. */}
          {isPoker && <button type="button" onClick={() => setSettingsOpen(true)} title="Settings">⚙️ Settings</button>}
        </div>
      </div>

      {/* ========== MENU SCREEN ========== */}
      {screen === 'menu' && (
        <div className="menuScreen" style={{opacity: blockingLoading ? 0.3 : 1, pointerEvents: blockingLoading ? 'none' : 'auto'}}>
          <h3 style={{margin:'8px 0 10px'}}>Choose a game</h3>

          <div className="menuGrid">
            {/* Jacks or Better */}
            <button
              type="button"
              className="gameTile"
              onClick={() => { audio.clickHi(); setScreen('job') }}
            >
              <div className="gameTileTitle">Jacks or Better</div>
              <div className="gameTileSub">8/5 paytable</div>
            </button>

            {/* Deuces Wild */}
            <button
              type="button"
              className="gameTile"
              onClick={() => { audio.clickHi(); setScreen('dw') }}
            >
              <div className="gameTileTitle">Deuces Wild</div>
              <div className="gameTileSub">96.77% · 25/16/13</div>
            </button>

            {/* Double Double Bonus */}
            <button
              type="button"
              className="gameTile"
              onClick={() => { audio.clickHi(); setScreen('ddb') }}
            >
              <div className="gameTileTitle">Double Double Bonus</div>
              <div className="gameTileSub">9/6 full-pay</div>
            </button>

            {/* Blackjack tables */}
            <button
              type="button"
              className="gameTile"
              onClick={() => { audio.clickHi(); setScreen('bj10') }}
            >
              <div className="gameTileTitle">Blackjack $10</div>
              <div className="gameTileSub">8 decks · 6:5 · H17</div>
            </button>
            <button
              type="button"
              className="gameTile"
              onClick={() => { audio.clickHi(); setScreen('bj15') }}
            >
              <div className="gameTileTitle">Blackjack $15</div>
              <div className="gameTileSub">8 decks · 3:2 · H17</div>
            </button>
            <button
              type="button"
              className="gameTile"
              onClick={() => { audio.clickHi(); setScreen('bj25') }}
            >
              <div className="gameTileTitle">Blackjack $25</div>
              <div className="gameTileSub">1 deck · 3:2 · H17</div>
            </button>
          </div>

          <div className="controls" style={{marginTop:14}}>
            <button type="button" onClick={() => setScreen('job')}>Back to table</button>
          </div>
        </div>
      )}

      {/* ========== POKER GAME SCREEN (JoB / DW / DDB) ========== */}
      {onPokerScreen && (
        <>
          <div className="layout" style={{opacity: blockingLoading ? 0.3 : 1, pointerEvents: blockingLoading ? 'none' : 'auto'}}>
            {/* Game column */}
            <div className="table">
              <h3 className="title" style={{marginTop:0}}>{spec.title}</h3>

              <div className="row" style={{gap:12}}>
                <div>Credits: <b>{g.credits}</b></div>
                <div>Bet: <b>{g.bet}</b></div>
                <div>Rewards: <b>{g.rewardsPoints}</b></div>
                <div>Accuracy: <b>{g.accCorrect}/{g.accTotal}</b> ({g.accuracyPct}%)</div>
              </div>

              {/* Money controls */}
              <div className="controls" style={{marginTop:8}}>
                <button type="button" onClick={()=>{ audio.thud(); g.insert(1) }}>Insert $1</button>
                <button type="button" onClick={()=>{ audio.thud(); g.insert(5) }}>+$5</button>
                <button type="button" onClick={()=>{ audio.thud(); g.insert(10) }}>+$10</button>
                <button type="button" onClick={g.cashOutAll} disabled={g.credits===0}>Cash Out</button>
              </div>

              {/* Betting + actions */}
              <div className="controls">
                <button
                  type="button"
                  onClick={betOne}
                  disabled={!canAdjustBet}
                  className={`betOneBtn ${wrapPulse ? 'is-pulsing' : ''}`}
                  aria-label="Bet One (cycles 1 to 5 and wraps to 1)"
                  style={{ transform:'scale(1.1)' }}
                >
                  Bet One
                </button>
                <button type="button" onClick={onMaxBet} disabled={!canAdjustBet} style={{ transform:'scale(1.1)' }}>Max Bet</button>
                <button type="button" onClick={onDeal} disabled={!g.canDeal || g.isAnimating} style={{ transform:'scale(1.1)' }}>Deal</button>
                <button type="button" onClick={onDraw} disabled={!g.canDraw || g.isAnimating} style={{ transform:'scale(1.1)' }}>Draw</button>
              </div>

              {/* Cards — always 5 slots; show back until revealed */}
              <div className="cards">
                {Array.from({ length: 5 }).map((_, i) => {
                  const c = g.hand[i]
                  const revealed = g.revealMask[i]
                  if (!c || !revealed) {
                    return (
                      <div key={i} className="card" style={{ borderRadius:8, overflow:'hidden', boxShadow:'2px 4px 8px rgba(0,0,0,0.25)' }}>
                        <img
                          src={`/cards/back.svg?v=${ASSET_VER}`}
                          alt="Card back"
                          style={{ width:'100%', height:'100%', objectFit:'contain', display:'block' }}
                          width={240}
                          height={360}
                          decoding="async"
                          loading="eager"
                          draggable={false}
                        />
                      </div>
                    )
                  }
                  return (
                    <CardFace
                      key={c.id}
                      rank={c.rank as unknown as string}
                      suit={c.suit as SuitSym}
                      held={g.holds[i]}
                      onClick={()=>{
                        const before = g.holds[i]
                        g.toggleHold(i)
                        before ? audio.holdOff() : audio.holdOn()
                      }}
                    />
                  )
                })}
              </div>

              {/* Outcomes */}
              <div className="payouts" aria-live="polite">
                {g.initialRank && <div style={{marginTop:6}}>Initial deal: <b>{g.initialRank}</b></div>}
                {g.result && <div style={{marginTop:6}}>Result: <b>{g.result.rank}</b> &nbsp; Payout: <b>{g.result.payout}</b></div>}
              </div>

              {/* Paytable */}
              <PaytableAny
                bet={g.bet}
                order={spec.handOrder as string[]}
                table={spec.paytable as unknown as Record<string, number[]>}
                highlight={paytableHighlight}
              />

              {/* Notes */}
              {spec.notes && <div style={{marginTop:6, opacity:0.8, fontStyle:'italic'}}>{spec.notes}</div>}
            </div>

            {/* Side panel */}
            <BankPanel
              specId={spec.id}
              gameTitle={spec.title}
              rewardsPoints={g.rewardsPoints}
              onResetAccuracy={g.resetAccuracy}
              onResetRewards={g.resetRewards}
            />
          </div>

          {/* Coaching modal */}
          {g.suggestion && (
            <div className="modal" style={{ zIndex: 60 }} role="dialog" aria-modal="true" aria-label="Trainer suggestion">
              <div className="modalBox">
                <h4>Trainer: A better hold is suggested</h4>
                {g.suggestionWhy && (
                  <div style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', padding:'8px 10px', borderRadius:8, margin:'8px 0' }}>
                    <b>Why this hold:</b> {g.suggestionWhy}
                  </div>
                )}
                <div className="hintCards">
                  {g.hand.map((c, i) => {
                    const keep = g.suggestion![i]
                    const fileName = mapCardToFile(c.rank as unknown as string, c.suit as unknown as string)
                    return (
                      <div key={c.id} className={`hintCard ${keep ? 'keep' : ''}`} title={`${c.rank} ${c.suit}`}>
                        <img src={`/cards/${fileName}`} alt={`${c.rank} of ${c.suit}`} />
                      </div>
                    )
                  })}
                </div>
                <div className="controls" style={{justifyContent:'flex-end'}}>
                  <button onClick={g.acceptSuggestionAndDraw}>Apply &amp; Draw</button>
                  <button onClick={g.keepMineAndDraw}>Keep Mine &amp; Draw</button>
                </div>
              </div>
            </div>
          )}

          <small style={{opacity:.6}}>
            Coaching: you’ll be prompted at most once per round. Correct rounds (no prompt) count toward accuracy; prompted rounds score 0.
          </small>
        </>
      )}

      {/* ========== BLACKJACK SCREENS ========== */}
      {(screen === 'bj10' || screen === 'bj15' || screen === 'bj25') && (
        <BlackjackScreen
          rules={screen==='bj10' ? BJ10_RULES : screen==='bj15' ? BJ15_RULES : BJ25_RULES}
          onBack={() => setScreen('menu')}
        />
      )}

      {/* ========= SETTINGS MODAL (Poker only) ========= */}
      {settingsOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Settings" style={{ zIndex: 80 }}>
          <div className="modalBox">
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <h4 style={{margin:0}}>Settings</h4>
              <button onClick={() => setSettingsOpen(false)}>Close</button>
            </div>

            {/* Card speed presets (useGame-controlled) */}
            <div style={{marginTop:12, padding:'8px 10px', borderRadius:8, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)'}}>
              <div style={{marginBottom:6}}><b>Card speed</b> (ms between cards)</div>
              <div className="row" style={{gap:12, flexWrap:'wrap'}}>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <input type="radio" name="speed" checked={g.dealIntervalMs===120 && g.drawIntervalMs===120} onChange={() => { g.setDealIntervalMs(120); g.setDrawIntervalMs(120) }} />
                  Fast (120)
                </label>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <input type="radio" name="speed" checked={g.dealIntervalMs===240 && g.drawIntervalMs===240} onChange={() => { g.setDealIntervalMs(240); g.setDrawIntervalMs(240) }} />
                  Medium (240)
                </label>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <input type="radio" name="speed" checked={g.dealIntervalMs===360 && g.drawIntervalMs===360} onChange={() => { g.setDealIntervalMs(360); g.setDrawIntervalMs(360) }} />
                  Slow (360)
                </label>
              </div>
              <div style={{opacity:.75, fontSize:12, marginTop:6}}>
                Current: Deal {g.dealIntervalMs} ms · Draw {g.drawIntervalMs} ms
              </div>
            </div>

            <div className="controls" style={{justifyContent:'flex-end', marginTop:12}}>
              <button onClick={() => setSettingsOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

