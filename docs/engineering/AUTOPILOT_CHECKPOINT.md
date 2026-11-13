# Operations Autopilot engineering checkpoint

13 November 2026. Baseline `ae770405826005d2f39d852f69355496c68e2a29`.
GitHub main and both public Production version markers match that baseline.
PR #97 is already published. This assignment changes no Production resource,
customer data, rules, IAM, billing, providers, domain or deployed Function.

## Existing system and this increment

| Area | Existing verified source / published baseline | Increment and remaining acceptance |
| --- | --- | --- |
| Startup / PWA | PR #90 deadlines, diagnostic stages, network-only worker, asset retention | Existing 52 built-entry browser checks added to CI. Physical affected-device cause/acceptance remains unverified. |
| Photos / checklist | PRs #91/#94/#95, sequential native upload, idempotent evidence, manager review | Lost upload receipt could double-count capacity after refresh. Small hook correction plus real emulator/browser regressions in issue-81 branch. |
| Photo policy / templates | New Runs already freeze 60 photos / 120 MiB, 5 MiB per uploaded image. Older 20 / 50 MiB and single-photo Runs remain | No global limit increase. Template editor and required-photo descriptions already exist. General per-item enforcement and 65-image policy need a separate contract. |
| Reservations | PR #80 obsolete branch is preserved; no intake runtime on baseline | Selective domain/parser reuse, local private shadow state, audit diffs and cleaning suggestions on issue-79 branch. Synthetic only. No real feed, polling or Job mutation. |
| Weekly Close | V0 already published; snapshots, REAL completed Jobs and conservative cleaner-paid evidence | Issue-56 branch adds explicit period/client selection and bounded cursor/context queries. Complete and partial totals remain distinct. |
| Invoices / client payments | Planned domain, no authoritative receipt or invoice model | Not implemented in this increment. Hour approval, frozen charges, partial-payment ledger and transactional double-billing prevention are the next independent financial slice. |
| Notifications | PR #97 result logs, durable Inbox, authorized device/session claims and pilot | Issue-85 branch repairs dropped provider counts/codes and exposes aggregate audit-write outcome. No new sending policy. Physical display remains unknown. |
| Offers / assignments | Manual interest remains distinct. DEC-049 manual capacity already supports 1–10 cleaners and reopening; single-vacancy automatic code/tests are integrated, activation gated | Do not rebuild these paths. Automatic multi-vacancy, mixed assignment and automatic reopening need separate contracts; the rejected hard-start gate is not the manual-capacity state. |
| Owner portal | PR #93 / DEC-056, single revocable client capability, allowlisted report projection | Issue-42 branch makes direct report/photo scope match current Property ownership and date window; resumed pages revalidate. Release still means an unrevoked client report. |
| Manager correction | PR #96 / DEC-057, correction layer preserves original cleaner answer | Reused by reports; no change to this policy or real checklist answers. |
| End-to-end laboratory | Existing manager/cleaner security and browser suites | Photo slice exercises actual native upload, lost confirmation, review, manager read, report and portal. Weekly Close has its own real emulator scenario. Reservation suggestions are a local adapter; no claim of a full live reservation-to-payment journey. |
| Release engineering | Claims, doctor, exact-base CI, Hosting-only executor, receipts and retained rollback | Existing image optimizer/gallery and PWA recovery regressions become mandatory CI steps. No second deploy platform. |

Implementation, automated testing, publication and acceptance by the design
partner are separate states. Historical issue/doc labels are not evidence of
current runtime state. The release receipt, not frontend build SHA alone,
identifies backend source revisions.

## Independent changes and integration

Every candidate starts from the same verified main, in its own registered
worktree and issue-specific branch. No branch is merged wholesale from its old
base. Root reviews focused changes and agents independently review security and
notification contracts. Combine exact reviewed commits in a separate local
integration branch and run the complete gates on that tree before integration
into main. Main integration and Production authorization remain separate.

| Branch suffix | Scope of a future release |
| --- | --- |
| `issue-42-portal-authorization` | Hosting plus existing `publicClientPortal` only |
| `issue-81-evidence-reconciliation` | Client hook and test infrastructure; runtime Hosting only |
| `issue-79-reservation-shadow` | Inert domain/local synthetic tooling; no exported Function or active polling |
| `issue-56-weekly-close-autopilot` | Client reads and presentation; no backend, Rules or index change |
| `issue-85-notification-outcome-counts` | Four existing notification Functions from PR #97; preserve the other 53 revisions |
| `issue-83-autopilot-regression-gates` | CI and this checkpoint only |

All use `scope:full` where the existing narrow presentation classifier requires
it. That label describes review scope and never authorizes a broad backend deploy.
The combined runtime backend scope is five existing Functions: `sendTodayExecutionReminder`,
`sendTomorrowPlanningReminder`, `notifyManagersOperationalEvent`,
`notifyCleanerInboxEvent` and `publicClientPortal`. Preserve the other 52.
The new CI steps require optimizer, synthetic gallery and PWA entry checks;
the actual multi-photo emulator runner and Weekly Close scenario remain separate
local gates and are not silently claimed as CI coverage.

