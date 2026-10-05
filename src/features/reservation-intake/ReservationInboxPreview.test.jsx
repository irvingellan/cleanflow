import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TranslationProvider } from "../../i18n/translations.js";
import { ReservationInboxPreview } from "./ReservationInboxPreview.jsx";
import { readLocalInbox, sanitizeInboxSnapshot } from "./reservationInboxService.js";
import { buildSyntheticReservationState } from "./syntheticReservationFixtures.js";
import { reservationIntakeMessages } from "./reservationIntakeMessages.js";
afterEach(() => localStorage.removeItem("cleanflow-language"));
describe("read-only Reservation Inbox", () => {
  it.each(["en", "pt", "es"])("%s displays source/date change/mapping/review without operational actions", async language => {
    localStorage.setItem("cleanflow-language", language);
    const t = reservationIntakeMessages[language], onBack = vi.fn();
    const { container } = render(<TranslationProvider><ReservationInboxPreview onBack={onBack} /></TranslationProvider>);
    await screen.findByText(t.DATES_CHANGED, { selector: "strong" });
    expect(screen.getByText(t.POSSIBLE_CANCELLED, { selector: "strong" })).toBeVisible(); expect(screen.getAllByText(t.unknownMapping).length).toBeGreaterThan(0);
    expect(container.querySelectorAll("article")).toHaveLength(5);
    const changed = [...container.querySelectorAll("article")].find(card => card.textContent.includes(t.DATES_CHANGED));
    expect(changed).toHaveTextContent("2026-10-12 → 2026-10-13");
    fireEvent.click(within(changed).getByRole("button", { name: t.details }));
    expect(within(changed).getByText(t.previous)).toBeVisible(); expect(within(changed).getByText("Demo Guest Alpha")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Create Job|Assign|Invoice|Send message|Criar serviço|Atribuir/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: language === "en" ? "Back" : language === "pt" ? "Voltar" : "Volver" }));
    expect(onBack).toHaveBeenCalledOnce(); expect(container.textContent).not.toContain("reservationIntake.");
  });
  it("local read is GET only, bounded, exact loopback and Production rejected", async () => {
    const state = await buildSyntheticReservationState(), fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: Object.values(state.candidates) })));
    const rows = await readLocalInbox({ port: 4789, pairingKey: "a".repeat(64), fetchImpl });
    expect(rows).toHaveLength(5); expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:4789/candidates", expect.objectContaining({ method: "GET", credentials: "omit", redirect: "error" }));
    await expect(readLocalInbox({ port: 4789, pairingKey: "a".repeat(64), projectId: "clean-flow-prototipo", fetchImpl })).rejects.toThrow("SHADOW_TARGET_DENIED");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("snapshot projection excludes arbitrary raw/private fields", async () => {
    const state = await buildSyntheticReservationState();
    const candidates = Object.values(state.candidates).map(row => ({ ...row, cookie: "secret", url: "secret", rawHtml: "secret" }));
    expect(JSON.stringify(sanitizeInboxSnapshot({ candidates }))).not.toContain("secret");
    expect(() => sanitizeInboxSnapshot({ candidates: [{ ...candidates[0], environment: "production" }] })).toThrow();
  });
  it("filtering is local, not an observation or operational mutation", async () => {
    const { container } = render(<TranslationProvider><ReservationInboxPreview onBack={vi.fn()} /></TranslationProvider>);
    await screen.findByText("Dates changed", { selector: "strong" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "DATES_CHANGED" } });
    await waitFor(() => expect(container.querySelectorAll("article")).toHaveLength(1));
  });
  it("translation catalogs contain identical keys", () => {
    expect(Object.keys(reservationIntakeMessages.pt).sort()).toEqual(Object.keys(reservationIntakeMessages.en).sort());
    expect(Object.keys(reservationIntakeMessages.es).sort()).toEqual(Object.keys(reservationIntakeMessages.en).sort());
  });
  it("a stalled response body reaches a recoverable deadline", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: () => new Promise(() => {}) });
    await expect(readLocalInbox({ port: 4789, pairingKey: "a".repeat(64), fetchImpl, timeoutMs: 10 })).rejects.toThrow("LOCAL_OBSERVER_TIMEOUT");
  });
});
