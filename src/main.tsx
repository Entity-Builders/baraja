import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import './index.css'
import App from './App.tsx'
import { initAnalytics } from './services/analytics'
import { registerBarajaServiceWorker } from './registerServiceWorker'

if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  win.global = win;
  win.Buffer = Buffer;
  win.process = { env: {} };
}

initAnalytics()
registerBarajaServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
