# Manager low-interruption — UI contract

Component: `hub/AwayCenter.jsx` (`awayItems(data)` pure selector + `AwayCenter` overlay). Header button "Ao voltar".

## Sections (order = priority)

1. Digest tiles: your decisions · questions the schedule answered (simulated estimate) · alert/device problems · checklists to review.
2. **Precisa de você** (short list): swap requests needing approval, cleaner interest on offers (interest ≠ assignment), today's jobs without cleaner.
3. Client requests — received, **not committed** ("Nada foi confirmado ao cliente"). Actions: Criar serviço / Agora não.
4. Checklists to review.
5. Alerts and devices: own devices not ready (with reason), deliveries rejected or generic, cleaner events with no target device.
6. Answered without you (routine self-service counter — label as estimate).
7. Open offers.

## Rules

- No automatic approval, assignment, payment change, client confirmation or message. Approve/decline records a
  decision only (toast: "Ninguém foi avisado automaticamente").
- Other managers' devices are not listed as hers to fix.
- Cleaner names appear only to the manager.

## Data Codex supplies

```ts
interface ManagerRequest { id: string; kind: "swap" | "client" | "availability"; from?: string; client?: string; jobId?: string | null; property?: string; at: LocalStamp; status: "open" | "approved" | "declined" }
interface RoutineStats { scheduleViews: number; questionsAnswered: number; since: LocalStamp; estimated: true }
```
Plus existing jobs/offers/checklists, inbox delivery outcomes and `DeviceEvidence[]`.

## Not built (parked)

WhatsApp intake, AI replies, automatic routing, Notion/Guesty/Hospitable APIs.
