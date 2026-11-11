# Prepare Hosting packages with retained assets

Generate the candidate with the existing clean Hosting preparation for its full
SHA and the approved Production cleaner push build settings. Keep the exact
review directories from the active release and its predecessor.

```sh
node scripts/prepareStartupHostingRetention.mjs \
  --candidate-dist "$candidate_dist" \
  --candidate-manifest "$candidate_manifest" \
  --candidate-sha "$candidate_sha" \
  --baseline-review "$active_release_review" \
  --baseline-version "$active_hosting_version" \
  --older-review "$preceding_release_review" \
  --out "$new_local_directory"
```

Use the absolute path to each reviewed release directory. Each contains its
`assets-U` distribution and `hosting-manifest-U.json`, `release-plan-U.json`
and `publish-receipt-U.json`. Confirm the active Hosting version from the
live channel before preparing the packages. The optional older review must
match the previous release sealed into the active review.

The script writes `forward/`, `rollback/` and `retention-manifest.json` in the
new directory. Each package includes the complete primary build and the
reviewed hashed JS, CSS and fonts from the other builds. The primary HTML, build
marker, manifests and workers keep their exact bytes. The script checks every
file against its source manifest, binds each release review to its COMPLETE
receipt and rejects an asset path with conflicting bytes. The printed SHA-256
seals both staged inventories. Keep the packages private and treat them as
read-only after preparation.

Before any authorized switch, verify the active release and backend snapshot,
the sealed staged inventories and the normalized Hosting configuration. Verify
that both prepared versions contain the full file sets. Use GET and compare
content type and bytes for the old and new JS and CSS. Confirm that both
entry pages and the version marker match the primary build after each switch.
Keep the original finalized baseline available as an emergency rollback. Its
exact historical inventory can break tabs that already hold the newer HTML.

The preparation is local. Deploying either package or creating a Hosting preview
requires the corresponding release authorization. Keep the additional hashes
through the agreed compatibility window and review retirement after observing
the affected startup flows. Record only inventories and digests in the handoff.

```sh
node --test scripts/prepareStartupHostingRetention.test.mjs scripts/prepareHosting.test.mjs
```
