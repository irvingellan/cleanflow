import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Feature stylesheets, pinned in today's cascade order so lazy entries cannot reorder them.
import './features/client-portal/clientPortal.css'
import './features/checklists/checklistPhotoGallery.css'
import './features/cleaner-hub/cleanerHub.css'
import './features/jobs/compactServiceLifecycle.css'
import './features/jobs/serviceLifecycle.css'
import './features/jobs/CleanerSelectionContext.css'
import './features/cleaner-agenda/cleanerAgenda.css'
import './features/cleaner-alerts/cleanerAlerts.css'
import App, { preloadCurrentEntry } from './App.jsx'
import '@fontsource-variable/inter/wght.css'
import './index.css'
import './styles/system.css'
import './styles/shell.css'
import './styles/workspace.css'
import './styles/services.css'
import './styles/checklist.css'
import './styles/directories.css'
import './styles/devcenter.css'
import { TranslationProvider } from './i18n/translations.js'
import { EnvironmentBanner } from './components/EnvironmentBanner.jsx'

preloadCurrentEntry()

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const cleanerEntry = location.pathname.startsWith('/agenda')
      || document.querySelector('link[rel="manifest"][href="/agenda.webmanifest"]')
    const workers = navigator.serviceWorker
    const registration = cleanerEntry
      ? workers.getRegistration('/').then((existing) => {
        if (existing?.scope === new URL('/', location.origin).href
          && [existing.active, existing.waiting, existing.installing].some(
            (worker) => worker?.scriptURL === new URL('/sw.js', location.origin).href,
          )) return existing.unregister()
      })
      : workers.register('/sw.js', { updateViaCache: 'none' })
    registration.catch(() => window.__cleanflowStartup?.workerFailed())
  })
}

const startup = window.__cleanflowStartup
createRoot(document.getElementById('root'), startup ? {
  onUncaughtError: () => startup.renderFailed(),
} : undefined).render(
  <StrictMode>
    <TranslationProvider>
      <EnvironmentBanner />
      <App />
    </TranslationProvider>
  </StrictMode>,
)
