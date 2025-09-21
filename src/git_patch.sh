git apply -p0 <<'PATCH'
*** Begin Patch
*** Update File: src/App.tsx
@@
-async function preloadImagesWithProgress(
-  urls: string[],
-  onOneDone: (url: string, ok: boolean) => void,
-  perImageTimeoutMs = 6000
-): Promise<void> {
+async function preloadImagesWithProgress(
+  urls: string[],
+  onOneDone: (url: string, ok: boolean) => void,
+  perImageTimeoutMs = 6000
+): Promise<void> {
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
@@
   useEffect(() => {
     let cancelled = false
     const urls = buildAllCardUrls()
     ;(async () => {
-      await preloadImagesWithProgress(urls, (url, ok) => {
+      // Give Pages/Access more time: 15s per image
+      await preloadImagesWithProgress(urls, (url, ok) => {
         if (cancelled) return
         setCardDone(d => d + 1)
-        if (!ok) setCardFailures(f => f.concat(url))
-      })
+        if (!ok) {
+          try { console.error('[Card preload] FAILED:', url) } catch {}
+          setCardFailures(f => f.concat(url))
+        }
+      }, 15000)
       if (!cancelled) setCardsFinished(true)
     })()
     return () => { cancelled = true }
   }, [])
@@
-  useEffect(() => {
-    if (!startupDone && cardsFinished && audioDone >= audioTotal) setStartupDone(true)
-  }, [cardsFinished, audioDone, audioTotal, startupDone])
+  // Auto-dismiss only if everything is warmed and there were NO card failures
+  useEffect(() => {
+    if (!startupDone && cardsFinished && audioDone >= audioTotal && cardFailures.length === 0) {
+      setStartupDone(true)
+    }
+  }, [cardsFinished, audioDone, audioTotal, startupDone, cardFailures.length])
@@
-            ) : (
+            ) : (
               <>
                 <h3 style={{margin:'0 0 6px'}}>Loading audio… <span style={{opacity:.9}}>{audioPercent}%</span></h3>
                 <div className="progressBar" style={{marginTop:6, background:'rgba(255,255,255,.12)', borderRadius:8, height:12, overflow:'hidden'}}>
                   <div style={{width:`${audioPercent}%`, height:'100%', background:'rgba(255,255,255,.75)'}} />
                 </div>
                 <div className="row" style={{marginTop:10, gap:10, fontSize:14}}>
                   <div style={{flex:1}}>Audio: {audioDone}/{audioTotal}{audioFailures.length ? ` (failed ${audioFailures.length})` : ''}</div>
                 </div>
+                {/* Keep card failures visible on this stage too */}
+                {cardFailures.length > 0 && (
+                  <div style={{marginTop:10}}>
+                    <div style={{fontSize:14, marginBottom:6}}>
+                      Cards finished with <b>{cardFailures.length}</b> failures.
+                    </div>
+                    <details open style={{marginTop:4}}>
+                      <summary style={{cursor:'pointer'}}>Show failed card files</summary>
+                      <ul style={{margin:'6px 0 0 18px', maxHeight:160, overflow:'auto'}}>
+                        {cardFailures.map(u => (
+                          <li key={u} style={{opacity:.85}}>
+                            <a href={u} target="_blank" rel="noreferrer">{u}</a>
+                          </li>
+                        ))}
+                      </ul>
+                    </details>
+                  </div>
+                )}
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
*** End Patch
PATCH

