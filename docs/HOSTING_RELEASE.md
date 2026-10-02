# Hosting release preparation

From a clean tracked working tree at the approved commit, run:

```sh
npm run hosting:prepare -- <full-approved-SHA>
```

Preparation removes only `dist`, builds with that SHA, removes root/nested
`.DS_Store`, rejects unexpected files/symlinks/temporary artifacts, checks the
build marker, and prints a sorted SHA-256 file manifest. The manifest is saved
outside the published directory at gitignored
`.firebase/hosting-prepared-manifest.json`. Failed preparation must stop a release.
Only tracked `public` assets and the current Vite-generated output are allowed.
An intentional build-output change requires updating this allowlist.

This command never deploys. Deployment remains a separately approved action.
Do not change `dist` after preparation. Hosting explicitly ignores Finder
artifacts even if macOS recreates them between preparation and deployment.
The manifest is preparation evidence, not proof of what is live; compare live
file hashes and version marker after any authorized Hosting-only release.

Focused checks: `node --test scripts/prepareHosting.test.mjs`.
