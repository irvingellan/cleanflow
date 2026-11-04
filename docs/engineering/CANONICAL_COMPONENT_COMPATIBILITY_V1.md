# Canonical component compatibility contract V1

Status: functional integration contract only. No visual code, authentication, persistence, provider or Production behavior is implemented by this document. Canonical ledger remains `WORKTREE_RELEASE_CANDIDATE_REGISTRY.md`.

## Ownership and source boundaries

| Owner | Files / responsibility | Rule |
|---|---|---|
| Claude | Approved `src/prototypes/manager-workspace-v3/` components, CSS/tokens, visual interactions/responsive layouts, visual QA | Original branch08390b6 remains unchanged; no wholesale port authorized |
| Codex | Existing `src/features/*` services/hooks, Firebase boundary, Functions/auth/notifications/PWA, deterministic adapters and technical tests | Reuse manager guards and frozen evidence/lifecycle contracts; no visual redesign |
| Joint, one writer at a time | `src/App.jsx`, i18n, Vite/environment activation, component props boundary | Record the precise owned range before touching; preserve notification sign-out and current routing/access |
| Product owner / coordination | Approved component subset, source coverage, actual human acceptance, rollout and private destination approval | A prototype screenshot/test or mergeable tree does not authorize behavior/security/release |

No concurrent editing of the same visual file. Component adoption is a future reviewed import from exact commits; localStorage/demo state must never be wired as the live backend. Do not port V2RC's older shared App/Vite/translations wholesale over b7. The actual conflict matrix is in the registry.

## Existing contracts are proposals

Cleaner Hub source08390b6 contains typed `contracts/DEVICE_HEALTH_UI_PROPS.ts` and `contracts/NOTIFICATION_INBOX_UI_PROPS.ts`. Preserve their visual intent, but their declarations do not create `DeviceHealthService`, authenticated Hub queries, durable inbox/read/open storage or receipt evidence. In particular, the prototype's instruction to port `deviceReadiness` as-is is subordinate to real evidence: do not fabricate `supported`, `active`, `confirmed`, complete history or current version to satisfy a required field.

## Adapter rules for future approved components

| Visual field / intent | Existing functional source | Truthful boundary / remaining work |
|---|---|---|
| Local context, permission, messaging-worker identity | `notificationHealthService`, `messagingWorkerReadiness`, `deriveNotificationReadiness` | Root worker is not the messaging worker. A browser tab does not know if another installed PWA exists. Preserve unsupported versus unknown; no permissions prompt on render |
| Enrollment / reconnect | `refreshPushNotifications`, existing explicit enable action | Actual Auth session and bounded generation matter. Enrollment acknowledgment is observed readiness, not present device delivery. Timestamp/freshness must remain explicit |
| `lastActive`, version, remote device state | Existing authorized metadata where actually present | Missing data stays null/unknown; do not substitute now or infer installed/current from viewport. Existing developer diagnostics are privileged, not a cleaner endpoint |
| Test / recovery | Existing current-device test action only under its authorization | Explicit gesture only; acceptance is not receipt/display. No new send on mount, provider fallback, claim replay or unbounded retry |
| `lastConfirmed` / `recordTestOutcome` | No complete durable implementation in this candidate | Remain unavailable/null until a scoped evidence/authorization/storage contract exists; prototype local toggles are not server confirmation |
| Notification history | Existing durable outboxes/audits plus capped diagnostics | Global unordered100-record sample can omit newest org events. Do not label it a complete inbox, infer missing delivery as zero, or expose raw records to cleaners |
| Read / unread / opened / subscription | Prototype contract only | No write adapter exists; do not add mock success or use localStorage as persistence. Explicit scope and server-owned recipient authorization needed |
| Cleaner schedule / job navigation | Existing assignment semantics are reference only | Cleaner auth identity↔directory mapping, tenant scope, revocation and safe read model are NOT implemented. No manager service fallback or public capability as permanent login |

The existing headless readiness result uses `delivery: UNKNOWN` even when registered. UI adapters must preserve that fact. Keep account attribution, device/session context and physical identity separate. Do not label a named person's experience from UID/browser alone or add invasive fingerprinting.

## Security before live Hub wiring

- Require explicit authenticated cleaner identity and active organization/assignment eligibility. A component prop, local role selector, raw cleanerId or opaque device ID is never authorization.
- Server projection must exclude client billing/margins, other cleaner compensation/identity, internal notes/access codes, tokens and private photos. Reuse current server authority rather than exposing manager collections.
- Cleaner schedule usefulness requires separately consented source-coverage/freshness evidence against the authoritative schedule; no Notion read/integration is authorized here.
- Revoked/reassigned/moved records and stale/offline responses need explicit semantics and cross-user/org denial tests. Cache-only data cannot establish current authorization or work completeness.
- Preserve existing Multi-Photo policy2 and legacy frozen Run semantics. Completion, public capability validity and financial authority remain current services' decisions.

## Import and acceptance handshake

1. Product/Claude names a bounded approved component subset and exact source range.
2. Codex lists imports/props/callbacks and unavailable services; the visual owner decides any presentation change needed for unknown/unavailable fields.
3. A synthetic adapter fixture proves no provider/data work during render and invokes existing actions only after explicit controls.
4. Security/emulator tests prove recipient scope; desktop/mobile/keyboard visual tests belong to the approved component integration.
5. Capture/source backup, exact tested commit and rollback receipt advance `codex/development`; main/Production/remote changes require separate approval.

This contract is deliberately not a new auth system, rule engine, notification platform, UI framework or promise of a finished Cleaner Hub.
