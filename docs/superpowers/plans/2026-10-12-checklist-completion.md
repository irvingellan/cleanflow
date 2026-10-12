# Cleaner checklist completion implementation plan

Goal: distinguish saved draft, incomplete, ready, sending and server-confirmed submission in the existing public page.

Architecture: extend presentation only; keep draft/capability/evidence services unchanged. Reuse missing-items calculation, translations, CSS and Playwright (EXTEND; no new library).

Constraints: no backend/security/domain changes; no Production/customer reads, merge, push or deploy; RC V2 untouched.

1. Add failing component regressions for saved-but-incomplete and ready-after-confirmed-evidence.
2. Add compact completion guidance and a jump link to the existing mobile handoff (no overlay); keep server confirmation authoritative.
3. Create local CURRENT/improved comparison using real pages/hooks with synthetic adapter, never Firebase. Cover EN/PT, desktop/mobile, failed response, refresh, duplicate send and keyboard.
4. Run focused/full units, browser regressions, Production build and diff check; inspect screenshots and package ZIP/inventory/operator guide.

Review focus: selected photo is not evidence; readiness is guidance not authorization; draft is not submitted; uncertain retry keeps request identity; no manager completion controls.
