// Warm all card SVGs into a named cache; report progress; remember completion.

import { useEffect, useState } from 'react'

type Progress = { done: number; total: number; percent: number }
const FLAG_KEY = 'cardsWarmed_v3'
const CACHE_NAME = 'cards-prewarm-v3'

export function allCardUrls(mapCardToFile: (r:string,s:string)=>string): string[] {
  const RANKS = ['A','K','Q','J','10','9','8','7','6','5','4','3','2']
  const SUITS: Array<'♠'|'♥'|'♦'|'♣'> = ['♠','♥','♦','♣']
  const urls: string[] = []
  for (const r of RANKS) for (const s of SUITS) urls.push(`/cards/${mapCardToFile(r, s)}`)
  return urls
}

export function useCardsWarmup(urls: string[], enabled = true) {
  const [progress, setProgress] = useState<Progress>({ done: 0, total: urls.length, percent: 0 })
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState<boolean>(() => localStorage.getItem(FLAG_KEY) === '1')

  useEffect(() => {
    if (!enabled || finished || !('caches' in window)) return

    let cancelled = false
    setRunning(true)

    ;(async () => {
      try {
        const cache = await caches.open(CACHE_NAME)
        let done = 0, total = urls.length

        const chunkSize = 6
        for (let i = 0; i < urls.length && !cancelled; i += chunkSize) {
          const chunk = urls.slice(i, i + chunkSize)
          await Promise.all(chunk.map(async (u) => {
            try {
              const hit = await cache.match(u)
              if (!hit) await cache.add(u)
            } catch {}
            done++
            if (!cancelled) {
              setProgress({ done, total, percent: Math.round((done / total) * 100) })
            }
          }))
          // yield back to UI a bit
          await new Promise(r => setTimeout(r, 0))
        }

        if (!cancelled) {
          setFinished(true)
          localStorage.setItem(FLAG_KEY, '1')
        }
      } finally {
        if (!cancelled) setRunning(false)
      }
    })()

    return () => { cancelled = true }
  }, [enabled, urls, finished])

  return { progress, running, finished }
}

