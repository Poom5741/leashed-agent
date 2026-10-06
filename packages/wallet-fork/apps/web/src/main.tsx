import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrivacyPage, TermsPage } from './components/Legal.tsx'

// Wallet mounts under /wallet/ inside the platform Pages origin — derive the
// base from the live pathname so legal pages work whether we're at /privacy
// (local dev) or /wallet/privacy (production).
const BASE = window.location.pathname.startsWith('/wallet/') ? '/wallet' : '';
const path = window.location.pathname;
const root = createRoot(document.getElementById('root')!)

if (path === `${BASE}/privacy`) {
  root.render(<StrictMode><PrivacyPage /></StrictMode>)
} else if (path === `${BASE}/terms`) {
  root.render(<StrictMode><TermsPage /></StrictMode>)
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
