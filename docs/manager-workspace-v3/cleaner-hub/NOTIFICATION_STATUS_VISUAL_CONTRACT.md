# Notification status — visual contract

Issue #85. Types: `contracts/DEVICE_HEALTH_UI_PROPS.ts`, `contracts/NOTIFICATION_INBOX_UI_PROPS.ts`.
Logic: `hub/hubModel.js` `deviceReadiness` (pure, tested). Components: `hub/DeviceHealth.jsx`.

## The seven user-facing states

| State | Label (PT) | When (first match wins) | One action |
|---|---|---|---|
| checking | Verificando… | a check is running | — |
| unsupported | Este aparelho não recebe avisos | platform can't push (iOS < 16.4, browser without push) | Ver tudo em Avisos |
| install | Ação necessária — instalar o app | iPhone and this window is a Safari tab | Ver como colocar na tela inicial |
| enable | Ação necessária — ativar avisos | permission `denied` (→ unblock) or `default` (→ allow) | Permitir avisos / Já liberei — verificar |
| reconnect | Ação necessária — reconectar o aparelho | registration none/error/stale, app outdated, or last test failed | Reconectar / Atualizar o app |
| unknown | Desconhecido — não conseguimos confirmar | permission/registration unknown; registered but never tested; provider accepted but display unconfirmed | Enviar aviso de teste / Verificar |
| ready | Pronto — este aparelho | registration active AND last test confirmed | Enviar aviso de teste (secondary) |

**Never green without a confirmed test.** "Device registered" alone = unknown.
**Provider accepted ≠ displayed.** A confirmed test needs a device receipt or the person answering "Sim, apareceu".
A Safari tab cannot tell whether the icon exists elsewhere — the evidence list says so (`installElsewhere: unknown`).

## Evidence list ("O que conseguimos verificar")

Rows: how this window was opened · Home Screen icon (tab only: "can't tell") · permission · server
registration (text adds "doesn't guarantee delivery") · app version · last test · last confirmed alert.
✓ = verified now; ⓘ = cannot be verified from here. No tokens, endpoints or internal ids — ever.

## Recovery ("Os avisos pararam de chegar?")

intro → checking (shimmer, `role=status`) → result. Result text depends on the first reason; certain causes
show one action; uncertain ones also offer "Mandar o diagnóstico para a gerente" (support code, no personal
data). The flow never says "fixed": only a confirmed test turns the state to ready. Stale registration is
explained as a common cause when alerts work for days and then stop (the reported manager symptom) — as a
possibility, not a diagnosis.

## Device list

Manager: own devices with last used, last confirmed alert and the first reason; other managers' devices show
only label + state (no details, no buttons). Cleaner: own devices only. Selecting a manager device shows its
readiness card (scenario J: why it isn't ready).

## Inbox and transport

Each entry is the business event; delivery is a separate timeline (created, targeted, provider accepted,
displayed — only if confirmed —, opened — only if tracked). When a cleaner has no ready device the event is
still stored with `targets: 0`. Cleaner inbox filters: Todas / Não lidas. Opening from a push records the
open but keeps it unread.

## Backend needed (Codex)

`getCurrentDeviceEvidence`, `listDevices`, `requestPermission` (user gesture), `reconnect` (adds/refreshes,
never replaces another device), `sendTest` (this device only), `recordTestOutcome`, `diagnosticsCode`;
durable inbox with `markRead/markUnread/recordOpenedFromPush/subscribe`. Staleness: last successful send per
registration + expiry/rotation detection. Service-worker version reporting.
