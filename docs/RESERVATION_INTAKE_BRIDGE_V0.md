# Reservation Intake Bridge V0 — Issue #79

Temporary, branch-only research bridge. Browser DOM extraction is a fallback/validation bridge, not the desired canonical integration. No candidate becomes a Reservation or Cleaning Job automatically.

## Discovery and scope

Authorized operational discovery found fragmented manual messaging and calendar inspection across reservation providers. The experiment tests observation/change review, not integration completeness. All committed examples, screenshots and automated tests are synthetic. No real feed, provider login or customer record was used.

```text
read-only iCal / passive allowlisted DOM / manual observation JSON
  → local provider adapter → validated observation → pure normalizer
  → identity / ordering / diff / correlation → atomic local shadow state
  → paired loopback read API → Sandbox-only read-only Inbox
```

Source priority: iCal first; DOM only for fields unavailable in a feed; manual review/import when either fails. The observer has no Firebase SDK, business-action endpoint or external-platform mutation capability.

## Candidate contract and conservative evidence

Allowlisted observation fields: provider/type/source identity, optional account/listing/reservation/event IDs, listing alias, optional authorized guest display name, check-in/out, timezone, source status, observedAt, sourceUpdatedAt and sequence. No contact, payment, access or session fields. Normalized candidates add organization, `environment=sandbox`, identity strategy/fingerprint, exact mapping state, semantic hash, parser version, confidence, review state, change set and minimal evidence summary.

Dates remain date-only when supplied that way; UTC/offset instants normalize to UTC. Floating/TZID dates without a validated resolver remain null. Missing guest/status/timezone/version stays null. No cleaning start time is inferred from checkout. Invalid ranges are partial/low confidence, not silently corrected.

Identity order: stable reservation ID; listing + event UID; conservative fingerprint. Every identity is scoped to provider **and configured source** (and account when present), so feeds cannot silently take ownership of each other's candidates. Cross-source similarity produces `possibleDuplicateOf`, never merging. Fallback includes more than property/date and is low confidence. A changed fallback date can produce a new candidate; a human must correlate it. Indistinguishable fallback events within one poll fail closed as `FALLBACK_ID_COLLISION`.

Repeated identical observations refresh metadata without duplication, including after restart. Explicit differences record before/after. Source timestamp/sequence is required to prove that changed data is newer; `observedAt` alone does not prove source freshness. Older or unversioned changes preserve current data and expose a conflict with the sanitized incoming observation. Missing previously known dates cannot erase them.

Only distinct newer successful **complete** snapshots count disappearance: first/second `SOURCE_DISAPPEARED`, third `POSSIBLE_CANCELLED`, always requiring review. DOM/manual snapshots are never complete. Network errors, malformed feeds, parser failure and 304 do not advance missing count. Restored observations clear missing count. `completeSnapshot` defaults false: enable only after validating full, stable feed coverage. Rolling date windows or removed listings are not cancellation proof. Explicit iCal `STATUS:CANCELLED` is separate source evidence, not a Job cancellation; a calendar block need not be a reservation.

Mapping uses exact configured source + listing ID. One distinct target = MATCHED; none = UNKNOWN; multiple = AMBIGUOUS. Never fuzzy-match or update a Property.

## iCal adapter

Bounded HTTPS GET, exact configured host, no redirects/auth cookies, 10-second whole-operation deadline, 2 MiB body limit, ETag/Last-Modified support. Extracts only UID, DTSTART, DTEND, STATUS, LAST-MODIFIED, SEQUENCE. Summary/description/alarms/contact fields are discarded. Supports simple all-day and UTC VEVENTs; recurrence, exceptions and duration are explicitly unsupported and invalidate the poll. Synthetic fixtures cover change, restore, duplicates and failures. No real-provider feed availability is claimed.

Calendar subset follows [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545); it is not a complete RFC parser.

## Passive browser prototype

Manifest V3 content scripts cover only HTTPS `my.hospitable.com` and `app.guesty.com` calendar/reservations paths. A second runtime path/origin check applies. Only own-extension pairing settings are read; platform cookies, storage, credentials, headers, HTML and screenshots are never collected. MutationObserver is debounced; no navigation, clicks, refresh or form submission.

