# Workspace V3 — visual recovery and authenticated read diagnosis

## Acceptance status

**BLOCKED: authenticated Dashboard read category/stage still required.**
The previous READY handoff is superseded by the operator's failed authenticated
trial. Real Safari reproduced the manager shell followed by Dashboard error;
this is not an Auth-screen failure. Synthetic success below is not live-data
acceptance. Issue #51 remains open. No Gabi or physical iPhone acceptance claimed.

## Evidence and actual read path

The existing Dashboard service performs seven concurrent initial Firestore reads
(properties; open Jobs; in-progress Jobs; next-48-hour Jobs; recent completed Jobs;
weekly scheduled Jobs; weekly completed Jobs), then existing bounded Offer/Issue
reads and batched cleaner-name resolution. It does not depend on Dev Center or
notification callables. Safari Inspector showed 404/preflight failures for those
background callables, but they are not proof of the Dashboard cause. Firestore
streaming-channel HTTP 200/duration is also not proof of query completion/latency.
Read-only Sandbox index inventory lists the expected Job indexes; no index was
created, deployed or assumed ready from that inventory alone.

New diagnostic metadata is ephemeral and allowlisted: error category plus pending
read-stage names. No raw provider messages, paths, documents, identities, URLs,
credentials or tokens are displayed/persisted. The existing 20-second deadline,
generation invalidation, stale response suppression and explicit retry remain.
Queries, arguments, ordering, filtering, projections and returned financial/
operational values remain unchanged. A regression unwraps only the diagnostic
wrapper and compares the entire remaining service to its established baseline.

The original provider rejection was discarded by the controller. That is a
confirmed observability limitation, not the proven underlying Sandbox cause.
The isolated preview now exposes safe category/stage details and localized error
copy, Retry, and existing Services navigation. No empty agenda, zeros or stale
retained data are substituted as a successful current read.

Required operator evidence: open the same authenticated isolated Sandbox preview;
if error persists, expand Read diagnostic / Diagnóstico da leitura and provide
only the category and stages. No service data or credentials are needed.

## Impeccable review and implementation

Installed Impeccable 4.3.1 was used; no duplicate install, hooks or trust changes.
Its context launcher could not initialize its engine/cache, so existing PRODUCT,
AGENTS, CURRENT_STATE, original source and V2 tokens were read directly. The
subsequent supported detector returned an empty findings array. This is not a
formal scored audit or substitute for human acceptance.

Findings: the Workspace inherited a centered narrow shell at ultrawide sizes;
static generic loading bars gave no visible pending feedback; weak grouping and
repeated tall attention blocks lost the approved C+A hierarchy; generic failure
copy concealed which dependency failed. The repair scopes full width to Workspace
only, restores a bounded command panel, attention hero/compact queue, semantic
operational summary, Today/Tomorrow context, and a retained 40/60 worklist/detail.
Typography, borders, surfaces, semantic color and icon treatment use V2 tokens.
Existing navigation, actions, selectors and real Job Detail remain authoritative.

A new structured CSS shimmer (1.6 seconds, transform-only) matches content groups;
no fake progress percentage or JavaScript animation loop. It unmounts on success
or failure, pauses when hidden/inactive and becomes static under reduced motion.
The checked original source had no animated Dashboard skeleton to copy; this is
new scoped motion implementing the requested behavior, not a false source claim.

## Comparison boundaries

Before/after captures use matching viewports/themes and the same synthetic
fixture generator. The local-only Claude benchmark imports the untouched original
prototype source from its existing sibling worktree and maps the same synthetic
Jobs, schedule, properties, cleaners, Offers and issues. It has no Firebase client.
Prototype-only acknowledgment/checklist aggregates, simulation, Reservation Intake
and invented actions are deliberately not ported. Its selectors can rank/count
that complete fictional dataset differently from the real bounded Dashboard
projection. Side-by-side captures compare visual hierarchy, not equivalent backend
truth. The real application shell is retained, not replaced by prototype chrome.

## Validation

- 45 focused Workspace/Dashboard tests passed.
- Full unit suite: 130 files / 1,450 tests passed.
- 56 Chromium/WebKit Workspace tests passed: 390/768/1440, EN light/PT dark,
  Spanish controls, ultrawide 3104, shimmer motion, hidden-document pause,
  reduced motion, loading/data/empty/error/retry, navigation, scopes and scroll.
- 26 existing authenticated CURRENT/V2 presentation tests passed.
- 78 isolated Firestore/Storage security tests passed with installed JDK 21.
- 27 environment/build/Hosting guard tests passed.
- Production CURRENT and V2 local builds passed and exclude Workspace/prototype/
  synthetic benchmark. Chunk-size warning remains preexisting; no bundle redesign.
- Final auxiliary presentation checks and exact checkpoint are recorded in the
  sanitized handoff validation manifest.

The browser fixtures use the real App/controllers/services against a synthetic
provider boundary, deny external requests, reject operational writes and keep
telemetry in memory. Emulator-mode presentation is not a real Firebase query;
separate isolated security tests use actual emulators. Keep these evidence levels
separate from the real authenticated Safari failure and any future operator trial.

## Isolation and access

Branch: codex/workspace-v3-visual-loading-repair, based on 2f7403f in the existing
integration worktree. Original integration/prototype, V2 RC, Multi-Photo, main and
Node22 STOP are unchanged. No push/merge: repository is public and separate approval
would be required. No Production, Auth domains, Functions, Rules, Storage, indexes,
IAM, billing or operational data changes.

Only the existing isolated Sandbox Hosting channel was updated:
https://clean-flow-sandbox-irving--workspace-v3-hybrid-2026102-xypi989y.web.app/?workspace=v3
No OAuth-domain synchronization. Missing Sandbox public endpoints stay absent,
not silently redirected to Production. Previous isolated version 320ccd5bd27303e0
is a Sandbox-only rollback reference. Sandbox live is not the preview channel.
Production public marker remains 5c2e52492331577a7cbdc4aa41a8f1a6b9771b45.

Local visual comparison, never operational QA: run the existing Workspace Vite
harness on loopback port 4317; its app URL is /e2e/workspace-v3/index.html?workspace=v3
and original benchmark /e2e/workspace-v3/claude.html. All records are synthetic;
all writes and external provider requests are blocked by the browser tests.
