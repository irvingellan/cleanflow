# PWA install — UX contract

Component: `hub/InstallGuide.jsx` (props: `platform`, `context` = DisplayMode, `installPrompt`, `onInstalled`, `onSkip`).

## What the page can and cannot know

- Can: whether THIS window runs standalone (`display-mode: standalone`, iOS `navigator.standalone`).
- Cannot: whether the icon was added earlier on the same phone. Copy for a tab: "Não dá para saber daqui se o
  ícone já foi adicionado. Se já adicionou, abra por ele."
- Android may fire `beforeinstallprompt`; many browsers/versions never do. Show the install button only when
  the event was captured; always keep manual steps.

## iPhone (Safari)

1. Share button (square with up arrow) — bottom or top bar depending on layout.
2. "Adicionar à Tela de Início" (scroll, or "Ver mais"/"Editar ações", if hidden).
3. Keep "Abrir como app web" on when shown; tap Adicionar.
4. Open CleanFlow from the new icon — alerts only work there (iOS 16.4+) and after allowing.
Ask for permission only inside the Home Screen app and only after a tap.

## Android

- Prompt available: "Instalar o CleanFlow" → native dialog (simulated in the prototype).
- Manual: Chrome ⋮ → "Instalar app" / "Adicionar à tela inicial"; Samsung Internet ☰ → "Adicionar página a" → "Tela inicial".
- Alerts also work in a browser tab on Android; installing is recommended, not required.

## Always allowed: continue with limited functionality

"Fazer depois (o app funciona no navegador, com menos avisos)". The agenda and inbox work without install
or permission.

## Codex needs

Capture/defer `beforeinstallprompt`; report `displayMode`; detect iOS version support; `appinstalled` event to
update evidence; manifest/icons per #9/#19 (no change in this branch).
