# Multi-photo checklist V1 — local candidate

Issue #81. Feature version V1 uses frozen **evidence policy version 2**; those
numbers refer to different things. No merge, push or cloud release is authorized.

## Model and compatibility

New Runs receive trusted frozen `evidencePolicy` limits: initial 20 photos and
50 MiB saved/pending obligations. The trusted server configuration can lower
these limits; a browser cannot choose them. Existing policy-absent Runs retain
the single-photo model without migration. Existing document IDs/history and
legacy report image routes remain valid.

Each saved entry exposes only opaque evidence ID, requirement ID, MIME, byte
size and creation time. One `living-belongings` entry is required; `additional`
entries are optional. Private content identities, reservation/removal receipts
and Storage attempts never become public download URLs or report fields.
The required legacy alias is kept transactionally compatible.

Reservations atomically charge count/bytes, including ambiguous obligations.
Storage operations happen outside retryable Firestore transactions. Fresh
capability/context/DRAFT/lease checks precede finalization. The dedicated V2
Storage client has automatic retries disabled without changing legacy behavior.
Content replay is deduplicated; removed content is tombstoned and cannot be
re-added. Correcting a removed photo requires a different image. Up to 100
distinct content identities bound repeated removal/replacement.

After READY_FOR_REVIEW, evidence is immutable. Required frozen answers and
server-saved evidence remain authoritative. Confirmation follows readiness;
success follows the server receipt, never local selection/upload progress.
The Job is not automatically completed and payment state is not changed.

## Browser and privacy

Library selection appends; camera adds one at a time. One sequential native
encoder/uploader owns retained Files/Blobs, bounded to 50 MiB. Input admission
is 20 MiB and 16 MP; server upload limit remains 5 MiB. Native canvas targets
1920px / JPEG .85 with bounded fallback qualities, correct orientation and no
upscale/growth. Safe smaller originals may be retained. EXIF/GPS/comments and
unsupported metadata are stripped or rejected. HEIC/HEIF is explicitly denied.
The existing File → deadline-bounded arrayBuffer → fresh Blob transport remains.

Local failed photos can be retried/discarded; ambiguous server outcomes require
fresh safe gallery reconciliation. Removing evidence requires a server receipt.
Reload cannot preserve unsaved browser File handles. Cleaner/manager previews
load explicitly one at a time; reports lazily show all saved authorized photos.
Neither filename, private path, hash, access data nor financial data is exposed.

## Evidence boundaries and accepted limitations

- Synthetic Chromium/WebKit and actual isolated emulators prove software flows,
  not physical iPhone thermal/memory/detail, real network or cloud behavior.
- Native File reads/codec/GC are not physically cancellable or hard memory capped.
  A 16 MP decode alone may require about 64 MB RGBA plus native copies.
- Server image validation checks container/signature/dimensions/privacy; it is
  not a full pixel decoder or decompression-proof guarantee.
- Unknown/crashed writers remain quota-charged indefinitely until positively
  settled; no background cleanup worker is introduced. Such attempts can exhaust
  remaining capacity. Expired/non-finalizable attempts do not prevent review
  when required saved evidence and answers are otherwise complete.
- Lost-response tests use one scoped Playwright interception; WebKit route.fetch
  required explicit known fixture bytes. Ordinary and retry transport stayed
  native and persisted bytes were checked. Service workers were blocked in that
  disposable suite; private-worker validation is a separate gate.
- Manager browser integration renders a real authorized projection via an
  alternate-port REST adapter, not the full authenticated manager shell.
- Upload timings are warm local loopback measurements, not iPhone/cloud latency.
- Firebase Storage currently requires Blaze availability even for no-cost usage.
  No billing/configuration was inspected or changed for this candidate.

## Rollback and next gate

All application changes are local commits on the isolated branch. Original
completion/private-origin/V2 candidates remain preserved. The private preview
uses only synthetic `demo-cleanflow` emulators and a narrowly allowlisted
loopback gateway through Tailscale Serve, never Funnel. Stop only its owned
runtime/handler using the supplied cleanup script; retain the old private
runtime for local rollback. Do not release before physical iPhone acceptance
and an independently authorized deployment plan.

Storage prerequisite: https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
