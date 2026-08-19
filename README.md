# CleanFlow

CleanFlow is an early-stage realtime operations platform for cleaning teams and short-term-rental turnover operations.

The project began while studying the real workflow of a small but growing cleaning operation whose manager was handling scheduling, cleaner coordination, property instructions, checklists, financial tracking and communication largely through WhatsApp and a large Notion database.

The initial objective is to understand and improve that real workflow before attempting to generalize CleanFlow into a broader product.

## Current status

CleanFlow is currently in:

- product discovery
- workflow observation
- rapid prototyping
- early architecture design

A visual mobile prototype and a Firebase realtime experiment have already been used to explore concepts, but they are not considered production architecture.

## Primary product hypothesis

A manager should be able to operate a cleaning business from a central dashboard while cleaners interact through a very simple mobile experience.

Potential flow:

Reservation / manual job
→ job
→ cleaner availability
→ manager assignment
→ instructions and reminders
→ cleaning execution
→ checklist / photos / issues
→ completion
→ financial follow-up

## Design partner

The first design partner currently manages multiple clients, properties and approximately ten cleaners.

Current tools/processes include combinations of:

- WhatsApp
- Notion
- Hospitable
- Guesty
- previously Turno
- Zelle
- Relay
- Airbnb-related payment flows

Different clients currently use different processes.

## Repository documentation

See:

- `docs/PRODUCT.md`
- `docs/DATA_MODEL.md`
- `docs/WORKFLOWS.md`
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`

Agent and coding instructions live in:

- `AGENTS.md`

## Important

This project is intentionally using fictitious development data until security, permissions and production architecture are ready for real operational information.
