import React from 'react';
import { createRoot } from 'react-dom/client';
import { TranslationProvider } from '../../src/i18n/translations.js';
const params = new URLSearchParams(location.search);
const variant = params.get('variant') === 'current' ? 'current' : 'improved';
const lang = params.get('lang') === 'pt' ? 'pt' : 'en';
const scenario = params.get('scenario') || 'incomplete';
document.documentElement.lang = lang;
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
document.body.classList.add(`preview-${variant}`);
const [{ PublicChecklistPage }] = await Promise.all([
  variant === 'current' ? import('./currentPage.jsx') : import('../../src/features/checklists/PublicChecklistPage.jsx'),
  import('../../src/index.css'),
]);
function Preview() {
  return <><style>{`.preview-current .public-checklist__review-handoff { position: static; }`}</style><nav aria-label="Synthetic operator preview" style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
    <strong>SYNTHETIC ONLY · {variant.toUpperCase()}</strong>
    {['current', 'improved'].map(value => <a key={value} href={`?variant=${value}&lang=${lang}&scenario=${scenario}`}>{value.toUpperCase()}</a>)}
    <label>Scenario <select value={scenario} onChange={e => location.search = `?variant=${variant}&lang=${lang}&scenario=${e.target.value}`}>
      {['incomplete', 'ready', 'missing-photo', 'submitting', 'error', 'uncertain-response', 'submitted'].map(value => <option key={value}>{value}</option>)}
    </select></label>
    <a href={`?variant=${variant}&lang=${lang === 'en' ? 'pt' : 'en'}&scenario=${scenario}`}>EN / PT</a>
    <button onClick={() => { localStorage.removeItem(`synthetic-checklist:${variant}:${scenario}:${lang}`); location.reload(); }}>Reset synthetic fixture</button>
  </nav><PublicChecklistPage token={`synthetic-checklist:${variant}:${scenario}:${lang}`} /></>;
}
createRoot(document.getElementById('root')).render(<TranslationProvider><Preview /></TranslationProvider>);
