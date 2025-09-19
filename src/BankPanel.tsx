// src/BankPanel.tsx
import React, { useEffect, useState, useMemo } from 'react'

export default function BankPanel({
  specId,
  gameTitle,
  rewardsPoints,
  onResetAccuracy,
  onResetRewards,
}: {
  specId: string
  gameTitle: string
  rewardsPoints: number
  onResetAccuracy: () => void
  onResetRewards: () => void
}) {
  // Keys shared with games
  const BANK_KEY         = 'bank_balance'
  const P_IN_KEY         = 'bank_in_total'
  const P_OUT_KEY        = 'bank_out_total'
  const REWARDS_KEY      = 'rewards_points'        // read-only display here

  const readNum = (k: string, d = 0) => {
    const n = Number(localStorage.getItem(k))
    return Number.isFinite(n) ? n : d
  }
  const fmtMoney = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

  // Ensure bank exists (seed to $500 once)
  useEffect(() => {
    if (localStorage.getItem(BANK_KEY) === null) {
      localStorage.setItem(BANK_KEY, '500')
      window.dispatchEvent(new Event('app:bank'))
    }
  }, [])

  // Live bank state
  const [bank, setBank] = useState<number>(() => readNum(BANK_KEY, 500))
  const [pIn, setPIn]   = useState<number>(() => readNum(P_IN_KEY, 0))
  const [pOut, setPOut] = useState<number>(() => readNum(P_OUT_KEY, 0))
  const [rewards, setRewards] = useState<number>(() => readNum(REWARDS_KEY, 0))

  // Mini-ATM amount (allow cents)
  const [amt, setAmt] = useState<number>(50)

  // Listen for updates emitted by games
  useEffect(() => {
    const onBank = () => setBank(readNum(BANK_KEY, 500))
    const onTotals = () => { setPIn(readNum(P_IN_KEY, 0)); setPOut(readNum(P_OUT_KEY, 0)) }
    const onRewards = () => setRewards(readNum(REWARDS_KEY, 0))

    window.addEventListener('app:bank', onBank)
    window.addEventListener('app:bank_totals', onTotals)
    window.addEventListener('app:rewards', onRewards)
    return () => {
      window.removeEventListener('app:bank', onBank)
      window.removeEventListener('app:bank_totals', onTotals)
      window.removeEventListener('app:rewards', onRewards)
    }
  }, [])

  const net = useMemo(() => pOut - pIn, [pIn, pOut])

  // Add to BANK (supports cents)
  function addToBank(delta: number) {
    const add = Math.max(0, Number(delta || 0))
    if (!Number.isFinite(add) || add <= 0) return
    const next = +(bank + add).toFixed(2)
    localStorage.setItem(BANK_KEY, String(next))
    setBank(next)
    window.dispatchEvent(new Event('app:bank'))
  }

  // Rewards reset confirmation
  const [confirmRewardsOpen, setConfirmRewardsOpen] = useState(false)

  return (
    <aside className="sidePanel">
      <h4 style={{marginTop:0}}>Bank &amp; Rewards</h4>
      <div className="panelBox">
        <div className="row" style={{justifyContent:'space-between'}}>
          <div>Bank balance</div>
          <b>${fmtMoney(bank)}</b>
        </div>
        <div className="row" style={{justifyContent:'space-between', opacity:.9}}>
          <div>Money inserted</div>
          <div>${fmtMoney(pIn)}</div>
        </div>
        <div className="row" style={{justifyContent:'space-between', opacity:.9}}>
          <div>Money cashed out</div>
          <div>${fmtMoney(pOut)}</div>
        </div>
        <div className="row" style={{justifyContent:'space-between', marginTop:6}}>
          <div>Net P/L</div>
          <b style={{color: net >= 0 ? 'var(--good, #7CFC7C)' : 'var(--bad, #FF8C8C)'}}>
            ${fmtMoney(net)}
          </b>
        </div>

        <hr style={{opacity:.15, margin:'10px 0'}} />

        <div className="row" style={{justifyContent:'space-between'}}>
          <div>Rewards points</div>
          <b>{rewardsPoints ?? rewards}</b>
        </div>

        {/* Mini-ATM to add funds to the BANK */}
        <div style={{marginTop:10}}>
          <div style={{marginBottom:6, opacity:.9}}>Add funds to bank</div>
          <div className="controls" style={{gap:8, flexWrap:'wrap'}}>
            <button type="button" onClick={() => addToBank(20)}>$20</button>
            <button type="button" onClick={() => addToBank(50)}>$50</button>
            <button type="button" onClick={() => addToBank(100)}>$100</button>
          </div>
          <div className="row" style={{gap:8, alignItems:'center', marginTop:8, flexWrap:'wrap'}}>
            <label htmlFor="bankAdd" style={{opacity:.9}}>Custom</label>
            <input
              id="bankAdd"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0.01}
              value={amt}
              onChange={(e)=>setAmt(Math.max(0.01, Number(e.target.value)||0))}
              style={{width:140, padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.15)', background:'rgba(255,255,255,.06)', color:'white'}}
            />
            <button type="button" onClick={()=>addToBank(amt)}>Add</button>
          </div>
          <small style={{opacity:.7, display:'block', marginTop:6}}>
            The bank is your outside wallet. Use “Insert $10 / $50 / $100” at the table to move money into credits.
          </small>
        </div>

        <hr style={{opacity:.15, margin:'10px 0'}} />

        <div className="controls" style={{gap:8, flexWrap:'wrap'}}>
          <button
            type="button"
            onClick={() => onResetAccuracy()}
            title={`Reset accuracy only for ${gameTitle}`}
          >
            Reset Accuracy ({gameTitle})
          </button>

          <button
            type="button"
            onClick={() => setConfirmRewardsOpen(true)}
            title="Clear rewards points & remainder"
          >
            Reset Rewards…
          </button>
        </div>
      </div>

      {/* Rewards reset confirm modal */}
      {confirmRewardsOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Confirm rewards reset" style={{ zIndex: 70 }}>
          <div className="modalBox">
            <h4 style={{marginTop:0}}>Clear rewards totals?</h4>
            <p style={{marginTop:4, opacity:.9}}>
              Are you sure you want to clear your rewards totals?
            </p>
            <div className="controls" style={{justifyContent:'flex-end', gap:8}}>
              <button onClick={() => setConfirmRewardsOpen(false)}>No</button>
              <button
                onClick={() => { onResetRewards(); setConfirmRewardsOpen(false) }}
                style={{background:'var(--destructive, #aa3333)'}}
              >
                Yes, clear
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

