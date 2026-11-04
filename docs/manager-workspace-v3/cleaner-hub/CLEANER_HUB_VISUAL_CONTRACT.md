# Cleaner Hub V1 — visual contract

Issue #84. Branch `feature/cleaner-hub-v1-visual` (local). Prototype:
`src/prototypes/manager-workspace-v3/hub/`. Visual only; Codex supplies data,
auth and security. Nothing here is operator-approved.

## Screens and components

| Screen | Component | Purpose |
|---|---|---|
| Shell | `CleanerHub` | Phone-first app: top bar (brand + readiness chip), content, 4 tabs (Agenda, Ofertas, Avisos, Conta). On ≥1280 px the demo's simulation panel sits beside it. |
| Agenda | `Agenda` | Greeting, `CoverageBanner`, readiness nudge, recent changes, segmented Hoje / Próximas / Feitas, `DayGroups` → `JobCard`. |
| Job detail | `JobView` | When, where (area only), type, her pay, instructions, checklist card (opens only on the day), privacy note. |
| Checklist | existing `CleanerChecklist` | Reused unchanged (batch photos, submission states). |
| Offers | `Offers` + existing `CleanerOffer` | Offers separated from assigned work; her response state; reused offer page. |
| Inbox | existing `NotificationCenter role="cleaner"` | See NOTIFICATION_STATUS_VISUAL_CONTRACT. |
| Account | `Account` | Alerts on this phone (chip), Add to Home Screen, see first setup again, language, theme, sign out. |
| Alerts on this phone | `Setup` → `DeviceReadiness`, `RecoveryFlow`, `DeviceList` | See NOTIFICATION_STATUS_VISUAL_CONTRACT. |
| First use | `Onboarding` (8 steps) | welcome → identity → her schedule → install → why alerts → permission → registration truth → how to reopen. |
| Install | `InstallGuide` | See PWA_INSTALL_UX_CONTRACT. |

## Data the UI needs (Codex read model, cleaner-scoped)

```ts
interface CleanerScheduleItem {
  id: string; date: string; start: string | null; durationMin: number;
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED";
  type: string;                      // i18n key suffix
  property: { name: string; area: string; instructions: Record<Lang, string> }; // NO address, NO access code
  pay: { mode: "fixed" | "hourly"; amount?: number; rate?: number; estHours?: number }; // HER pay only
  checklist: { state: "none" | "draft" | "submitted" | "reviewed"; done: number; total: number; eligibleNow: boolean };
}
interface CleanerOfferItem { id: string; date: string; start: string | null; area: string; type: string; myResponse: null | "interested" | "declined" }
interface ScheduleChange { id: string; kind: "moved" | "removed"; jobId: string; propertyName: string; from: { date: string; start: string | null }; to?: { date: string; start: string | null }; at: LocalStamp }
interface ScheduleCoverage { status: "verified" | "partial" | "pending" | "unknown"; verifiedAt: LocalStamp | null; pending: number }
```

Rules the server must enforce (the UI assumes them, never filters for security):
- only her own assignments; offers listed only while she is an addressee and not assigned;
- other cleaners, client prices, margins, internal notes, private photos and access codes never reach these payloads;
- a removed assignment disappears from active lists and becomes a `removed` change with no job link;
- times in the organisation's time zone (America/Los_Angeles in the demo), DST-safe.

## States

| Surface | States |
|---|---|
| Agenda | loading (skeleton), list, empty-verified ("Nenhuma limpeza marcada"), empty-uncertain (coverage ≠ verified: "isso não quer dizer que você está livre"), offline/stale (use `CoverageBanner` `unknown`) |
| Job | assigned, in progress, checklist submitted, completed, "not yours anymore" |
| Offer | waiting, interested (manager decides), declined; filled/confirmed via existing offer page |
| Coverage | verified (subtle), partial / pending (attention), unknown (warning) |

## Accessibility

Tabs are buttons with `aria-current="page"`; badges have text counts; every action is a ≥44 px target
(cards ≥72 px); headings per screen; onboarding moves focus to each step heading; system prompts are
`alertdialog`; status changes announce via `role="status"`; reduced motion removes animations.

## Simulated vs real capability matrix

| Capability | In prototype | Real today | Needs Codex |
|---|---|---|---|
| Cleaner-scoped schedule | Synthetic shared state | No cleaner portal | Read model + rules + tests (#84 P0) |
| Identity/session for cleaners | Code "246810" simulated | Public offer/checklist links only | Persistent cleaner auth |
| Schedule coverage vs Notion | Selectable state | Not measured | Read-only coverage comparison; no Notion API in UI |
| Offers | Existing offer flow reused | Public offer links exist | Hub listing of her open offers |
| Checklist | Existing component reused | Exists (link-based) | Open from hub when eligible |
| Date change / removal events | Store actions | Not emitted to cleaners | Server events + cleaner inbox |
| Add to Home Screen | Guides + simulated install dialog | PWA manifest exists (#9/#19) | `beforeinstallprompt` wiring on Android |
| Permission prompt | Simulated sheet | Browser API exists | Request after user gesture, in standalone on iOS |
| Device registration | Evidence fields | Manager push registration exists | Per-device registration for cleaners; staleness detection |
| Test notification | Simulated banner + "did it appear?" | Manager test exists | Test to this device only; record outcome |
| Persistent inbox | Synthetic | No history | Durable per-user inbox (#39/#85) |
| Away center | Synthetic requests | — | Request intake, decisions audit; no auto-commit |
