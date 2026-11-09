# CleanFlow Unified Engineering

Issue [#83](https://github.com/irvingellan/cleanflow/issues/83) tracks source
reconciliation. The official repository is [irvingellan/cleanflow](https://github.com/irvingellan/cleanflow).
The GitHub Issues and PRs record tasks and ownership. [Current State](../CURRENT_STATE.md)
summarizes technical state. The [release registry](WORKTREE_RELEASE_CANDIDATE_REGISTRY.md)
and private sealed receipts track exact builds, deployments and rollback. The
Irving Hub note `2026-11-09-5dbclm` provides shared context. Git holds the source.

## Start and finish a task

1. Run `node scripts/engineering.mjs doctor`. It reads the actual remote heads,
   GitHub visibility, the public Production Hosting marker, the local Git
   ancestry and worktrees. A blocked result exits 2. The marker identifies
   Hosting. Verify the sealed receipt for backend state.
2. From verified official `main`, create a dedicated worktree and a branch
   `claude/issue-N-topic` or `codex/issue-N-topic`. Put the owner and intended
   paths in the Issue. Use the existing worktree manager. From the clean task
   checkout, run:

   ```sh
   node scripts/engineering.mjs claim --issue 83 --path docs/engineering
   node scripts/engineering.mjs doctor --path docs/engineering
   ```

   Claims coordinate linked worktrees on this Mac. The Issue coordinates
   agents on different machines. A claim blocks overlaps between files and
   directory scopes and prevents another branch from claiming the same issue.
   Keep the claim until work is handed off. Inspect a stale claim and its
   worktree before deciding to clear it.
3. Commit the scoped change. When the remote is private and the outgoing
   history is reviewed, open one draft PR against `main` with a single
   `scope:hosting` or `scope:full` label. Bring the exact current `main` into
   the candidate before review. Have the other agent review affected shared
   interfaces. The Actions workflow checks the PR event base against the
   fetched main, runs the scope policy from that base and tests the merge
   candidate without cloud credentials. The first bootstrap PR is
   `scope:full` and requires manual review of the policy and workflow.
4. Generate a shareable checkpoint from the task checkout:

   ```sh
   node scripts/engineering.mjs checkpoint --issue 83
   node scripts/engineering.mjs close --issue 83
   ```

   To write the managed block in Current State, claim
   `docs/CURRENT_STATE.md` in the same task and use `checkpoint --write-state`
   before closing the claim. The command preserves text outside that block.
   The CI summary is generated on each qualifying PR. Publish only a
   sanitized conclusion to the Irving Hub when the task authorizes it. This
   command does not send a message or infer acceptance of a release.

The default branch is the integration line after canonization. An agent task
branch is a review candidate. GitHub branch protections should be set after
the first observed passing checks. Require a PR, approved review, exact
current base and the two Engineering checks. Block force push and deletion.
Keep these settings separate from Firebase deployment permissions. See
[GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## Production

Before each release, collect a fresh snapshot of Hosting, Functions, Rules,
schedules and pilot configuration. Match the plan, manifest, rollback and
exact integrated commit. Obtain the separate Production authorization and
exclusive window. Live drift, lost ownership, an outdated branch or scope
violations stop the operation. Keep signed-out physical Hosting smoke,
authenticated pilot testing and actual customer acceptance separate.

A presentation-only change uses the dedicated Hosting executor. The updater
for Release B requires a reviewed backend delta. Scope checks use the exact
Git trees so a delete or rename cannot hide a protected path. Direct Console
or raw CLI operations are outside these scripts. The control for those paths
is restricted Production access and the exclusive window, not the Git check.

## Initial canonization

The starting local baseline is `0f9735f5641815f00f6ef0912621dee6cb62b9a8`.
Hosting version `b66d088c9aaaa728` and rollback build `00bd608` are bound to
the verified layout release. Preserve those receipts and revalidate them
before relying on them for a later release. Historical commits and branches
stay intact during reconciliation.

Before the first push, require an observed `PRIVATE` from
`gh repo view irvingellan/cleanflow --json visibility`. Re-read the current
`main` and verify the intended fast-forward. Review every commit that will
become reachable, including intermediate trees and files later deleted.
A clean final tree alone is insufficient. If visibility, source or the
privacy review is unresolved, continue with safe local work and record the
blocker. Enable CI and branch protection only after the remote gate clears.

### Hosting command and recovery boundary

After integration and separate release authorization, `scripts/releaseHostingOnly.mjs`
seals a candidate against a COMPLETE B, U or H receipt. Use `seal` with the
full candidate `--sha`, a fresh private `--dir`, `--previous-dir`, the verified
`--env-dir` and `--verification`. `publish` and `rollback` require the exact
`--approve action:planHash` and `--exclusive-window`. The candidate must be
the fresh official main and strictly descend from the observed live source.
The manifest, Firebase configuration and Function revision inventory are
checked again before the Hosting switch and in the readback. Tests use
simulated snapshots. This executor has no physical acceptance or deploy
receipt in this bootstrap.

A COMPLETE Hosting-only receipt can seed another Hosting-only seal. It binds
the original pilot Function SHA separately from the new Hosting SHA.
A later backend update or a release after rollback requires a reviewed new
baseline. The legacy backend updater and per-device approval tool do not
consume the H receipt automatically. Preserve journals and the mutex when a
switch returns an uncertain result. Inspect the exact release and seek
reconciliation under the documented recovery policy before retrying.
