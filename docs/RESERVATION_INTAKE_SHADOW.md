# Reservation intake shadow replay

Issue [#79](https://github.com/irvingellan/cleanflow/issues/79). Selective reuse of the
parser, fingerprint, normalization, ordering and diff contracts in draft
[PR #80](https://github.com/irvingellan/cleanflow/pull/80). The current slice has a
local fixture replay and a read-only review projection. The app, exported
Functions, Firestore Rules, indexes and notification pathways are unchanged.

## Run the synthetic review

Use Node 22 from the repository root.

```sh
node tools/reservation-observer/replay.mjs \
  --fixture tools/reservation-observer/fixtures/demo.json \
  --state-dir .tmp/reservation-intake-demo
npm test -- functions/src/reservationIntake
```

The example returns six separate calendar candidates with before/after dates, a
possible duplicate across providers, a conflict against an existing assigned
Job, excluded calendar blocks and owner stays, an unclassified event for review,
and one new date-only cleaning suggestion. Replaying the same fixture in the
same state directory reproduces the same candidates, audit and suggestions.
Each run uses a private, organization-scoped local state file. A process lock
prevents overlapping updates, and an atomic rename preserves a previous state
if the replay fails before publication. If a crashed process left a lock,
verify it has stopped before clearing that lock or use a new state directory.

The manifest accepts the synthetic project `demo-cleanflow`, a
`synthetic-*` organization, configured sources and Properties, a minimized
Job snapshot, and a sequence of local ICS fixtures or simulated failures. Source,
Property and Job IDs are fixture aliases. The source mapping explicitly
classifies each known fixture UID. Unclassified events stay in review. Calendar
summaries, descriptions, attendee fields, alarms and raw UIDs are excluded from
state and output. Fixture paths must resolve beneath the manifest's directory.
The replay has no network client or provider URL input. A manifest and its ICS
files must use fictitious records.

## Review rules

- Source and optional listing scope the stable hashed UID. Exact repeats are
  idempotent. A potentially duplicate reservation in another source remains a
  separate observation. Correlation requires the same mapped Property and date
  evidence.
- A change needs provable source ordering. Contradictory sequence and
  modification time, conflicting duplicate events and stale snapshots preserve
  the last established dates. Read failures, unmodified content and incomplete
  snapshots cannot increase absence counts.
- Only an explicitly complete Hospitable fixture can advance a booking's
  absence count. Three distinct successful complete observations can mark a
  possible cancellation. Explicit calendar cancellation and reappearance are
  recorded for review. Jobs, Assignments and Checklists remain untouched.
- A new cleaning suggestion requires a classified booking with confirmed
  calendar status. Missing or tentative status requires review.
- Exact UTC times are projected into a configured Property time zone and use
  elapsed minutes for turnover. Date-only events can suggest a day where no
  conflict is identified. Close date-only turnovers and missing operating
  time zones require review. The parser leaves floating or TZID event times
  unclear and rejects recurrence and duration forms outside this pilot.
- Every Job match uses both Property and checkout day, including previously
  observed checkout dates. A likely existing Job stays in review, with specific
  reasons for assigned, started, edited, archived or multiple matches.
  Nothing attaches, creates, moves, cancels or assigns an operational Job.

## First authorized feed session

The adapter boundary is `parseIcal(text, source, observedAt)`. For the first
one-property shadow session, confirm the property-to-calendar mapping, owner
consent and which event classes the provider can establish. Supply any
authorized URL through an approved private connector or local secret
configuration once one is reviewed. Keep it out of fixture manifests, Git and
diagnostics. Compare a small set of known bookings, blocks and one reviewed
change to the calendar with the manager. Establish timezone, ordering and
snapshot coverage before enabling any completeness claims. This slice has no
fetch, schedule or polling configuration.

Review suggestions against the existing Job roster first. Human confirmation
and automatic Job creation are later layers with their own authorization and
audit gates. The old draft's promotion and UI code remains available for
separate review. It has no entry point in this candidate.

The dependency search considered maintained parsers
[node-ical](https://github.com/jens-maus/node-ical) and
[ical.js](https://github.com/kewisch/ical.js/). The current fixture subset
extends the existing reader without a dependency change. A broader
[RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) integration should validate
provider-specific TZID, recurrence and cancellation behavior before choosing
the next parser.
