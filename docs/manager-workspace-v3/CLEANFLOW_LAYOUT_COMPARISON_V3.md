# CleanFlow Manager Layout Comparison V3

Date: 2026-10-20. Compares the four presentation modes of the Manager Workspace
V3 prototype (`prototypes/manager-workspace-v3/`). All four read the same
synthetic state through the same selectors, so the comparison is about
presentation, not data.

Evidence comes from two places: the operations manager's review of the original
A/B/C concepts on 2026-10-20 (she chose "the first screen of C with the rest of
A"), and walking the ten prototype scenarios in each mode. Step counts are
counted clicks/taps in the prototype from its opening screen.

## Summary

| | A · Calm Workspace | B · Attention Cockpit | C · Intent First | **Hybrid C+A** |
|---|---|---|---|---|
| Opens on | Service list + detail | Grouped exceptions + timeline | Command field + one service | Command field + "Comece por" + queue + day cards |
| Operational scanning | Strong | Strong for exceptions, weak for the rest | Weak | Strong |
| Information density | High | Medium | Low | Medium on Agora, high on Operação |
| Attention handling | Per row only | Strongest | One item | Grouped queue, ranked |
| Task completion | Good once you find the job | Good, via side panel | Fastest when you know the job | Fast in both cases |
| Mobile suitability | Good (list → detail) | Fair (stacked groups and table) | Good | Good (tabs Agora / Serviços) |
| Ease of learning | Easiest (familiar list) | Easy | Hardest (typing, recall) | Easy; command field is optional |
| Navigation transitions | Low | Low | Lowest when the intent is known | Low; one tap from Agora to the selected job in Operação |
| Operator preference (2026-10-20) | Liked for density and use of space | Not chosen | First screen chosen | Requested |

## Clicks for common tasks (desktop, from the opening screen)

Every click or tap counts, including choosing a cleaner and confirming.

| Task | A | B | C | Hybrid |
|---|---|---|---|---|
| See what needs attention now | 0 (default filter "Precisam de você") | 0 | 0 (one item only) | 0 |
| Open the most urgent service | 1 | 1 | 0 (already resolved) | 0 (shown in "Comece por") |
| Assign a cleaner to a job without one | 4 (row, Atribuir, pick, confirm) | 3 (group action, pick, confirm) | 4 (shortcut, action, pick, confirm) | 3 (queue action, pick, confirm) |
| Send an offer with the known payout to two cleaners | 5 | 5 | 6 | 5 (row, Enviar oferta, two picks, Registrar) |
| Review a submitted checklist | 2 | 1 | 2 | 1 (queue "Revisar checklist") |
| See tomorrow | 1 | 1 | 1 (picture hidden by default) | 0 (Amanhã day card) |
| Reopen a notification tapped too fast | 2 | 2 | 2 | 2 |

## Strengths and weaknesses

### A · Calm Workspace
- **Strengths:** the most information per screen; list, detail and next action side by side; no Back needed between services; familiar.
- **Weaknesses:** does not say where to start; the manager scans to find the items that need her; cross-service patterns (e.g. three reminders) are not grouped.

### B · Attention Cockpit
- **Strengths:** answers "where do I start?" by group and count; exceptions stand out; counts fall as work is done.
- **Weaknesses:** routine work is hidden by default; detail lives in a side panel; planning tomorrow or the week feels secondary; the most "dashboard-like" mode.

### C · Intent First
- **Strengths:** fastest when the manager knows what she wants; shortcuts double as a to-do summary; a new capability becomes a new intent.
- **Weaknesses:** little ambient awareness; the day's picture stays in the manager's head; depends on typing and predictable matching.

### Hybrid C+A (recommended)
- **Strengths:** keeps C's opening (what needs me, what to do first, direct commands) and A's working surface (dense list, detail, next action); the day cards answer "today / tomorrow" without leaving Agora; one selection moves from Agora to Operação without losing the date or filter; on phones Agora and Serviços are tabs.
- **Weaknesses:** two screens to learn; the queue and the list must never disagree (they share one selector, `attentionQueue`, so they do not in the prototype); Agora gets long on phones.

## Recommendation

Build **Hybrid C+A**. It is the only option that matches the operator's
explicit choice, and in the prototype it ties or wins on clicks for every task above
except opening a service that C has already resolved. Keep A's list as the single
operational list component, so Hybrid's Operação and a future "list only" view
are the same code. B's grouped attention and C's command field survive as parts
of Agora, not as separate products.

Measure it with `GABI_NEXT_UX_TEST.md` before implementation is finalised.