**Both parsers currently recognize only the explicit synthetic DOM contract** (`data-reservation-bridge-profile="v0-synthetic"`, allowlisted attributes). This proves the adapter/security plumbing, NOT real Hospitable/Guesty selectors. Unknown layout, logged-out page or MFA screen returns `PARSER_NEEDS_REVIEW`; the prototype does not bypass authentication or guess arbitrary page text. Before a real browser trial, minimally inspect an authorized rendered reservation fragment and add a reviewed provider profile/fixture. No credentials are needed for synthetic tests. Content-script behavior references [Chrome's documentation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).

## Local operation and manual fallback

1. Copy `tools/reservation-observer/reservation-observer.example.json` to gitignored `reservation-observer.local.json`; keep actual feed URLs local and secret. Configure exact allowed HTTPS host, optional alias/listing/account IDs, and exact mappings. Keep completeSnapshot false until proven. For browser pairing add the unpacked extension's explicit `extensionId` (32 a–p characters) and enabled BROWSER_DOM source IDs.
2. Run `node tools/reservation-observer/run.mjs reservation-observer.local.json`. It binds **127.0.0.1 only**, refuses Production/unknown project or origin, and writes private `.reservation-observer/` atomic state and `pairing.local.json` (mode 0600). The latter contains only a random local pairing key, never a provider token. Do not share it in chat. One writer lock prevents concurrent observer/manual import. Stale lock after a crash requires manual inspection, never automatic state deletion.
3. Extension options accept that local pairing key/port/source IDs. Register no platform credentials. The background worker validates sender/provider/source and POSTs only allowlisted shadow observations. Sandbox Inbox explicitly GETs paired `/candidates`, or imports sanitized exported `{candidates:[...]}` JSON. Loopback access may require browser local-network permission; if blocked, use local JSON export/import, never Production fallback.
4. Manual observations use an enabled MANUAL_IMPORT source and `node tools/reservation-observer/import.mjs reservation-observer.local.json synthetic-observations.json`. It normalizes into the same local state, with incomplete snapshot semantics. Stop the observer first; import refuses its writer lock. Manual date changes without source version produce conflict/review rather than assumed freshness.

Read endpoints: `/health`, `/candidates`, `/candidates/:id`, `/observations` (bounded diagnostics). POST `/observations` is shadow ingestion only. Every request requires loopback/exact Host and random pairing; browser origins are restricted to exact Sandbox origin or configured extension origin. Missing Origin does not bypass pairing. State corruption, binding changes and symlinks fail closed without erasing state. Restart reloads state; HTTP validators are memory-only, so first restart fetch is unconditional and idempotent.

## Sandbox UI / Production exclusion

ManagerAccess remains required. The preview entry is additionally developer-navigation gated, and lazy-imported only in Sandbox builds. Production tree-shakes the experiment UI, CSS, fixtures, parser/tooling and local controls. No Firebase collection is added. UI filtering/details/JSON reads do not create Jobs, offers, assignments, messages or reservations. The normal Sandbox shell's existing auth/telemetry behavior is unchanged.

This delivery uses local synthetic visual proof, **no Hosting deployment**. A future Sandbox publication must use existing release hygiene: the separately named Inbox chunk is permitted only with explicit Sandbox binding. Production still rejects it. Do not bypass manifest checks or publish Production for this experiment.

## Failure behavior and threat model

- Secret feed URL: ignored config/state; no URL/error dumps; allowlisted categories only. URLs remain bearer secrets locally, not encrypted at rest. Protect the local account/device and backups.
- SSRF: exact host, HTTPS/no redirects, public-address preflight, bounded DNS/fetch/body. Residual DNS rebinding between check and fetch is not fully prevented; use only manually vetted trusted provider feeds. No arbitrary remote URL input endpoint.
- Malicious page/DOM spoof: exact origin/path + extension sender/provider + random local pairing + schema/field/body limits. Authorized-page DOM is still untrusted evidence; injection or local malware may spoof it. Review required; zero operational actions.
- Local exposure: bind loopback, exact Host rejects rebinding, CORS restricts origins, pairing required. Pairing is not protection against compromised local user/extensions.
- 401/403/session expiry/platform unavailable/timeout: safe diagnostics, no disappearance. Unknown DOM/MFA: parser review; no bypass. Empty feed only establishes possible disappearance when independently configured complete. Malformed/recurrence/duplicate conflicting identity: entire poll rejected.
- Ordering missing/version ambiguity: preserve known data/conflict. Corrupt local state: halt/review, not reset. Sandbox unavailable: local state remains, UI error/manual fallback, never Production.
- Local state retention is bounded by operator scope: up to 1000 observations per batch, 100 diagnostic entries, bounded previous/conflict snapshots; inspect/archive local state before growth exceeds the 10 MiB reload guard. This is not a canonical reservation database.

## Validation and next authorized discovery

`npm test -- src/features/reservation-intake`; `npx playwright test --config playwright.reservation-intake.config.js`; full `npm test`; environment guard tests; Production and Sandbox builds; diff check. Tests cover A–L: new/repeated/change/disappearance/network/out-of-order/unknown mapping/ambiguous mapping/multi-source/layout change/guest absent, plus loopback, pairing, forbidden schema, restart/corruption, deadline and manual-writer collision. Screenshots under ignored `artifacts/reservation-intake-*.png` contain only synthetic data.

Future session (not requested now): the operator opens the usual Hospitable and Guesty pages manually; identifies read-only calendar exports; authorizes minimal rendered-DOM inspection if feed fields are missing; verifies listing, guest display, dates/status and what cancellation/date changes actually look like. Configure a single vetted local source, compare shadow observations manually, and validate completeness/version behavior before expanding. Never request password, cookie, token, MFA code or secret feed URL in chat. No source-to-Job mapping until cleaning timing/conflict/cancellation rules receive separate product approval.

Long-term migration: replace provider extraction with official authorized APIs/webhooks through the same observation/normalization boundary; retain conservative identity/order/mapping tests. Browser fallback is disposable. No canonical API integration, scheduler/cloud service or automatic Job creation is introduced here.
