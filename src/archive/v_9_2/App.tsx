import React, { useEffect, useMemo, useCallback, useState, useRef } from 'react'
import { useGame } from './useGame'
import { PAYTABLE_8_5 } from './payout'
import BankPanel from './BankPanel'
import { audio, installIOSAudioUnlockOnce, installVisibilityResumer } from './audio'
import { useCardsWarmup, allCardUrls } from './useCardsWarmup'
import './styles.css'

// (kept for future use)
function rankShort(rank: string) { return rank === '10' ? '10' : rank[0] }

const ORDER: (keyof typeof PAYTABLE_8_5)[] = [
  'Royal Flush','Straight Flush','Four of a Kind','Full House',
  'Flush','Straight','Three of a Kind','Two Pair','Jacks or Better'
]

// Map rank/suit → filename in /public/cards
function mapCardToFile(rank: string, suit: string): string {
  let rankName = ''
  switch(rank) {
    case 'A': rankName = 'ace'; break
    case 'J': rankName = 'jack'; break
    case 'Q': rankName = 'queen'; break
    case 'K': rankName = 'king'; break
    default:  rankName = rank.toLowerCase(); break
  }
  const suitName = suit === '♠' ? 'spades' : suit === '♥' ? 'hearts' : suit === '♦' ? 'diamonds' : 'clubs'
  return `${rankName}_of_${suitName}.svg`
}

type CardFaceProps = { rank: string; suit: string; held: boolean; onClick: () => void }
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

