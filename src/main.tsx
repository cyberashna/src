import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .then(() => caches.keys())
    .then((keys) => Promise.all(keys.filter((key) => /workbox|precache|vite-pwa/i.test(key)).map((key) => caches.delete(key))))
    .catch(() => {
      // Dev-only cache cleanup is best effort.
    })
}

if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  void import('drag-drop-touch')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
