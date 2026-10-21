# Manager Workspace V3 — interactive prototype

Synthetic, standalone prototype of the next manager experience. Not part of the
Production app: separate entry, separate Vite config, no Firebase, no env files,
no network calls. All data is invented; nothing is sent.

```sh
npm run prototype:v3          # dev server, opens /prototypes/manager-workspace-v3/index.html
npm run prototype:v3:test     # 25 model and interaction tests
npm run prototype:v3:build    # static build in dist-prototypes/manager-workspace-v3 (git-ignored)
```

What you can do:

- Switch layouts in the header: **Híbrido C+A** (recommended), **A** Calm Workspace, **B** Attention Cockpit, **C** Intent First. All four share one state.
- Switch the date range: Hoje, Amanhã, Semana, arrows, or any date (America/Los_Angeles days).
- Hybrid: **Agora** (what needs you, where to start, commands) and **Operação** (dense list, detail, next action).
- Assign a cleaner, send an offer with the known payout, open the cleaner's view and answer "Tenho interesse", review a checklist, complete a service, resolve an issue, create a service, edit a property's checklist template, read the notification inbox.
- **Cleaner view** (phone icon): offer page and checklist with photo upload, failure/retry and an unmistakable submit.
- Menu ⋯: language (PT/EN/ES), theme, reset demo. Demo state is kept in this browser only.

Specs: `docs/manager-workspace-v3/`.
