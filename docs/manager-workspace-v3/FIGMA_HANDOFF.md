# Figma handoff — Manager Workspace V3 + Visual Studio round

Status (2026-10-27): **not written to Figma.** The Figma connector needs
authorisation in the Claude app (`/mcp` → Figma) and was not available in this
session. Nothing was pushed to the target files. This note says what to build
there once access exists, so the Figma work is mechanical.

Target files named in the brief:

- Design file `DeHgt5onTEJNGuuNMctw0R`, three pages:
  1. `01 — BASE CLEANFLOW (CAPTURAS EDITÁVEIS)`
  2. `02 — CLAUDE ORIGINAIS A+C`
  3. `03 — MASSINHA … — TRABALHO AO VIVO` (live co-design page; full name as in the brief)
- FigJam board `dqA7hzXGGNZS8mcCzVFQ1j` (session notes, decisions).

## Honesty rules for the file

- A page of screenshots is **not** an editable component library. Label any
  screenshot frame "reference capture".
- Page 02 must say the A/B/C originals are on the concepts canvas
  (claude.ai/artifact/D51aPdEBUm6PVoLpJoyXKm, `project/*.dc.html`). The prototype
  versions are recreations on shared data, not exact restorations.
- No real names, addresses, access codes, client prices or tokens.

## Tokens → Figma variables

Source of truth: `src/index.css` (`--v2-*`) and `docs/design-system-v2/TOKENS.json`
if present on the base branch. Create two modes (Light, Dark) for the colour
collection: canvas, surface, surface-elevated, surface-internal, surface-sunken,
surface-selected, border, border-input, border-selected, divider, text-primary,
-secondary, -muted, brand, brand-text, focus, scrim, and the tone sets
attention/warning/risk/info/success (bg, border, text). Radii: control, card,
panel, sheet, small. Type: body, secondary, metadata, micro-label.

## Components to build (variants in brackets)

| Figma component | Prototype source | Variants |
|---|---|---|
| Notification row | `NotificationRow` | unread / read / selected / tapped-before-read / generic-title warning |
| Category badge | `CategoryBadge` | live today / proposal |
| Delivery step | `DeliveryTimeline` | done / failed / unknown / not tracked |
| Notification detail | `NotificationDetail` | with job / without job |
| Push banner | `PushBanner` | light / dark |
| Device card | `DeviceStatusCard` | ok / warning |
| Permission card | `AccountSheet` notifications | granted / default / denied |
| Settings nav item | `AccountSheet` | default / current; desktop / phone row |
| Switch row | `AccountSheet` | on / off |
| Photo tile | `PhotoTile` | queued / uploading / saved / failed; normal / dense; removable |
| Upload queue bar | `UploadQueue` | uploading / failed only |
| Quota line | `QuotaLine` | normal / near limit / simulated 50 |
| Picker cell | `PhotoPicker` | idle / selected (number) / rejected HEIC / rejected >5 MB |
| Submission stepper | `SubmissionSteps` | each step: todo / active / done / warn |
| Workshop block chrome | `StudioBlock` | idle / hover / drop target / approved / question / rejected |
| Workshop panel | `StudioPanel` | changes / blocks / share tabs; desktop side / phone sheet |

Use auto layout everywhere; no absolute positioning except the push banner and
the photo tile overlays.

## Frames for page 03 (live session)

Desktop 1440, tablet 768, phone 390 for: Now, Now in workshop mode, Inbox list,
Inbox detail, push banner, Account (each section), cleaner checklist list,
picker, upload in progress, template preview. The QA captures in the untracked
evidence package (main checkout `artifacts/`, not in git) show each one in
light, and key ones in dark.

## Fast path once authorised

1. Build variables and the components above on page 01.
2. Optionally capture the running prototype into frames (HTML-to-Figma capture),
   then **replace** captured layers with the components so the frames are editable.
3. Page 03: duplicate the Now frame per idea the operator suggests; record each
   decision in FigJam with the same vocabulary the workshop exports
   (`proposed / approved / question / rejected`).
