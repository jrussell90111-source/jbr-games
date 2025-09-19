// src/BlackjackScreen.tsx
import React from 'react'
import { useBlackjack } from './useBlackjack'
import type { BlackjackRules } from './games/blackjack'
import { valueOfHand } from './games/blackjack'
import BankPanel from './BankPanel'

type SuitSym = '♣'|'♦'|'♥'|'♠'

// Map to your SVG filenames in /public/cards
function mapCardToFile(rank: string, suit: SuitSym): string {
  const rankName =
    rank === 'A' ? 'ace' :
    rank === 'K' ? 'king' :
    rank === 'Q' ? 'queen' :
    rank === 'J' ? 'jack' :
    rank.toLowerCase()
  const suitName = suit === '♠' ? 'spades' : suit === '♥' ? 'hearts' : suit === '♦' ? 'diamonds' : 'clubs'
  return `${rankName}_of_${suitName}.svg`
}

const fmtMoney = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

export default function BlackjackScreen({ rules, onBack }: { rules: BlackjackRules; onBack: () => void }) {
  const g = useBlackjack(rules)

  // ----- Result bar visuals (static row; cleared on Deal) -----
  const hasResult = g.lastWinLoss !== null
  const resultText =
    g.lastWinLoss === null ? '' :
    g.lastWinLoss === 0 ? 'Push' :
    g.lastWinLoss > 0 ? `Won $${fmtMoney(Math.abs(g.lastWinLoss))}` :
                        `Lost $${fmtMoney(Math.abs(g.lastWinLoss))}`

  const resultBg =
    g.lastWinLoss === null ? 'rgba(255,255,255,.06)' :
    g.lastWinLoss > 0 ? 'rgba(0,160,0,.18)' :
    g.lastWinLoss < 0 ? 'rgba(200,0,0,.18)' :
                        'rgba(255,255,255,.06)'

  const resultColor =
    g.lastWinLoss === null ? '#E6EAFF' :
    g.lastWinLoss > 0 ? '#7CFF7C' :
    g.lastWinLoss < 0 ? '#FF8B8B' :
                        '#E6EAFF'

  // Static action buttons: always visible; just disabled when not applicable
  const allowHit    = g.phase === 'player' && g.canHit   && !g.uiActionBusy
  const allowStand  = g.phase === 'player' && g.canStand && !g.uiActionBusy
  const allowDouble = g.phase === 'player' && g.canDbl   && !g.uiActionBusy
  const allowSplit  = g.phase === 'player' && g.canSplt  && !g.uiActionBusy

  return (
    <div className="layout">
      {/* ======= TABLE ======= */}
      <div className="table">
        <h3 className="title" style={{marginTop:0}}>{rules.title}</h3>

        <div className="row" style={{gap:12}}>
          <div>Credits: <b>{fmtMoney(g.credits)}</b></div>
          <div>Bet: <b>${fmtMoney(g.bet)}</b> <span style={{opacity:.7}}>(min {rules.minBet}, max {rules.maxBet})</span></div>
          <div>Accuracy: <b>{g.accC}/{g.accT}</b> ({g.accuracyPct}%)</div>
        </div>

        {/* Static Result bar */}
        <div
          style={{
            marginTop:8,
            padding:'8px 10px',
            borderRadius:8,
            border:'1px solid rgba(255,255,255,.12)',
            background: resultBg,
            minHeight: 36,
            display:'flex',
            alignItems:'center'
          }}
          aria-live={hasResult ? 'polite' : undefined}
        >
          <span style={{opacity:.9}}>Result:&nbsp;</span>
          <b style={{color: resultColor}}>
            {resultText || '\u00A0'}
          </b>
        </div>

        {/* Money */}
        <div className="controls" style={{marginTop:8}}>
          <button onClick={()=>g.insert(10)}>+$10</button>
          <button onClick={()=>g.insert(50)}>+$50</button>
          <button onClick={()=>g.insert(100)}>+$100</button>
          <button onClick={g.cashOutAll} disabled={g.credits===0}>Cash Out</button>
        </div>

        {/* Betting controls */}
        <div className="controls">
          <button onClick={()=>g.addBet(-rules.minBet)} disabled={!g.canAdjustBet}>−{rules.minBet}</button>
          <button onClick={()=>g.addBet(+rules.minBet)} disabled={!g.canAdjustBet}>+{rules.minBet}</button>
          <button onClick={g.setMinBet} disabled={!g.canAdjustBet}>Min Bet</button>
          <button onClick={g.setMaxBet} disabled={!g.canAdjustBet}>Max Bet</button>
          <button onClick={()=>g.deal()} disabled={!g.canDeal}>Deal</button>
        </div>

        {(!g.canDeal && (g.bet > g.credits)) && (
          <div style={{marginTop:6, fontSize:12, color:'#ff8c8c'}}>
            Not enough credits for ${fmtMoney(g.bet)}. Lower your bet or insert funds.
          </div>
        )}

        {/* Dealer */}
        <div style={{marginTop:10}}>
          <h4 style={{display:'flex', alignItems:'center', gap:8}}>
            Dealer
            {g.phase !== 'bet' && g.dealerFinalTotal !== null && (
              <span style={{opacity:.85}}>
                — Total: <b>{g.dealerFinalTotal}</b>
                {g.dealerNatural && <b style={{color:'#ffd54a', marginLeft:8}}>BLACKJACK</b>}
                {g.dealerBusted && <b style={{color:'#ff7676', marginLeft:8}}>BUST</b>}
              </span>
            )}
          </h4>
          <div className="cards" style={{gap:8}}>
            {g.dealer.cards.map((c, i) => {
              const show = i === 0 || g.dealer.holeRevealed
              return (
                <div key={`dealer-${i}`} className="card">
                  <img
                    src={show ? `/cards/${mapCardToFile(c.rank as any, c.suit as any)}` : `/cards/back.svg`}
                    alt={show ? `${c.rank} ${c.suit}` : 'Back'}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* Player hands */}
        <div style={{marginTop:12}}>
          <h4>Player</h4>
          {g.hands.map((h, handIdx) => {
            const v = valueOfHand(h.cards)
            const isActive = (g.phase==='player' && g.activeIndex===handIdx)
            const softTag = (v.soft && v.total !== 21) ? ' (soft)' : ''
            return (
              <div
                key={`hand-${handIdx}`}
                style={{
                  marginBottom:10,
                  padding:8,
                  border:'1px solid rgba(255,255,255,.1)',
                  borderRadius:8,
                  background:isActive?'rgba(255,255,255,.04)':'transparent'
                }}
              >
                <div className="cards" style={{gap:8}}>
                  {h.cards.map((c, i) => (
                    <div key={`h${handIdx}-c${i}`} className="card">
                      <img src={`/cards/${mapCardToFile(c.rank as any, c.suit as any)}`} alt={`${c.rank} ${c.suit}`} />
                    </div>
                  ))}
                </div>
                <div style={{marginTop:6, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                  <div>Bet: <b>${fmtMoney(h.bet)}{h.wasDoubled ? ' (doubled)' : ''}</b></div>
                  <div>Total: <b>{v.total}{softTag}</b></div>
                  {h.isBlackjackNatural && <b style={{color:'#ffd54a'}}>BLACKJACK</b>}
                  {h.busted && <b style={{color:'#ff7676'}}>BUST</b>}
                  {h.isSplitAces && <span style={{opacity:.7}}>Split Aces</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Static Actions row — always rendered, grays out when not usable */}
        <div
          className="controls"
          style={{
            opacity: g.phase === 'player' ? 1 : 0.6,
            marginTop: 6
          }}
        >
          <button onClick={g.hit}        disabled={!allowHit}>Hit</button>
          <button onClick={g.stand}      disabled={!allowStand}>Stand</button>
          <button onClick={g.doubleDown} disabled={!allowDouble}>Double</button>
          <button onClick={g.split}      disabled={!allowSplit}>Split</button>
        </div>

        {/* Insurance offer */}
        {g.phase === 'insurance' && (
          <div
            className="panel"
            style={{marginTop:10, borderColor:'#31408a'}}
            role="dialog" aria-modal="true" aria-label="Insurance offer"
          >
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap'}}>
              <div>
                Dealer shows <b>Ace</b>. Take insurance for <b>½ bet</b>? (pays 2:1)
              </div>
              <div className="controls" style={{gap:8}}>
                <button onClick={g.takeInsurance}>Take Insurance</button>
                <button onClick={g.declineInsurance} className="primaryAction">No Thanks</button>
              </div>
            </div>
          </div>
        )}

        {/* Settings row */}
        <div style={{marginTop:10, display:'flex', gap:12, alignItems:'center'}}>
          <label style={{display:'flex', alignItems:'center', gap:6}}>
            <input type="checkbox" checked={g.hintsEnabled} onChange={e=>g.setHintsEnabled(e.target.checked)} />
            Trainer on (prompts only on mistakes)
          </label>
          <button onClick={g.resetAccuracy}>Reset Accuracy</button>
          <button onClick={onBack} style={{marginLeft:'auto'}}>Back to Games</button>
        </div>
      </div>

      {/* ======= BANK PANEL ======= */}
      <BankPanel
        specId="BJ"
        gameTitle={rules.title}
        rewardsPoints={g.rewardsPoints}
        onResetAccuracy={g.resetAccuracy}
        onResetRewards={g.resetRewards}
      />

      {/* Coaching modal — only on incorrect *normal* actions */}
      {g.trainerPrompt && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Trainer suggestion" style={{ zIndex: 60 }}>
          <div className="modalBox">
            <h4>Trainer: A better play is suggested</h4>
            <div style={{marginTop:6}}>
              Your choice: <b>{g.trainerPrompt.user}</b> &nbsp;·&nbsp; Basic strategy: <b>{g.trainerPrompt.suggested}</b>
            </div>
            <div className="controls" style={{justifyContent:'flex-end'}}>
              <button onClick={g.applyTrainerSuggestion} className="primaryAction">Apply Suggestion</button>
              <button onClick={g.keepUserAction}>Keep My Choice</button>
            </div>
            <div style={{opacity:.7, fontSize:12, marginTop:6}}>
              Prompted hands count toward attempts but not correct; correct plays without a prompt increase both totals.
            </div>
          </div>
        </div>
      )}

      {/* Insurance trainer modal — only if user chose INSURE on BJ10/BJ15 */}
      {g.insurancePrompt && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Insurance trainer" style={{ zIndex: 60 }}>
          <div className="modalBox">
            <h4>Trainer: Decline Insurance</h4>
            <p style={{marginTop:6, opacity:.95}}>
              Basic strategy recommends <b>not</b> taking insurance.
            </p>
            <div className="controls" style={{justifyContent:'flex-end'}}>
              <button onClick={g.applyInsuranceSuggestion} className="primaryAction">Decline Insurance</button>
              <button onClick={g.keepInsuranceChoice}>Keep Insurance</button>
            </div>
            <div style={{opacity:.7, fontSize:12, marginTop:6}}>
              Your choice will count toward accuracy for this hand.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