## Reproducible measurements and limits

The unchanged optimizer's native WebKit synthetic camera fixture measured
4,916,455 source bytes (4000 x 3000) to 527,125 upload bytes (1920 x 1440), in
72 ms on the development host. A detailed synthetic PNG measured 4,918,292 to
759,493 bytes in 253 ms. These are synthetic examples, not a benchmark of a
physical phone or the target Intel Mac.

| Images | Bytes at the measured camera fixture size | Current new-Run policy |
| --- | ---: | --- |
| 20 | 10,542,500 | Within count and cumulative-byte cap |
| 40 | 21,085,000 | Within count and cumulative-byte cap |
| 50 | 26,356,250 | Within count and cumulative-byte cap |
| 65 | 34,263,125 | Exceeds 60-image cap, regardless of byte total |

The real transport scenario uses a separate tiny 69-byte synthetic PNG to
isolate protocol correctness. Its 50 accepted PUTs/3,450 bytes are not a camera
throughput or memory claim. A 65-file selection admits 60, and the server
independently rejects an over-capacity direct upload. Legacy limits are tested.
Do not extrapolate one-image CPU time to a batch or label Chromium heap metrics
as WebKit/iPhone measurements.

Storage cost is `retained upload bytes / billing unit * regional storage rate`,
plus previews, reads, writes, Functions compute, downloads and logs. Use actual
bucket class/region and retention before quoting a bill. For illustration only,
1,000 services with 50 copies of the measured camera fixture add 26.36 GB of
primary images per month before thumbnails/retention. No invoice or billing
export was inspected. Current references are [Firebase pricing](https://firebase.google.com/pricing),
[Cloud Storage pricing](https://cloud.google.com/storage/pricing), and
[Firestore query costs](https://firebase.google.com/docs/firestore/pricing).

Weekly Close previously loaded all period Jobs and complete client/property
catalogs. Its candidate caps Job scans at 200 plus one lookahead document,
reads only referenced context in batches of 30, and labels every truncated
aggregate incomplete. Narrow the date range to obtain a complete result.
Deterministic 10/100/1,000-record tests record request and document counts;
these measure query work, not Production latency or a billing prediction.

## Privacy and preserved work

The bounded read-only repository audit covered main and 97 advertised heads
through 3,486 text blobs. It found no high-confidence credential signatures.
This is not a certification of all personal content or media; an archived
contact-sheet image was not visually classified. No historical rewrite,
repository visibility change, credential rotation or access-policy change
was performed.

Existing dirty Intake, translation, central state and visual worktrees are
preserved. Where doctor found path overlap, this increment used independent
feature-local translations and a focused checkpoint rather than overriding the
claim gate or editing the other checkout. No active worktree or stash was
removed. Current State's pre-existing conflicting local edits remain untouched.

## Release preparation and next actions

1. Review the independent PRs and their exact merged-candidate CI results.
   Review small finance controls and portal resume behavior with the visual owner.
2. Verify the combined local tree, then let the integration owner integrate
   reviewed PRs. Recheck the actual main and sealed Production baseline.
3. Under separate exact-SHA Production GO, prepare and hash retained forward
   and rollback Hosting packages; verify both old/new entry-asset combinations.
   Select only the five changed Functions if all runtime changes ship together.
4. Preserve the existing ae77040 receipt and every unaffected Function revision,
   Rules release, schedule, pilot binding and domain setting. Seal runtime
   snapshots and exact source rollback before switching; check both public
   addresses and functional entry after publication.
5. Portal backend rollback restores the earlier scope flaw, so review forward
   correction first. No cloud package staging or deploy occurs in this mission.

The current baseline receipt remains in the original P0 worktree under
`.tmp/release-notification-logs-ae77040-20261113`. Its Hosting version is
`e0c32adf8eaafaea`; the earlier retained `783b9c9` rollback is `4e86fe75cf39237c`.
Revalidate those snapshots at the next actual release. They are not a seal of
a newly integrated Autopilot source. Backend rollback is mixed: use the four
notification revisions sealed by ae77040 and the portal revision sealed by the
783b9c9 receipt. The historical Hosting rollback is not a newly prepared package.

Physical acceptance still requires consent and a legitimate workflow on the
2020 Intel MacBook Air (quad-core i5 1.1 GHz, 16 GB, Sequoia) and iPhone/Android.
Do not use real client/cleaner records as test fixtures. The first calendar feed
needs a consented private connection, source/event classification and mapping;
no feed URL belongs in Git or logs. Invoices, multi-vacancy policy and revised
report-release policy remain distinct follow-up decisions/contracts.
