# CleanFlow — Visual Acceptance Checklist (Design System V2)

Run after every UI implementation, before asking for human review. Answer each
line Yes, No, or N/A with a note. Any No in sections 1–6 blocks the change.
Capture the screenshots named in section 10 and attach them.

## 0. Scope
- [ ] The change matches one goal in `CODEX_HANDOFF.md` and nothing outside it.
- [ ] No handler, guard, service, query, rule or Function changed (or the
      change is listed and was requested).
- [ ] Everything in the goal's "Must remain" list was exercised by hand or test.
- [ ] No OPTIONAL item was built without being asked.

## 1. Tokens
- [ ] No hex, rgb or named colour in component styles; only V2 role variables.
- [ ] Font sizes, weights, spacing and radii come from the scales (no 13.5 px,
      650 weight, 7 px gap, 11 px radius).
- [ ] No new media-query width; only 720, 1100 and 1440 boundaries.
- [ ] Shadows appear only on menus, dialogs, sheets and toasts.

## 2. Layout
- [ ] The screen uses one of the four page templates.
- [ ] One page title, 28 px (24 px on mobile); the wordmark is not the title.
- [ ] Header is one row; no eyebrow that repeats the title.
- [ ] At 1440 px the content uses the available width as the artboard does.
- [ ] No horizontal scrolling at 360, 390, 768, 1280 and 1440 px.
- [ ] Nothing jumps when data arrives or when a section opens.

## 3. Hierarchy and actions
- [ ] Exactly one primary button in the view (and in any dialog or sheet).
- [ ] Secondary actions are visibly lighter than the primary.
- [ ] The first screenful answers: what needs attention, what is next.
- [ ] History, financial and administrative content is collapsed or below.
- [ ] A disabled action that the user can unblock says what is missing.

## 4. States
- [ ] Every state shows an icon and words, not colour alone.
- [ ] Amber = decide, orange = blocked until input, red = problem or destructive,
      green = done/confirmed, blue-grey = waiting. No other use.
- [ ] Zero counts are neutral.
- [ ] Unknown data reads as unknown ("not known", "time not set", dotted
      segment), never as zero, none or a default time.
- [ ] Lifecycle stage and issue state are shown separately.
- [ ] Demo, Unknown and Archived are tagged; Real is not (unless the pilot
      asked to keep it).

## 5. Consequences and confirmation
- [ ] Any action that creates, assigns, completes, archives or sends shows what
      it will do and what it will not do before the final press.
- [ ] Each statement was checked against the implementation and is true.
- [ ] Destructive actions use the in-app confirmation, with the verb and object
      on the confirm button. No `window.confirm`.
- [ ] After the action, the screen shows the new state and a brief confirmation.

## 6. Loading, empty, error
- [ ] First load shows title, actions and column headers at once; values are
      skeletons at real row height.
- [ ] Refresh keeps loaded content on screen and interactive.
- [ ] A failed refresh keeps the data and shows when it is from.
- [ ] A failed section does not blank the page.
- [ ] First-run empty and filtered empty are different messages.
- [ ] Every error offers Try again and says "nothing was changed" when true.
- [ ] No full-page spinner.

## 7. Themes
- [ ] Checked in Light and in Dark.
- [ ] No white box or dark box left behind in the other theme.
- [ ] State grounds, selected rows, focus rings and disabled controls are all
      visible in both.
- [ ] Screenshots in both themes look intentionally designed, not inverted.

## 8. Languages
- [ ] Checked in English and in Portuguese (Spanish spot-checked).
- [ ] No hard-coded string; all new keys exist in EN, PT and ES.
- [ ] No button label wraps or truncates in Portuguese.
- [ ] State labels are not truncated; long ones wrap above the title.
- [ ] Dates and times follow the locale; no English month names in Portuguese.
- [ ] No developer vocabulary in operator copy (ID, payload, null, sync job,
      callable, emulator, build).

## 9. Accessibility and operability
- [ ] Every action reachable by Tab, in reading order, with a visible 3 px focus
      ring.
- [ ] Enter and Space operate buttons and disclosures; Escape closes dialogs
      and sheets and returns focus.
- [ ] Every target is at least 44 × 44 px.
- [ ] Text contrast at least 4.5:1 on its surface; control borders at least 3:1.
- [ ] Icon-only buttons have an accessible name.
- [ ] Loading regions are marked busy; results are announced politely; errors
      are alerts.
- [ ] With reduced motion on: no shimmer, no slide, no spin.
- [ ] Mobile: the sticky action bar clears the home indicator, does not cover
      the last content, and is hidden while the keyboard is open.
- [ ] Mobile: body text 15 px, nothing under 11 px, inputs do not trigger zoom.

## 10. Environment and internals
- [ ] Sandbox shows the Sandbox indicator on every screen, including above
      dialogs and sheets. Production shows none.
- [ ] No build number, record ID or diagnostic control in the operator's path.
- [ ] Internal tools are visible only to accounts that are allowed to see them.
- [ ] No real customer, cleaner, address, phone or payment data in fixtures,
      tests or screenshots.

## 11. Evidence to attach
For each changed screen, at the state that best shows the change:

| # | Width | Theme | Language |
|---|---|---|---|
| 1 | 1440 | Light | English |
| 2 | 1440 | Dark | Portuguese |
| 3 | 390 | Light | Portuguese |
| 4 | 390 | Dark | English |
| 5 | 768 | Light | English |

Plus one screenshot each of: first load, empty, and error for the screen.
Name the matching artboard next to each screenshot and list every intended
difference from it.

## 12. Final questions
- [ ] Can the manager tell in three seconds what needs attention on this screen?
- [ ] Is there anything on screen the manager never needs? Remove or collapse it.
- [ ] Would the screen still read correctly with 200 rows instead of 12?
