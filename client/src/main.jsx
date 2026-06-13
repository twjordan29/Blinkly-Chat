import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Register PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        if (import.meta.env.DEV) {
          console.info('SW registered: ', registration);
        }
      })
      .catch(registrationError => {
        if (import.meta.env.DEV) {
          console.warn('SW registration failed: ', registrationError);
        }
      });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
