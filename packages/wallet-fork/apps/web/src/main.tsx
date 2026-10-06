import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrivacyPage, TermsPage } from './components/Legal.tsx'

// Standalone legal pages (LINE Developers console URLs) — served by the SPA
// asset fallback at /privacy and /terms.
const path = window.location.pathname;
const root = createRoot(document.getElementById('root')!)

if (path === '/privacy') {
  root.render(<StrictMode><PrivacyPage /></StrictMode>)
} else if (path === '/terms') {
  root.render(<StrictMode><TermsPage /></StrictMode>)
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
