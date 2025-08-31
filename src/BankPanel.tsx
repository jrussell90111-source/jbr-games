import React, { useEffect, useMemo, useState } from 'react'

const BANK_KEY   = 'bank_balance'
const CREDITS_KEY= 'credits'
const P_IN_KEY   = 'bank_in_total'
const P_OUT_KEY  = 'bank_out_total'
const REWARDS_KEY= 'rewards_points'

function readNum(key: string, def = 0) {
  const n = Number(localStorage.getItem(key))
  return Number.isFinite(n) ? n : def
}

function resetAccuracy() {
  localStorage.setItem('acc_correct', '0')
  localStorage.setItem('acc_total', '0')
  // let the game know stats changed
  window.dispatchEvent(new Event('app:accuracy'))
}

export default function BankPanel(){
  // Initialize with defaults (bank starts at $500 if unset)
  const [bank, setBank] = useState<number>(() => {
    const v = localStorage.getItem(BANK_KEY)
    if (v === null) { localStorage.setItem(BANK_KEY, '500'); return 500 }
    return readNum(BANK_KEY, 500)
  })
  const [credits, setCredits] = useState<number>(() => readNum(CREDITS_KEY, 200))
  const [inTotal, setInTotal] = useState<number>(() => readNum(P_IN_KEY, 0))
  const [outTotal, setOutTotal] = useState<number>(() => readNum(P_OUT_KEY, 0))
  const [rewards, setRewards] = useState<number>(() => readNum(REWARDS_KEY, 0))

  // --- NEW: add-funds mini ATM state
  const [amt, setAmt] = useState<number>(50)

  // Listen for updates from the game
  useEffect(()=>{
    const onCredits = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail
      if (typeof detail === 'number') setCredits(detail)
      else setCredits(readNum(CREDITS_KEY, 0))
    }
    const onBank = () => setBank(readNum(BANK_KEY, 0))
    const onBankTotals = () => { setInTotal(readNum(P_IN_KEY, 0)); setOutTotal(readNum(P_OUT_KEY, 0)) }
    const onRewards = () => setRewards(readNum(REWARDS_KEY, 0))

    window.addEventListener('app:credits', onCredits as EventListener)
    window.addEventListener('app:bank', onBank)
    window.addEventListener('app:bank_totals', onBankTotals)
    window.addEventListener('app:rewards', onRewards)

    return () => {
      window.removeEventListener('app:credits', onCredits as EventListener)
      window.removeEventListener('app:bank', onBank)
      window.removeEventListener('app:bank_totals', onBankTotals)
      window.removeEventListener('app:rewards', onRewards)
    }
  }, [])

  const netPL = useMemo(()=> outTotal - inTotal, [inTotal, outTotal])

  // --- NEW: add to bank + emit the same event your app already listens for
  function addToBank(delta: number) {
    const add = Math.max(0, Math.floor(delta || 0))
    if (!add) return
    const next = bank + add
    localStorage.setItem(BANK_KEY, String(next))
    setBank(next)
    window.dispatchEvent(new Event('app:bank'))
  }

  return (
    <div className="panel">
      <h3>Bank & Rewards</h3>
      <div className="row">Bank: <b>${bank}</b></div>
      <div className="row">Credits: <b>{credits}</b></div>
      <div className="row">Net P/L: <b style={{color: netPL>=0 ? '#77ff77' : '#ff7777'}}>
        {netPL>=0 ? '+' : ''}{netPL}
      </b></div>
      <div className="row">Rewards Points: <b>{rewards}</b></div>

      <div className="controls" style={{margin:'8px 0'}}>
        <button onClick={resetAccuracy}>Reset Accuracy</button>
      </div>

      {/* NEW: Add Funds mini-ATM */}
      <div className="controls" style={{margin:'8px 0'}}>
        <button onClick={()=>addToBank(20)}>$20</button>
        <button onClick={()=>addToBank(50)}>$50</button>
        <button onClick={()=>addToBank(100)}>$100</button>
      </div>
      <div className="row" style={{gap:8, alignItems:'center'}}>
        <label htmlFor="bankAdd">Add Funds</label>
        <input
          id="bankAdd"
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min={1}
          step={1}
          value={amt}
          onChange={(e)=>setAmt(Math.max(1, Math.floor(Number(e.target.value)||0)))}
          style={{width:110, padding:'8px 10px', borderRadius:8, border:'1px solid #31408a', background:'#0e1840', color:'white'}}
        />
        <button onClick={()=>addToBank(amt)}>Add</button>
      </div>

      <small>Net P/L = cash outs − inserts. Starting bank: $500. Deposits don’t affect P/L.</small>
    </div>
  )
}

