# Client portal scope and resume regression

Issue #42. Candidate based on `ae77040`. No Production deployment.

The existing DEC-056 portal is reused. A report is still released by creating
an unrevoked client report. The independent report capability has its existing
lifetime and policy. No new role, collection, Function, Rule or index is added.

## Reproduced defects

- The list omitted a Property after reassignment/archive, but a previously known
  Job ID could still return its report/photo through the old client's portal.
  Direct access checked only the saved Job client ID. Eight synthetic negative
  tests failed on the baseline. Direct reads now also require the current active
  Property/client binding and a valid service date within the last 120 days.
  The emulator exercises the actual public handler for report, photo and thumbnail.
- A restored portal could continue showing a report after the link was revoked.
  Two component regressions failed on the baseline. Page hide/restore and tab
  suspension now clear old content, cancel the old request and revalidate.
  A generation guard rejects responses from before suspension.
- Fetch/body parsing have a 15-second deadline. A suspended event loop cannot
  accept a response after its wall-clock deadline, and cancellation clears the
  pending timer even when the transport ignores abort.

## Scope and cost

Only `publicClientPortal` needs a backend update for this change. Frontend
portal files also require Hosting. All other 56 Function revisions, Rules,
indexes, domain, notification configuration and data must stay unchanged.
Direct report/photo authorization adds one Property document read per request.
The list now avoids report-release lookups for ineligible properties. A request
already authorized before a concurrent change is not a guarantee of instantaneous
revocation of previously downloaded content.

Tests use fictitious owners, houses and photographs. No live token, real report,
notification or customer data is used. Component lifecycle events reproduce the
application behavior; they are not physical Safari/BFCache acceptance.

## Verification and release review

Run the portal unit/component tests with:

```sh
npm test -- functions/src/clientPortalService.test.js src/features/client-portal
```

The existing manager security suite also covers Property transfer/archive,
portal expiry, replacement, revocation, report hiding and private-data exclusion.
Use the normal emulator-only security gate, then the complete CI gates on the
combined candidate before any separately authorized publication.

Release from an integrated exact SHA only, snapshot all Function revisions,
stage retained forward/rollback Hosting packages, and prepare the exact prior
`publicClientPortal` source/config from its sealed release receipt. Backend
rollback would restore the reproduced scope flaw, so prefer a corrected forward
release if possible. No rollback or deployment is performed by this PR.

For Claude: no redesign or CSS change. Background/resume returns to the portal
list while current access is checked. Independently shared report pages remain
outside this frontend change. Review that minimal transition before publication.

References: [DEC-056](DECISIONS.md#dec-056--client-portal-one-private-link-per-client-manager-released-content),
[BFCache and sensitive state](https://web.dev/articles/bfcache).
