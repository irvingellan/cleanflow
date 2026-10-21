# CleanFlow Manager Interactions V3

Interaction specification for the Manager Workspace V3 prototype. Source of
truth for behaviour: `src/prototypes/manager-workspace-v3/model/selectors.js`
(what is true) and `model/store.js` (what changes). Everything in the prototype
is synthetic: nothing is sent, stored remotely or read from Firebase.

Labels: **Product today** (exists in CleanFlow), **UI only** (new presentation
of existing data/behaviour), **Proposal** (needs a new rule or new data before
it can ship).

## 1. Global

### 1.1 Header (all layouts)
- Wordmark, layout selector (Híbrido C+A · recomendado, A, B, C), Novo serviço, notifications bell with unread count, cleaner view, overflow menu (language, theme, reset demo).
- Second row: date control, Hybrid screen switch (Agora | Operação, desktop/tablet), demo indicator and demo clock.
- Switching layout changes only presentation. Data, selection, date range, filter and search are kept. Page scrolls to top.

### 1.2 Date range (UI only)
- Options: **Hoje**, **Amanhã**, **Semana** (Monday–Sunday in America/Los_Angeles), previous/next arrows, and a date picker for a specific day.
- Previous/next move by one day, or by one week when Semana is active. Landing on today or tomorrow by arrows re-selects that chip.
- Changing the range never clears search, filter or the selected service. If the selected service is outside the range, its detail stays open with the note "Este serviço está fora do período selecionado."
- Overdue services (open from earlier days) appear in the attention queue for any range that includes today.
- Day boundaries use Los Angeles calendar days (`laDateKey`), including across daylight-saving changes.

### 1.3 Demo honesty
- Every simulated side effect says so: toasts end with "nada foi enviado", tags read **Simulado**, **Proposta** or **Futuro · experimental**.
- No real message, push, email, assignment, upload or reservation is created.

## 2. Hybrid C+A

### 2.1 Agora (first screen)
1. Headline: "{n} precisam de você · {m} no prazo" (n = attention queue, including overdue).
2. Command field "O que você precisa fazer?" with shortcuts that carry counts (Atribuir, Revisar checklists, Lembrar cleaners, Problemas, Novo serviço). `/` focuses it.
3. **Comece por**: the highest-ranked attention item, its reason, its primary action, and a link into Operação.
4. **Precisa de você**: the rest of the queue, ranked, each with a single action button. Only exceptions; on-track work is summarised, not listed.
5. Side column: six daily questions (sem cleaner, respostas, sem confirmação, checklists, prontos para concluir, problemas), then a day card for the range day and the next day (status bar with text legend plus up to four exception rows), or a week strip when Semana is active. A "Futuro · experimental" reservation card closes the column.
- Typing replaces items 3–5 with results: "Entendido como" chips, the best match with its recommended action, and other matches.

### 2.2 Operação (second screen)
- Desktop ≥1320: list | detail | next-action rail. 1100–1319: list | detail with next step inside. 720–1099: list | detail. Below 720: list only; detail opens full screen.
- List: filter chips with counts (Precisam de você, Todos, Sem cleaner, Respostas, Sem confirmação, Checklists, Em andamento, Concluídos), search, day headers with counts, dense rows.
- Row: time (or "Horário não definido"), property, area and type, cleaner(s) or "Sem cleaner", status pill (wide only), one attention label or the compact lifecycle.

### 2.3 Transition rules
- Selecting anything in Agora selects that service and opens Operação with the "Precisam de você" filter (desktop/tablet). On phones the detail opens over Agora so Back returns to Agora.
- "Voltar para Agora" keeps the range and selection.
- Day card "Ver o dia na Operação" sets the range to that day and the filter to Todos.

## 3. Layouts A, B and C
- **A** — the Operação screen as the whole product, headline above the list.
- **B** — grouped attention (Problemas e atrasos, Sem cleaner, Respostas para decidir, Confirmações e lembretes, Checklists, Links) each with "Começar por {property}"; a timeline table ("Só exceções" or "Mostrar todos"); cleaners working in range. Daily questions filter the timeline in place. Detail opens in a drawer.
- **C** — command field and the single most urgent service with its recommended action; the full picture is a closed disclosure; daily questions become typed intents.

## 4. Service detail (shared by every layout)
- Header: when, type, property, area, client, guest out / next in.
- Status pill (plain language), five-stage rail (skipped stage drawn dashed).
- **Próximo passo**: attention label, one sentence of why, one primary action, other valid actions.
- Blocks: Cleaner (people, confirmation, offers and replies, "registrado por mensagem"), Checklist (state, items, photos, link state, version), Pagamento (fixed/hourly, source of the amount), Propriedade e acesso (instructions, masked access), Problemas (resolve), Atividade.
- Primary-action derivation (`nextActionFor`): first attention item's action; else ready-to-complete → Concluir; in progress → Ver progresso; assigned → Preparar mensagem; completed → Ver checklist final.

## 5. Flows

### 5.1 Assign (Product today: direct assignment; UI only)
1. "Atribuir cleaner" opens a drawer: offer replies first (interested cleaners on top), then all cleaners with "Livre neste dia" or their other jobs that day.
2. For an offer without a reply: "{name} disse que tem interesse" records a reply received by text (**Proposal**: needs a stored `via` on the response).
3. Consequence block: will make her responsible; will not send a message; will not confirm attendance for her.
4. Confirm → status "Atribuída — cleaner ainda não avisada" → the reminder sheet opens next.
- Interest never assigns. Assignment is always a separate manager action.

