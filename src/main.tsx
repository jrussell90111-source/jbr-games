// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Register the PWA service worker
import { registerSW } from 'virtual:pwa-register'
registerSW({ immediate: true }) // works with clientsClaim/skipWaiting

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

