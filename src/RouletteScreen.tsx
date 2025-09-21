// src/RouletteScreen.tsx
import React from 'react'
import { useRoulette } from './useRoulette'
import type { RouletteBet } from './games/roulette'

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

export default function RouletteScreen() {
  const g = useRoulette()

  const quickBets: RouletteBet[] = [
    { type:'red', amount:5 },
    { type:'black', amount:5 },
    { type:'odd', amount:5 },
    { type:'even', amount:5 },
    { type:'dozen1', amount:5 },
    { type:'dozen2', amount:5 },
    { type:'dozen3', amount:5 },
    { type:'straight', number:17, amount:1 },
  ]

  return (
    <div className="layout">
      <div className="table">
        <h3 className="title" style={{marginTop:0}}>Roulette (single zero)</h3>

        <div className="row" style={{gap:12}}>
          <div>Credits: <b>{fmt(g.credits)}</b></div>
          <div>Stake: <b>{fmt(g.totalStake)}</b></div>
          <div>Phase: <b>{g.phase}</b></div>
        </div>

        {/* money */}
        <div className="controls" style={{marginTop:8}}>
          <button onClick={()=>g.insert(10)}>+$10</button>
          <button onClick={()=>g.insert(50)}>+$50</button>
          <button onClick={()=>g.insert(100)}>+$100</button>
          <button onClick={g.cashOutAll} disabled={g.credits===0}>Cash Out</button>
        </div>

        {/* quick bet buttons */}
        <div className="controls" style={{flexWrap:'wrap'}}>
          {quickBets.map((b, i)=>(
            <button key={i} onClick={()=>g.addBet(b)} disabled={g.phase!=='bet'}>
              +{b.amount} {b.type}{b.type==='straight' ? ` ${b.number}` : ''}
            </button>
          ))}
          <button onClick={g.clearBets} disabled={g.phase!=='bet' || g.bets.length===0}>Clear Bets</button>
          <button onClick={g.spin} disabled={!g.canSpin}>Spin</button>
          <button onClick={g.newRound} disabled={g.phase!=='show'}>New Round</button>
        </div>

        {/* show placed bets */}
        <div style={{marginTop:8}}>
          <h4 style={{margin:'8px 0'}}>Placed Bets</h4>
          {g.bets.length===0 ? <div style={{opacity:.7}}>None</div> : (
            <ul style={{margin:'6px 0 0 18px'}}>
              {g.bets.map((b, i)=>(
                <li key={i} style={{marginBottom:4}}>
                  {b.type}{b.type==='straight' ? ` ${b.number}` : ''} — ${fmt(b.amount)}{' '}
                  {g.phase==='bet' && <button onClick={()=>g.removeBet(i)} style={{marginLeft:6}}>remove</button>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* outcome */}
        {g.phase !== 'bet' && g.outcome && (
          <div style={{marginTop:10, padding:'8px 10px', border:'1px solid rgba(255,255,255,.12)', borderRadius:8}}>
            <div>Outcome: <b>{g.outcome.number}</b> ({g.outcome.color})</div>
            <div>Net: <b style={{color: g.lastNet!>=0 ? '#7CFF7C' : '#FF8B8B'}}>${fmt(g.lastNet ?? 0)}</b></div>
          </div>
        )}
      </div>

      {/* (Optional) You can add a BankPanel here later to mirror other games */}
    </div>
  )
}
