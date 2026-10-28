# Figma visual baseline — phase 2

Status (2026-10-27): **Claude did not write to Figma.** The Figma connector is not
authorised in the Claude session (it may be connected in ChatGPT, which is a
separate authorisation). This folder is the handoff another tool can execute.

## Files

| File | What |
|---|---|
| `FIGMA_IMPORT_SPEC.json` | 31 frames: 22 locked ORIGINAL frames + 9 editable PROPOSTA copies. Full node tree with position, size, auto-layout, fills/strokes (mapped to V2 token names when the colour matches), radius, text with font/size/weight/line-height/colour. |
| `FIGMA_COMPONENT_TREE.json` | 41 component candidates: UI classes that repeat ≥3 times across frames, with example node ids. |
| Reference PNGs | In the untracked evidence package (`screens/`), one per frame id. Not in git. |

The spec is generated, not hand-written: `prototypes/manager-workspace-v3/capture-screens.mjs`
renders the screens and records geometry; `figma-spec.mjs` converts it. Re-running both
gives the same ids.

## What each frame is

| Source | Frames | Fidelity |
|---|---|---|
| Original A/B/C, 2026-09-30 | `orig-{a,b,c}-{desktop,mobile}` | Exact: rendered from the canvas source files with their own runtime. English copy, as designed. |
| CleanFlow V2 (release candidate) | `v2-*` (dashboard, services, 4 job detail states, offer, checklist run, property, cleaner job; phone variants) | Real production components rendered by the repo's synthetic integrated harness. Synthetic data; not Production. |
| Prototype V3 (this round) | `proto-inbox-desktop`, `proto-account-desktop` | Prototype screens; data and alerts simulated. |

Not captured as frames: the Codex-integrated V3 branch (`21feba5`) and the first V3
prototype's Hybrid screens (they live in the running prototype).

## Pages (the Starter plan allows three)

1. `01 — BASE CLEANFLOW (CAPTURAS EDITÁVEIS)` → all `v2-*` and `proto-*` ORIGINAL frames.
2. `02 — CLAUDE ORIGINAIS A+C` → `orig-*` frames (B included for completeness).
3. Existing third page (live co-design) → the 9 `--proposal` frames.

## How to execute the import (any agent with Figma write access)

For each frame in `frames[]`, on its `page`:

1. Create a FRAME `name`, `width`×`height`. If `role` is `original`, lock it.
2. Walk `root` depth-first. For each node create, relative to its parent's `x`/`y`:
   - `FRAME` → frame; if `autoLayout` exists, set layout mode, gap, padding and
     alignment; otherwise keep absolute positions.
   - `TEXT` → text layer with `text.characters`, font family/size/weight,
     line height and colour.
   - `VECTOR_PLACEHOLDER` → a rectangle named `icon` with the same box (or an
     icon component instance). Never trace it from the screenshot.
   - `fill`/`stroke`/`cornerRadius`/`opacity` as given. Use `token` names as Figma
     colour variables (collection `CleanFlow V2`, mode Light) where present.
3. Place the reference PNG in a hidden layer behind the frame for visual checking.
4. Select a few nodes and move them: they must move independently. A single
   image layer is not an acceptable result.

Then build components from `FIGMA_COMPONENT_TREE.json` (most-used first:
buttons, rows, cards, notification rows) and swap matching nodes for instances.

## Limits

- Geometry is from one viewport (1440×900 or 390×844). Auto-layout values come
  from CSS flex; grids are kept as absolute positions.
- Text that wraps is one text layer with the captured box size.
- Dark mode is not in the spec; V2 tokens have dark values in the stylesheet.
