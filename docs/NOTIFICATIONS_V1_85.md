# CleanFlow notifications V1 · Issue #85

This local candidate composes the published Cleaner Hub checkpoint, the local
Issue #86 first-accept flow, and the selective manager reliability patch
`a931468`. It extends the installed Firebase SDK, Firestore transactions, the
existing agenda triggers, and FCM. The simulated Notification Lab remains a
visual reference. No additional provider or package is required.

## Event catalog

| Scenario | Committed source and Inbox audience |
|---|---|
| C01 · New offer | A recipient's usable Offer generation. Automatic offers publish at creation. A manual Offer becomes usable when its link is issued. Token rotation on the same generation produces no second event. |
| C02 · Automatic assignment | The winning cleaner's committed roster addition and first-accept claim. |
| C03 · Manual assignment | The cleaner added to a committed Job roster. |
| C04 · Reschedule | A committed date or time change for a cleaner who remains assigned. The current schedule revision controls push eligibility. |
| C05 · Cancellation or removal | The previous assigned cleaner. The event remains readable as generic history, with no route or service label once access is gone. |
| M01 · Interest | Existing durable `CLEANER_INTERESTED` event plus manager Inbox item in the same transaction. |
| M02 · Automatic winner | Existing `ASSIGNMENT_CONFIRMED` push event plus one `AUTO_ASSIGNMENT_CONFIRMED` Inbox item. |
| M03 · Manual confirmation | Existing assignment acknowledgment event, recorded in the same transaction as its Inbox item. |
| M04 · Checklist review | The first committed transition to `READY_FOR_REVIEW` writes the existing push receipt and an Inbox item. |
| M05/M06 · Reminders | Existing Los Angeles windows at 19:00 and 07:00, with one durable manager item per nonempty window before provider selection. |

Competing cleaners see the existing unavailable state in the Hub. The offer
history drops its service label and route when no longer authorized. Other
scenario IDs in the canonical map remain outside this candidate.

## Inbox and authorization

The backend writes cleaner items under
`organizations/{orgId}/cleanerNotificationInboxes/{cleanerId}/items/{eventId}`
and manager items under `organizations/{orgId}/managerNotificationInbox`.
The server stores read and first authorized open receipts by account. A
cleaner derives her organization, cleaner and session from Firebase Auth
and the live membership. Managers use active organization membership.
Client SDK reads and writes to these collections and the push registries
are denied. List/open recheck the current Offer, Job and roster before
returning a service label or destination. Manager links open a Job or the
dashboard. Cleaner links open a current Job or Offer inside the Hub.

The client exposes All, Unread and Read filters over the latest 100 items,
with a bounded unread count and an older-history indicator. Refresh on
focus, reconnect or return uses the authenticated service. A valid mark-read
or open is idempotent across installations. Stored items remain after push
failure. Historical outbox records are not backfilled. Storage deletion and TTL
are deferred until the retention period is approved. The UI uses no offline persistent Inbox cache.
A full list reads at most 101 event rows, 100 receipt rows and up to two
current source documents per event, plus membership and profile checks.
Initial loading and return-to-app refresh are bounded. Cleaner fanout is
capped by eight sessions and one FCM batch per eligible event.

## Cleaner installations and push

- The manager can issue a separate one-time code for another installation.
  Up to eight active sessions share the same cleaner account. An ordinary
  replacement code retires all previous sessions. Account revocation closes
  every session. Existing single-session membership records remain readable.
- A private device record binds organization, account, active session,
  installation, token and revision. Logout or permission loss can retire the
  exact registration. An invalid token retires only the still-matching
  registration. Token and installation bindings remain server-only.
- The distinct cleaner messaging worker uses
  `/cleaner-messaging-sw.js` and scope `/cleaner-messaging-push/`.
  Cleaner Messaging needs a distinct Web app ID in the same Firebase project,
  supplied as `VITE_FIREBASE_CLEANER_MESSAGING_APP_ID`. Separate Firebase
  Web app IDs avoid the SDK's shared token-cache key for different worker
  registrations. Cleaner Auth continues to use its existing named app.
  Cleaner push requires `CLEANER_PUSH_MODE=enabled` on Functions.
  The default is `disabled`. The local emulator cannot send provider traffic.
- A user gesture is required to request permission. iOS/iPadOS Web Push
  requires launching the Home Screen app on a supported OS. Ineligible,
  unavailable and offline states keep the Inbox available when connected.
  Repair is bounded and checks the current session. Push opens the authenticated
  Hub. The existing neutral copy remains the default. For the latest actionable
  reschedule, the worker may display a validated day and time using copy defined
  in the app. The payload excludes property information, names and access details.
- The server rechecks current event and device eligibility and claims one FCM
  attempt. A post-claim retry or ambiguous response cannot cause a second send.
  Provider acceptance is reported as acceptance. Background display and
  device receipt are unknown unless separately observed. Opening an Inbox
  item records an authorized open and does not imply the push caused it.

Sources for release review: [FCM Web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started),
[FCM registration management](https://firebase.google.com/docs/cloud-messaging/manage-tokens),
[WebKit Home Screen push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## Manager device compatibility

Manager enrollment retains the revision guard and now binds the exact token
and installation by hash. Enrolling another account on the same installation
supersedes its prior bound owner while preserving other installations.
Unclaimed legacy registrations stay eligible, and a legacy token can be
adopted when it matches exactly. A legacy installation that rotated its token
before a binding existed may require explicit recovery. Messages already
queued to the older manager worker are outside the new cleaner worker gate.
Validate cold logout and account switching on the actual shared installation
before relying on manager push in that setup.

## Review, release and recovery

Run the unit suite, Hub security suite, manager security suite, runtime and
Hosting guards, and both Cleaner Hub browser profiles with Java 21 and Node
22. Use the dedicated `demo-cleanflow` emulators and a credential denial path.
The browser suite verifies the Inbox and existing flows. It does not exercise
real APNs/FCM display or installed mobile hardware. See the local handoff for
the exact commands, tested SHA and evidence.

1. Review the tested SHA and fresh public Hosting, Rules and Functions
   identities before any release. Prepare an exact-SHA Hosting manifest.
   Verify Node 22, region, instance ceilings, bindings and the allowlisted
   changes. Confirm the manager's current FCM policy remains in place.
2. Under release approval, stage compatible Rules, the named Functions and
   triggers, then the exact Hosting candidate. Keep cleaner push disabled for
   the first Inbox-only pilot. Start with disposable test accounts and current
   access authorization. Existing manager deliveries keep their prior policy.
3. Obtain a separately authorized same-project cleaner messaging Web app ID,
   verify its VAPID and worker configuration, and review the enabled build.
   Enable cleaner push only after reviewing the first pilot and opting in on
   physical devices. Use one consenting manager and cleaner, two installations,
   and record installation state, permission, registration revision, provider
   result, physical observation and opened Inbox independently.
4. If cleaner delivery causes problems, switch its dispatch mode to disabled
   using an authorized backend release. Keep server event producers and
   Inbox authorization intact. Do not replay historical push events.
   After multi-device enrollment, a rollback build must retain multi-session
   Rules, server auth checks and the client membership reader. An older
   one-session Hosting build alone would lose access on an earlier device.
   Keep committed business writes, read receipts and delivery audit records.
