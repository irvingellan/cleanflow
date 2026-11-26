## Change and ownership

- Issue and owner
- Worktree branch, merge base and PR head
- Scope is inferred from the merge-base diff. Add `scope:full` to force full scope.
- Changed behavior and paths that another task may own

## Verification and release

- Checks run and observed results
- Status, such as LOCAL, CI, SANDBOX or verified PRODUCTION
- If releasing, sealed plan, backend scope, receipt and rollback
- Release requires a green CI run on the exact main commit being published.
- Remaining risk and next action

Use sanitized results. Record physical and authenticated acceptance separately.

## For the manager (plain language)

- One or two short lines describing what changes on screen or in behavior, written for a non-technical reader. After the release is live, this text is copied into the assistant guide. Never describe it as available before it is live.