### 5.2 Send offer (UI only; pricing rules unchanged)
1. Choose cleaners (each shows language and load; already-offered marked).
2. Pay: the property's agreed amount is pre-filled and labelled "não muda nenhum acordo". "Usar outro valor só nesta oferta" requires a reason and shows the difference. No agreed amount → amount required.
3. Message: style A "Detalhes primeiro" or B "Ação em destaque"; preview per selected cleaner in her own language; the link is created with the offer.
4. Consequences: records the offer and one link per cleaner; does not assign; does not send WhatsApp/SMS.
5. Result: per-cleaner link, "Copiar mensagem", "Ver a oferta como {name}".

### 5.3 Cleaner offer page (UI only)
- Message screen → link → offer page: type and area as title, Quando (date, time, duration), Onde (area only; "endereço completo e acesso só se você for confirmada"), Você recebe (large amount, fixed or hourly estimate), O que esperar (checklist size with photos, next guest time, linen on site), "Tocar em Tenho interesse ainda não confirma o serviço".
- Sticky actions: **Tenho interesse** (56 px) and **Não posso**.
- After interest: "Interesse enviado", "A gerente já vê sua resposta. Ainda não é uma confirmação.", three next steps, "Mudei de ideia, não posso".
- Manager side: notification, offer reply, attention "Cleaner interessada", primary action "Ver respostas e atribuir".
- Never shows a full address, access code or other cleaners' replies.

### 5.4 Reminder (UI only)
- Message in the cleaner's language; access and checklist "no seu link protegido"; never a code in the text.
- "Copiar e marcar como enviado (simulado)" → confirmation "aguardando"; "Simular: cleaner confirmou" for demos.

### 5.5 Checklist review (Product today: read; approval is a Proposal)
- Status, sender and time, template version, "A cleaner declarou que terminou a limpeza no local", notes, missing evidence banner with the cleaner's explanation, sections with items and photo strips.
- Without gaps: **Aprovar checklist** / Pedir correção. With gaps: **Pedir correção à cleaner** / Aprovar mesmo com pendência.
- Approval sets "Checklist revisado — pronto para concluir". It does not complete the service. Then **Concluir serviço**.
- **Proposal**: today no approval is stored; this needs a new state and audit record.

### 5.6 Complete (Product today)
- Confirmation sheet: will mark completed now; will not resolve open issues; will not send a client report. Warns if the checklist was not reviewed. Safe button focused first.

### 5.7 Cleaner checklist (UI only, built on existing draft/submit)
- States are never merged: **Rascunho — ainda não enviado** (with "Salvo automaticamente às …"), **Enviado para revisão às …**, **Revisado pela gerente**, **A gerente pediu uma correção**.
- List: access card, instructions, progress, sections with done/total and "Foto obrigatória".
- Section: checkboxes; photo items with **Tirar foto** and **Escolher várias da galeria**; per-photo progress, failure, **Tentar de novo**.
- Sticky **Revisar e enviar · N pendências** on every draft screen.
- Review step: missing list with "Ir", required explanation if anything is missing, notes, required "Confirmo que terminei a limpeza no local", then **Enviar checklist para revisão**. The button is locked with the reason while photos upload or failed, while an explanation is missing, or while the confirmation is unticked.
- Success: "Checklist enviado", time, items and photos, "pode fechar esta página", **Adicionar foto complementar** (added as extra; nothing replaced or deleted).

### 5.8 Property and checklist template (Proposal for versioning)
- Instructions; access code masked with "Mostrar código" for the manager and the proposed release rule; template editor (rename, add, remove, reorder sections and items, "Exige foto").
- "Salvar como versão N+1". Submitted checklists keep their version. Applies to services not started.

### 5.9 New service (Proposal for types/hourly)
- Client → property, type (Turnover Airbnb, Limpeza, Touch-up, Outro + name), date, time or "Horário ainda não definido", pay (fixed pre-filled from the property, or hourly with rate, hours and estimate), checklist from the property with version, and what to do next (Enviar oferta, Atribuir agora, Deixar sem cleaner).
- Creating selects the service, moves the range to its date and opens the chosen next step.

### 5.10 Notification inbox (Proposal: stored notification history)
- Filters: Todas, Não lidas, Ofertas, Checklists, Problemas; "Marcar todas como lidas".
- Item: type icon, title, time, delivery facts, related service with **Abrir serviço** (marks read, selects the service).
- Delivery facts never overclaim: accepted by the push service; displayed confirmed / not confirmed / shown as "New Notification" without content; opened at time. A tapped-but-unread item says so and stays unread.
- Device diagnostics block: each device, last known test result, "causa ainda não confirmada", simulated test button.
- Demo states: normal, loading (skeleton), error (retry, "nada foi alterado"), empty.

## 6. Mobile
- Bottom tabs: Agora (or Início), Serviços, Avisos, Cleaner. 4 tabs, 54 px targets, unread badge.
- Detail is full screen with Back and a sticky primary action that respects the safe area.
- Drawers become bottom sheets up to 94 % height; footers stack buttons full width.
- Date chips fit one row at 390 px; the date picker is an icon-sized native control.
- No horizontal page scroll at 390, 768 or 1440 (checked automatically).

## 7. Loading, errors and async feedback
- Every action gives a toast that states what happened and that nothing real was sent.
- Photo uploads show progress, failure and retry per photo; submission waits for uploads.
- Inbox demo states cover loading, error with retry and empty.
- Production versions must follow Design System V2 states: layout reserved on first load, data kept on refresh, stale indicator on failed refresh.

## 8. Accessibility
- All actions are real buttons; overlays are labelled dialogs with focus trap, Escape and focus return.
- 44 px minimum targets; 3 px focus ring; state always icon + text (no colour-only dots).
- Lifecycle rail is an ordered list with `aria-current`; status bar charts have a text legend and a full `aria-label`.
- `/` shortcut ignored while typing; reduced motion removes transitions.
