# Codex functional handoff — Visual Studio phase 2

Date: 2026-10-27. Branch `feature/gabi-visual-studio` (local, not pushed). Extends
`VISUAL_STUDIO_CODEX_HANDOFF.md`; nothing there is replaced.

Legend: **EXISTING** = in CleanFlow today · **VISUAL PROTOTYPE** = built by Claude on synthetic state ·
**REQUIRES CODEX** = backend, security, persistence or integration · **REQUIRES OPERATOR APPROVAL** =
visual decision not yet accepted · **PARKED** = outside this phase.

## 1. What phase 2 added

| Item | Status |
|---|---|
| Exact original A/B/C artboards as read-only references | VISUAL PROTOTYPE (source: concepts canvas 2026-09-30) |
| Real V2 components captured with synthetic harness data (dashboard, services, 4 job states, offer, checklist run, property, cleaner job; phone variants) | EXISTING components, captured as VISUAL PROTOTYPE snapshots |
| "Modelar telas" editor (select, move, rename, hide, emphasis, compare, decisions, JSON/Markdown) | VISUAL PROTOTYPE · design tool only |
| Strategy 3 compact list + fact sheet | VISUAL PROTOTYPE · REQUIRES OPERATOR APPROVAL |
| Task test (navigation/reveal counter) | VISUAL PROTOTYPE · research tool only |
| Guided 14-step manager route | VISUAL PROTOTYPE · demo only |
| Cleaner: server confirmation line; two-tap removal of saved photos | VISUAL PROTOTYPE · REQUIRES CODEX for the real acknowledgement |
| Figma import spec (31 frames, tokens, 41 component candidates) | Handoff; no Figma file written |

## 2. Findings Codex should know before building

1. **Production V2 Job Detail hides operational facts in seven collapsed sections** (service details, cleaner
   and assignment, checklist, offers, issues, financial, history and administration) plus "more actions" —
   see the `v2-job-*` captures. This is the "everything
   hidden" extreme the operator described. Any redesign should be decided with her, not by Codex alone.
2. **Next action of the day is only one tap away in strategy 1** (attention-first). In strategies 2 and 3
   the most urgent item (a service open since yesterday) is not in today's list at all. Measured counts
   (scripted shortest path, 1440 px, same data):

   | Task | 1 · C→A | 2 · A | 3 · Compact |
   |---|---|---|---|
   | Today's next action | 2 nav · 0 reveal | not found in today's list | not found in today's list |
   | Service with no cleaner | 2 · 0 | 1 · 0 | 1 · 0 |
   | Offer awaiting reply | 2 · 0 | 1 · 0 | 1 · 0 |
   | Submitted checklist | 2 · 0 | 1 · 0 | 1 · 0 |
   | Reported issue | 2 · 0 | 1 · 0 | 1 · 0 |
   | Completed service | 3 · 0 | 2 · 0 | 2 · 0 |

   "nav" = screen/selection/filter changes; "reveal" = disclosures opened/closed. These are machine paths,
   not human timings, and do not pick a winner.
3. The manager route needs **no backend that does not exist**, except: per-notification history,
   recorded offer replies by message, review/approval state and the photo-limit decision (already listed in
   phase 1, section 3).

## 3. What REQUIRES CODEX if the operator approves

| Visual element | Backend need |
|---|---|
| Fact sheet (strategy 3) | One read model per job with: cleaner + acknowledgement, offer counts by response, checklist state/progress/photos, pay, open issues, last activity. Today these come from several reads. |
| Compact list columns | Same read model for the list; avoid N+1 reads. Server-side sort by attention. |
| Server confirmation on submit | Submit must return a stored timestamp; the success screen shows only after it. |
| Removing a saved photo | Delete or release the stored object and the quota slot; audit it. |
| Notification Center, delivery evidence, defects | See phase 1 handoff §3a–3c (unchanged). |

## 4. REQUIRES OPERATOR APPROVAL (nothing is approved yet)

- Which strategy (1, 2, 3 or a mix) for the first screen and the work screen.
- Whether the fact sheet replaces accordions in Job Detail.
- Every rename/move/hide made in the workshop: read the exported decision file; only "Aprovado" rows
  with her name on the session count.

## 5. PARKED

Native mobile app, payroll, Airbnb/WhatsApp integrations, live multi-user sync for the workshop,
reservation-changes inbox (concept only).

## 6. How to review

```
npm run prototype:v3            # open the prototype
npm run prototype:v3:test       # 64 tests
```
Header buttons: **Modelar telas**, **Oficina**, **Roteiro da gerente**, **Testar tarefas**; layout switch
includes **Lista compacta**. Re-capture screens: see `MASSINHA_COMPONENT_CONTRACT.md`.
