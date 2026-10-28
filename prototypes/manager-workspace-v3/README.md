# Manager Workspace V3 — interactive prototype

Synthetic, standalone prototype of the next manager experience. Not part of the
Production app: separate entry, separate Vite config, no Firebase, no env files,
no network calls. All data is invented; nothing is sent.

```sh
npm run prototype:v3          # dev server, opens /prototypes/manager-workspace-v3/index.html
npm run prototype:v3:test     # 51 model and interaction tests
npm run prototype:v3:build    # static build in dist-prototypes/manager-workspace-v3 (git-ignored)
```

What you can do:

- Switch layouts in the header: **Híbrido C+A** (recommended), **A** Calm Workspace, **B** Attention Cockpit, **C** Intent First. All four share one state.
- Switch the date range: Hoje, Amanhã, Semana, arrows, or any date (America/Los_Angeles days).
- Hybrid: **Agora** (what needs you, where to start, commands) and **Operação** (dense list, detail, next action).
- Assign a cleaner, send an offer with the known payout, open the cleaner's view and answer "Tenho interesse", review a checklist, complete a service, resolve an issue, create a service, edit a property's checklist template, read the notification inbox.
- **Cleaner view** (phone icon): offer page and checklist with photo upload, failure/retry and an unmistakable submit.
- **Conta** (avatar, top right): account, language (PT/EN/ES), theme (light/dark/system), notification permission, devices and per-type preferences, help, and advanced diagnostics (no tokens) with reset demo.
- **Notificações** (bell): list newest first, search, filters, detail with delivery steps, "Simular push chegando" → tap the banner → the job opens and the notification stays unread → reopen it from the inbox.
- **Oficina** (dashed button): co-design "massinha" mode. Move, reorder, hide, restore and rename blocks on Agora, job detail, job actions and the top bar; compare with the original; approve/question each change; undo/redo; save and import a JSON file. Local to this browser — not live multi-person editing.
- Cleaner checklist: pick many photos at once, one-at-a-time upload with overall progress, retry only failed photos, remove draft photos, limits of 20 photos / 50 MB / 5 MB each (a 50-photo option is a labelled simulation), and a stepper from draft to formally completed.
- Property sheet: checklist items required/optional, photo guidance, N/A, notes, preview as the cleaner, versions.
Demo state is kept in this browser only.

Specs: `docs/manager-workspace-v3/` (Codex handoff for this round: `VISUAL_STUDIO_CODEX_HANDOFF.md`; Figma plan: `FIGMA_HANDOFF.md`).