function Paytable({ bet, highlight }: { bet: number; highlight?: keyof typeof PAYTABLE_8_5 | null }) {
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
        {ORDER.map(hand=>(
          <tr key={hand} className={highlight === hand ? 'hl' : ''}>
            <td>{hand}</td>
            {PAYTABLE_8_5[hand].map((payout, i)=>(
              <td key={i} className={i+1===bet ? 'active' : ''}>{payout}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function App(){
  const g = useGame()

  /* ========= Audio toggle + iOS unlock ========= */
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    const s = localStorage.getItem('soundOn')
    return s === null ? true : s === 'true'
  })
  useEffect(() => { audio.toggle(soundOn); localStorage.setItem('soundOn', String(soundOn)) }, [soundOn])
  useEffect(() => { installIOSAudioUnlockOnce(); installVisibilityResumer() }, [])

  /* ========= Request persistent storage ========= */
  useEffect(() => {
    (async () => {
      try { if ('storage' in navigator && 'persist' in navigator.storage) await (navigator.storage as any).persist?.() } catch {}
    })()
  }, [])

  /* ========= First-run warm-up overlay (non-blocking) ========= */
  const cardUrls = useMemo(() => allCardUrls(mapCardToFile), [])
  const shouldWarm = /iPad|iPhone|iPod/.test(navigator.userAgent) || ((navigator.platform === 'MacIntel') && (navigator as any).maxTouchPoints > 1)
  const { progress, running, finished } = useCardsWarmup(cardUrls, shouldWarm && !(navigator as any)?.connection?.saveData)
  const [hideWarm, setHideWarm] = useState(false)
  // IMPORTANT: Never show warm-up overlay when coach suggestion is active
  const showWarmOverlay = running && !finished && !hideWarm && !g.suggestion

  /* ========= Preload current hand SVGs (snappy next paints) ========= */
  useEffect(() => {
    if (!g.hand?.length) return
    const imgs = g.hand.map(c => {
      const img = new Image()
      img.decoding = 'async'
      img.src = `/cards/${mapCardToFile(c.rank, c.suit)}`
      return img
    })
    return () => { imgs.forEach(img => { (img as any).src = '' }) }
  }, [g.hand])

  /* ========= Bet One (cycles 1→5 and wraps) + wrap pulse ========= */
  const [wrapPulse, setWrapPulse] = useState(false)
  const triggerWrapPulse = useCallback(() => {
    setWrapPulse(false)
    requestAnimationFrame(() => {
      setWrapPulse(true)
      setTimeout(() => setWrapPulse(false), 240)
    })
  }, [])

  const canAdjustBet = g.phase === 'bet' || g.phase === 'show'
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
    if (!g.result) { lastWinRef.current = null; return }
    const key = `${g.result.rank}|${g.result.payout}`
    if (key === lastWinRef.current) return
    lastWinRef.current = key
    if (g.result.payout <= 0) return
    const r = String(g.result.rank)
    const tier: 'small'|'med'|'big'|'royal' =
      r === 'Jacks or Better' || r === 'Two Pair' ? 'small' :
      r === 'Three of a Kind' ? 'med' :
      r === 'Straight' || r === 'Flush' || r === 'Full House' ? 'big' :
      r === 'Four of a Kind' || r === 'Straight Flush' || r === 'Royal Flush' ? 'royal' : 'small'
    audio.win(tier)
  }, [g.result])

  /* ========= Actions ========= */
  const onDeal = useCallback(() => { audio.dealBurst(); g.deal() }, [g.deal])
  const onDraw = useCallback(() => { audio.draw(); g.draw() }, [g.draw])
  const onMaxBet = useCallback(() => { if (canAdjustBet) audio.clickHi(); g.setMaxBet() }, [g.setMaxBet, canAdjustBet])

  /* ========= Keyboard shortcuts ========= */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [g.hand, g.canDeal, g.canDraw, canAdjustBet, betOne, onDeal, onDraw, onMaxBet])

  const paytableHighlight = useMemo<keyof typeof PAYTABLE_8_5 | null>(() => {
    return (g.result?.rank as any) || (g.initialRank as any) || null
  }, [g.result?.rank, g.initialRank])

  return (
    <div className="app">
      <h2 className="title">Video Poker — Jacks or Better (8/5)</h2>

      <div className="layout">
        {/* Game column */}
        <div className="table">
          <div className="row" style={{gap:12}}>
            <div>Credits: <b>{g.credits}</b></div>
            <div>Bet: <b>{g.bet}</b></div>
            <div>Rewards: <b>{g.rewardsPoints}</b></div>
            <div>Accuracy: <b>{g.accCorrect}/{g.accTotal}</b> ({g.accuracyPct}%)</div>
          </div>

          {/* Money controls */}
          <div className="controls" style={{marginTop:8}}>
            <button type="button" onClick={()=>{ audio.thud(); g.insert(1) }}>Insert $1</button>
            <button type="button" onClick={()=>{ audio.thud(); g.insert(5) }}>Insert $5</button>
            <button type="button" onClick={g.cashOutAll} disabled={g.credits===0}>Cash Out</button>
            <button
              type="button"
              aria-pressed={soundOn}
              onClick={() => setSoundOn(s => !s)}
              title={soundOn ? 'Turn sound off' : 'Turn sound on'}
            >
              {soundOn ? 'Sound: On' : 'Sound: Off'}
            </button>
          </div>

          {/* Betting + actions — Bet One (wraps) + Max Bet */}
          <div className="controls">
            <button
              type="button"
              onClick={betOne}
              disabled={!canAdjustBet}
              className={`betOneBtn ${wrapPulse ? 'is-pulsing' : ''}`}
              aria-label="Bet One (cycles 1 to 5 and wraps to 1)"
            >
              Bet One
            </button>
            <button type="button" onClick={onMaxBet} disabled={!canAdjustBet}>Max Bet</button>
            <button type="button" onClick={onDeal} disabled={!g.canDeal}>Deal</button>
            <button type="button" onClick={onDraw} disabled={!g.canDraw}>Draw</button>
          </div>

          {/* Cards */}
          <div className="cards">
            {g.hand.length ? g.hand.map((c, i)=>(
              <CardFace
                key={c.id}
                rank={c.rank}
                suit={c.suit}
                held={g.holds[i]}
                onClick={()=>{
                  const before = g.holds[i]
                  g.toggleHold(i)
                  before ? audio.holdOff() : audio.holdOn()
                }}
              />
            )): (
              <p style={{opacity:.7, margin:'16px 0'}}>Tap Deal to begin. Tap cards to HOLD before Draw.</p>
            )}
          </div>

          {/* Outcomes */}
          <div className="payouts" aria-live="polite">
            {g.initialRank && (
              <div style={{marginTop:6}}>
                Initial deal: <b>{g.initialRank}</b>
              </div>
            )}
            {g.result && (
              <div style={{marginTop:6}}>
                Result: <b>{g.result.rank}</b> &nbsp; Payout: <b>{g.result.payout}</b>
              </div>
            )}
          </div>

          {/* Paytable */}
          <Paytable bet={g.bet} highlight={paytableHighlight} />

          <div style={{marginTop:6, opacity:0.8, fontStyle:'italic'}}>
            8/5 Jacks or Better paytable shown above.
          </div>
        </div>

        {/* Side panel */}
        <BankPanel />
      </div>

      {/* Coaching modal — restored, with higher z-index than warm overlay */}
      {g.suggestion && (
        <div className="modal" style={{ zIndex: 60 }} role="dialog" aria-modal="true" aria-label="Trainer suggestion">
          <div className="modalBox">
            <h4>Trainer: A better hold is suggested</h4>
            <p style={{opacity:.85, marginTop:4}}>
              These highlighted cards are the statistically best hold for 8/5 Jacks or Better.
              You have one chance to apply the suggestion this round.
            </p>
            <div className="hintCards">
              {g.hand.map((c, i) => {
                const fileName = mapCardToFile(c.rank, c.suit)
                const keep = g.suggestion![i]
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

      {/* First-run warm-up overlay (non-blocking, dismissible) — lower z-index */}
      {showWarmOverlay && (
        <div className="modal" style={{ zIndex: 40 }} role="status" aria-live="polite">
          <div className="modalBox">
            <h4>Optimizing graphics…</h4>
            <p style={{opacity:.85, marginTop:4}}>
              Caching card art for smoother play. You can start now—this will finish in the background.
            </p>
            <div className="progressBar" style={{marginTop:10, background:'rgba(255,255,255,.12)', borderRadius:8, height:10, overflow:'hidden'}}>
              <div style={{width:`${progress.percent}%`, height:'100%', background:'rgba(255,255,255,.6)'}} />
            </div>
            <div className="row" style={{marginTop:8, justifyContent:'space-between', fontSize:14, opacity:.9}}>
              <span>{progress.done}/{progress.total}</span>
              <button type="button" onClick={()=>setHideWarm(true)}>Hide</button>
            </div>
          </div>
        </div>
      )}

      <small style={{opacity:.6}}>
        Coaching: you’ll be prompted at most once per round. Correct rounds (no prompt) count toward accuracy; prompted rounds score 0.
      </small>
    </div>
  )
}

