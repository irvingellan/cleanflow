# Massinha (modeling) component contract — phase 2

Two editors exist in the prototype. Both are design tools for co-design sessions;
neither ships to operators.

| Editor | Where | Edits | State file |
|---|---|---|---|
| **Oficina** (phase 1) | Header "Oficina" | Named blocks of the live prototype: Agora, job detail, job actions, top bar, compact-list columns | `studioModel.js`, schema `1`, key `cleanflow-studio-v1` |
| **Modelar telas** (phase 2) | Header "Modelar telas" | Any element of captured real screens: original A/B/C, CleanFlow V2 components, prototype notification/account | `modeling/modelingModel.js`, schema `cleanflow-modeling/2`, key `cleanflow-modeling-v2` |

## Captured screens (Modelar telas)

- Captured by `prototypes/manager-workspace-v3/capture-screens.mjs` into
  `src/prototypes/manager-workspace-v3/modeling/snapshots/` (`index.json`, one JSON per screen, shared CSS files).
- Every element gets a stable id `data-mid="<screen-prefix>-<base36 index>"` at capture time.
  Ids change only if a screen is re-captured; re-capturing invalidates old proposal files for that screen
  (ops with unknown ids are skipped, never fatal).
- Sanitised at capture: no `script`, `iframe`, `object`, `embed`, `template`, `link`; no `on*` attributes; no
  `javascript:` URLs. A test asserts this for every snapshot.
- Rendered in an `iframe` with `sandbox="allow-same-origin"` (no scripts run inside). Clicks, submits and
  toggles inside are intercepted; links never navigate.

## Original vs proposal

- ORIGINAL = the snapshot markup, never modified.
- PROPOSAL = a fresh copy of the snapshot + `applyOps(doc, ops)` on every render.
- Views: Proposta (editable), Original (read-only), Lado a lado.

## Operations (`cleanflow-modeling/2`)

| `t` | Fields | Effect |
|---|---|---|
| `move` | `id`, `parent`, `before` (id or null) | Insert element into `parent` before `before` (append if null). Refused if it would put an element inside itself. |
| `hide` / `show` | `id` | Sets/clears `data-cf-hidden` (display none; ghosted when "Mostrar escondidos"). |
| `text` | `id`, `text` (≤120 chars, control chars removed) | Replaces the element's own text nodes as **text** (never HTML). Child elements stay. |
| `emph` | `id`, `level` = `prominent` \| `secondary` \| null | Sets `data-cf-emph`. |

Validation (`cleanOp`, `validateModeling`): ids must match `^[a-z0-9]+-[a-z0-9]+$`; unknown op types,
screens and decision statuses are dropped; at most 2000 ops per screen; notes ≤400 chars. Imported files
never contain or produce markup or code.

Derived lists: `changesOf(state, screen)` (last op per element and kind), `allChanges`, `exportModeling`
(JSON with a plain summary) and `decisionsMarkdown` (PT-BR decision record grouped by status).
Decision keys: `"<screen>|<elementId>|<kind>"`, statuses `proposed | approved | question | rejected`.
Undo/redo: 80 steps, covers ops and decisions.

## Interaction contract (non-designers)

- Tap/click selects the element a person means (an icon inside a button selects the button).
- Actions: **Mover** (then tap where it goes: upper half = before, lower half = after), **Subir**,
  **Descer**, **Renomear**, **Esconder / Mostrar de novo**, **Destaque** (Mais/Normal/Menos),
  **Selecionar o bloco de fora / dentro**, **Desfazer tudo neste elemento**, **Voltar esta tela ao original**.
- Keyboard: element list tab ("Lista") selects without the pointer; Alt+↑/↓ move; Ctrl/Cmd+Z undo,
  +Shift redo; Esc cancels move mode, then clears selection, then closes.
- Phone: the tool panel becomes a bottom sheet with 58 px buttons when something is selected.
- A live region announces selection, moves, renames and hides.

## Oficina additions in phase 2

- New screen `row`: columns of the compact service list (when, property, cleaner, status, offer,
  checklist, issues, what it needs), reorderable/hideable.
- New `EMPH` action and `emph` map (`"<screen>/<block>": prominent|secondary`), included in import/export.

## Honesty

Both editors save to one browser and share by file. They are not simultaneous multi-person editing.
Real-time co-editing exists only in Figma, if the account and file permissions allow it.
