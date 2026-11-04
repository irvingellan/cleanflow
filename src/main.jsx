import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import '@fontsource-variable/inter/wght.css'
import './index.css'
import './styles/system.css'
import './styles/shell.css'
import './styles/workspace.css'
import './styles/services.css'
import './styles/checklist.css'
import './styles/directories.css'
import { TranslationProvider } from './i18n/translations.js'
import { EnvironmentBanner } from './components/EnvironmentBanner.jsx'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TranslationProvider>
      <EnvironmentBanner />
      <App />
    </TranslationProvider>
  </StrictMode>,
)
