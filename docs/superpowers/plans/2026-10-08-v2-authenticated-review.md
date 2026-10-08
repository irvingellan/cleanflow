# V2 Authenticated Sandbox Review Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. Independent UX and safety reviews follow implementation.

**Goal:** Publish one isolated authenticated Sandbox preview of the accepted integrated V2 presentation.
**Architecture:** Extend the existing authenticated App with Sandbox-only lazy presentation wrappers. Keep all controllers, services, guards and callback bindings; no synthetic provider in the authenticated app.
**Tech Stack:** Existing React, Vite, Firebase Hosting and Playwright.
**Spec:** User attachment `0b74f026-2032-4f7f-9b94-839267fb6d49/Texto colado.txt`.

## Global Constraints

- Base `668732955140c5450205ce2cd38aaf759160abf8`; isolated branch; no main merge.
- New preview only, project `clean-flow-sandbox-irving`, seven-day expiry.
- No operational writes, auth configuration changes, backend/schema/Rules/Functions changes or production release.
- Production excludes V2 selection; preserve all existing releases and unrelated WIP.

## Review Focus

- Comparison controls must select all four modules consistently without resetting data/filter state.
- Auth/manager access cannot be substituted by a presentation allowlist.
- Secondary navigation must retain origin-aware Back and utilities.
- Cancellation/job-change must not execute stale confirmation handlers.
- Firebase/Auth/Storage and notification binding must remain Sandbox-only.

### Task 1: Wire existing presentation to authenticated App

**Files:** `src/App.jsx`, `src/components/v2/*`, existing pilot wrappers and their tests.
**Interfaces:** Existing 55 JobDetail props; existing Dashboard/JobsPage props; existing navigation and account components.
- [x] Add failing authenticated-integration tests for build-time isolation, full module selection and preserved callbacks.
- [x] Selectively reuse prior App shell integration, add Sandbox-only wrappers and a single integrated comparison control.
- [x] Update structural preservation assertions to compare actual controller/callback contracts, not forbid approved presentation wiring.
- [x] Run focused and full unit tests; commit integration.

### Task 2: Verify browsers, builds and release isolation

**Files:** existing Playwright configurations; `scripts/prepareHosting.mjs` only if its allowlist lacks verified Vite chunks.
- [x] Run Chromium/WebKit, responsive and lifecycle regressions; inspect screenshots.
- [x] Run production/Sandbox builds, environment and Hosting guards; verify production exclusion.
- [x] Obtain independent UX/safety reviews and resolve only proven integration defects with regression tests.
- [x] Record current live/channel version markers, prepare committed Sandbox build, publish only a fresh preview and hash-verify all files.

### Task 3: Authenticated QA and handoff

**Files:** `docs/design-system-v2/AUTHENTICATED_REVIEW_*`, `docs/CURRENT_STATE.md`, external handoff ZIP.
- [x] Use existing authorized session if available; otherwise record one bounded human-smoke requirement without claiming acceptance.
- [x] Verify navigation, parity and environment read-only; preserve previous Hosting channels.
- [x] Document source, binding audit, tests, reviews, limitations, release URL/expiry and delete-only rollback; assemble sanitized ZIP.
