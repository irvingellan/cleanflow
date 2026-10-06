# CleanFlow Design System V2

Status: design reference, 2026-10-06. No application code was changed.
Values live in `TOKENS.json`. Components are specified in `COMPONENT_CATALOG.md`.
Artboards are in `artboards/` and on the editable canvas named in `MANIFEST.txt`.

All names, properties, cleaners, clients, addresses and phone numbers in the
artboards are invented.

## 1. Philosophy

CleanFlow V2 is the current product matured, not replaced. Seven rules decide
every screen:

1. **Attention first.** A screen opens on what needs the manager, then what is
   next, then what is done.
2. **One primary action per view.** Everything else is secondary, tertiary or
   inside a disclosure.
3. **State is never colour alone.** Every state is icon + words + colour.
4. **Consequences before commitment.** An action that changes operations says
   what it will do and what it will not do, before the final press.
5. **Only what is proven.** Unknown is drawn as unknown (dotted segment, "not
   known", "time not set"). A failed read is never shown as "none".
6. **Operator first, internals last.** Build numbers, record identifiers,
   provenance controls and developer tools sit behind the account menu, a
   disclosure or the internal area.
7. **Borders, not shadows.** Surfaces are separated by a 1 px border. Shadow is
   reserved for things that float: menus, dialogs, sheets, toasts.

What is kept from today's product: the mint and forest green brand, heavy tight
headings, generous rounded controls, calm low-contrast surfaces, uppercase
section labels, the five-stage lifecycle with evidence states, native
disclosures, and the existing semantic colour variables.

## 2. Colour roles

One role name, one value per theme. Components use roles, never hex values.
Full values for both themes: `TOKENS.json › color`. Artboard: `01`.

| Group | Roles |
|---|---|
| Surfaces | `canvas`, `surface`, `surface-subtle`, `surface-elevated`, `surface-selected`, `surface-sunken`, `surface-internal` |
| Text | `text-primary`, `text-secondary`, `text-muted`, `text-disabled` |
| Lines | `border`, `border-strong`, `border-input`, `border-selected`, `divider`, `focus` |
| Brand | `brand`, `brand-hover`, `brand-text`, `on-brand` |
| States | `info-*`, `attention-*`, `warning-*`, `risk-*`, `success-*` (each: `bg`, `border`, `text`) |
| Environment | `sandbox-*` |

Surface use:

| Surface | Use |
|---|---|
| `canvas` | The page behind everything |
| `surface` | Panels, cards, rows, sidebar, inputs |
| `surface-subtle` | Column headers, group headers, open disclosure bodies, nested cards |
| `surface-elevated` | Menus, dialogs, sheets, sticky mobile action bar (with shadow) |
| `surface-selected` | Selected row, active navigation item, active filter, confirmation ground |
| `surface-sunken` | Avatars, counts, skeleton blocks, segmented-control track |
| `surface-internal` | Technical details and developer-only blocks, always with a dashed border |

### Light and dark are both designed

Dark is not an inversion. Surfaces step from charcoal `#171a1c` upward; the brand
lifts from forest `#315c49` to mint `#8cba9e` and the text on it flips to dark
green; state grounds become deep, low-chroma versions with light text. The same
role names are used in both themes, so no component has theme-specific code.

Measured contrast (WCAG 2.x ratio):

| Pair | Light | Dark |
|---|---|---|
| `text-primary` on `surface` | 15.9 | 14.0 |
| `text-secondary` on `surface` / `canvas` | 6.3 / 5.8 | 9.6 / 10.8 |
| `text-muted` on `surface` / `canvas` | 5.2 / 4.8 | 6.8 / 7.6 |
| `text-muted` on `surface-selected` | 4.7 | 5.3 |
| `on-brand` on `brand` | 7.6 | 7.3 |
| `brand-text` on `surface` | 7.8 | 9.6 |
| State text on its own ground (lowest of the five) | 6.1 | 6.3 |
| `border-input` on `surface` | 3.1 | 3.5 |
| `focus` on `surface` | 5.7 | 8.5 |

`text-disabled` (2.6 light, 3.5 dark) is below 4.5 on purpose and must never
carry information the manager needs. `border` and `border-strong` are decorative
separators and are not relied on to identify a control; inputs, checkboxes and
radios use `border-input`.

Values that differ from today's `src/index.css` are listed in
`TOKENS.json › changed-from-current`. The two that matter: `border-input` is
stronger in both themes (today 1.4:1 light, 2.5:1 dark), and `text-muted` is
slightly darker in light and slightly dimmer in dark.

## 3. State system

| State | Meaning for the manager | Tone | Typical icon |
|---|---|---|---|
| neutral | Nothing to decide | sunken / secondary text | domain icon |
| selected | The current item, filter or lifecycle stage | selected / brand text | none |
| info | Waiting on someone else | info | send, clock |
| attention | Something changed; compare and decide | attention (amber) | alert-circle, user-check |
| warning | Blocked until the manager acts | warning (orange) | alert-triangle, user-x |
| risk | A reported problem, or a destructive action | risk (red) | alert-triangle |
| success / confirmed | Healthy, finished, or confirmed by a person | success (green) | check, check-circle |
| disabled | Not available | sunken / disabled text | none |
| blocked | Available after a named input | dashed outline | lock |
| sandbox | Test environment and test data | sandbox, dashed | flask |
| production | Live environment | quiet outline | none |

Rules:

- Amber and orange are different jobs. **Attention** means "look and decide".
  **Warning** means "this will not move until you act".
- Red is for problems and destructive actions only. A count of zero is neutral,
  not red (today's Open issues tile is amber even at 0).
- Lifecycle stage is its own thing: it uses the brand tone and the rail, and it
  never borrows a state colour. Issue state sits beside the lifecycle, not in it.

Four ways to show a state, by weight:

| Form | Use |
|---|---|
| State label (caps, icon + text) | The reason a card or screen exists: queue rows, banners, screen headers |
| Status pill | A property of a record inside a row or card header |
| Inline flag (sentence case, icon + text) | A missing or notable value in a table cell: "No cleaner", "Out of date" |
| Tag (small caps, neutral) | Record classification by exception: Demo, Unknown, Archived |

## 4. Typography

Inter only; weights 400, 500, 600, 700, 800. Artboard: `02`.

| Role | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| display | 40 / 44 | 800 | -0.04em | Sign-in and brand moments only |
| page-title | 28 / 34 (mobile 24 / 30) | 800 | -0.032em | One per screen |
| section-title | 18 / 24 | 700 | -0.015em | Panel headings |
| card-title | 16 / 22 | 700 | -0.01em | Card heading, next-step title |
| body-strong | 15 / 22 | 600 | 0 | Row title, field value |
| body | 15 / 22 | 400 | 0 | Sentences |
| secondary | 14 / 20 | 400 | 0 | Supporting line |
| metadata | 13 / 18 | 500 | 0 | Counts, times, column values |
| micro-label | 11 / 14 | 700 | +0.08em caps | Section and state labels |
| numeric-kpi | 28 / 32 (mobile 22 / 26) | 800 | -0.03em, tabular | Dashboard counts |
| button | 15 / 20 (small 13 / 18) | 700 | 0 | Buttons |

The CleanFlow wordmark is no longer the page heading. It is a 22 px mark in the
shell; the page title names the screen. Nothing operator-facing is below 11 px.
Times and counts use tabular figures.

## 5. Spacing, radii, sizes

- Spacing: 4 px base — 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Radii: 6 tag · 10 small control · 12 control · 14 card · 18 panel · 22 sheet
  top · pill.
- Controls: 44 px default, 36 small, 52 large. Any tappable thing is at least
  44 × 44, including small buttons (the hit area extends past the visual).
- Rows: 56 px minimum on desktop, 64 px on mobile, 76 px for attention rows.
- Icons: 18 px, 14 px inside labels, 22 px in the tab bar. Stroke icons that take
  the text colour. No emoji.

## 6. Layout

Artboards: `02` (templates and breakpoints), `06`, `07`.

| Template | Width | Used by |
|---|---|---|
| Standard page | content up to 1200 px | Dashboard, Payments, Clients |
| Dense list workspace | fluid up to 1560 px | Services, Properties, Cleaners |
| Split-pane workspace | queue 360–420 · detail fluid · decision rail 360 | Reservation Intake, Job detail |
| Form and reading | one column up to 720 px | New service, edit forms, sign-in |

| Range | Width | Navigation | Gutter | Split workspaces |
|---|---|---|---|---|
| compact | below 720 | bottom tabs, four plus More | 16 | one pane, sticky action bar |
| medium | 720–1099 | icon rail 64 | 24 | list + detail; rail under detail |
| wide | 1100–1439 | sidebar 232, collapsible | 32 | three panes with sidebar collapsed |
| extra wide | 1440 and up | sidebar 232 | 32 | three panes with sidebar open |

Page header: one row. Title and a one-line context on the left (count, date);
data freshness, refresh and actions on the right. No eyebrow, no subtitle
paragraph, no second header band.

## 7. Application shell

Decision: **sidebar on desktop, icon rail on medium widths, bottom tabs plus
More on mobile.** The exploration and comparison are on artboard `05`.

- Sidebar, top to bottom: wordmark and collapse control; environment indicator
  (Sandbox only); ungrouped daily destinations (Dashboard, Intake, Services);
  groups (Directory: Properties, Cleaners, Clients; Money: Payments); at the
  bottom, Internal tools (developer accounts only) and the account button.
- Account menu: identity, language, theme, notifications status, What's new,
  Send feedback, environment and version/build, Sign out. This replaces the
  eight header controls in today's product.
- Mobile tab bar: Dashboard, Services, Properties, More. More opens a sheet with
  every other destination and the same settings. Detail screens hide the tab bar
  and show a back link and a sticky action bar.
- Sandbox: dashed pill under the wordmark on desktop; a 28 px strip above every
  mobile screen, kept visible above dialogs and sheets. Production shows no
  banner; "Production" and the build appear in the account menu.

## 8. Perceived performance

Artboards: `20`, `21` (system states), `11` (dashboard states). These rules do
not make anything faster; they stop the interface from hiding or moving what
the manager already has.

1. **First load:** render the shell, page title, toolbar, column headers and
   panel titles at once. Only values are skeletons, at the real row height.
2. **Background refresh:** never replace loaded content. Show one quiet line by
   the title ("Updating…", then "Updated 1:42 PM"). Rows stay clickable and are
   updated in place.
3. **Each panel loads on its own.** A slow or failed section does not block the
   rest of the page.
4. **Stale:** if a refresh fails, keep the last data and say when it is from,
   with Try again.
5. **Slow:** after 5 seconds of first load, say so in plain words and offer
   Try again.
6. **Section error** inside the page; **page error** only when nothing could be
   loaded. Every error says that nothing was changed, when that is true.
7. **Operation in progress:** the pressed button shows progress and keeps its
   width; other actions in the same group wait; the result is a brief
   confirmation and the new state, or an inline error that keeps the manager's
   input.
8. No skeleton shimmer and no spinners rotating when reduced motion is on.

## 9. Localization

Validated in Portuguese on artboards `10`, `13`, `17`, `19`, `22`, `30`.

- Layouts are sized for Portuguese, whose labels are clearly longer here
  ("Needs assignment" → "Precisa de atribuição", "Offers awaiting reply" →
  "Ofertas aguardando resposta").
- State labels may sit on their own line above a title; they are never truncated.
- Buttons stay on one line in both languages. If a label cannot fit, shorten the
  label, not the font.
- Dates follow the product's existing short forms ("Wed, Oct 7" / "qua., 7 de
  out."). Times follow the locale (11:00 AM / 11:00).
- The sidebar is unaffected by label length; this was a main reason to choose it.
- The mobile tab bar holds "Propriedades" at 11 px with four tabs. A fifth tab
  would not fit in Portuguese.
- The product term "Cleaner" stays untranslated in Portuguese, as it is today.
- Spanish exists in the catalogs and was not drawn. Its label lengths are close
  to Portuguese.
- Portuguese wording in the artboards was written by the designer and has not
  been reviewed by a native-speaking operator.

## 10. Accessibility and operability

- **Keyboard:** every action is a real button or link, in reading order. Focus is
  a 3 px `focus` ring with 2 px offset, visible in both themes. Disclosures use
  Enter and Space. Dialogs and sheets trap focus, close on Escape, and return
  focus to the control that opened them.
- **Touch:** 44 × 44 minimum for every target; 8 px minimum between adjacent
  targets. A whole list row is one target; a second action inside a row is a
  separate 44 px button at the end of the row.
- **Contrast:** text 4.5:1 or better on every surface it is used on; control
  boundaries 3:1 (`border-input`).
- **Not by colour alone:** state = icon + words + colour. The lifecycle rail
  always has the stage name beside it and a full text description for screen
  readers. Skipped and unknown stages differ by line style, not colour.
- **Mobile type:** body 15 px, nothing below 11 px, inputs 15–16 px so iOS does
  not zoom.
- **Reduced motion:** no shimmer, no sliding sheets (fade only), no spinning.
- **Sticky action bar:** sits above the safe-area inset, never covers the last
  content (the page gets matching bottom padding), holds one primary action,
  and hides while the on-screen keyboard is open.
- **Destructive confirmation:** in-app dialog, never `window.confirm`. Title asks
  the question; the body lists what will happen and what will not; the confirm
  button repeats the verb and object ("Archive service"); the safe button sits
  below it; initial focus goes to the safe button, never to the destructive one.
- **Status messages:** loading regions use `aria-busy`; results use a polite live
  region; errors use an alert.
