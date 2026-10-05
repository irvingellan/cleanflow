import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReservationReviewPanel } from "./ReservationReviewPanel.jsx";
import { reviewMessages } from "./reservationReviewMessages.js";
const row = { id: "synthetic", observedAt: "2026-10-05" };
const properties = [{ id: "house", name: "Demo house", active: true }, { id: "inactive", name: "Inactive", active: false }];
describe("explicit human review UI", () => {
  it("render/select do not write; property save precedes confirmation and promotion", async () => {
    const review = vi.fn().mockResolvedValueOnce({ state: "NEW", revision: 0 }).mockResolvedValueOnce({ state: "NEEDS_REVIEW", revision: 1, propertyId: "house" })
      .mockResolvedValueOnce({ state: "PROMOTED", revision: 2, propertyId: "house", reservationId: "saved" });
    render(<ReservationReviewPanel row={row} properties={properties} language="en" review={review} />);
    expect(review).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Read saved review" }));
    await screen.findByText("New");
    expect(screen.queryByRole("option", { name: "Inactive" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "house" } });
    expect(review).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Save Property selection" }));
    await screen.findByRole("checkbox");
    expect(screen.getByRole("button", { name: "Promote to Reservation" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Promote to Reservation" }));
    await screen.findByText("Promoted to Reservation");
    expect(review).toHaveBeenLastCalledWith(row, "PROMOTE", { expectedRevision: 1, confirmed: true });
    expect(screen.queryByRole("button", { name: "Promote to Reservation" })).toBeNull();
  });
  it("server errors stay recoverable, never show successful promotion", async () => {
    const review = vi.fn().mockRejectedValue(new Error("Functions unavailable"));
    render(<ReservationReviewPanel row={row} language="en" review={review} />);
    fireEvent.click(screen.getByRole("button", { name: "Read saved review" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Promoted to Reservation")).toBeNull();
    expect(screen.getByRole("button", { name: "Read saved review" })).toBeEnabled();
  });
  it("ambiguous mappings never preselect a Property and promoted discrepancies offer no mutation", async () => {
    const review = vi.fn().mockResolvedValueOnce({ state: "NEW", revision: 0 }).mockResolvedValueOnce({ state: "PROMOTED", revision: 2,
      discrepancy: { reviewRequired: true, signal: "POSSIBLE_CANCELLED", changes: { checkOut: { before: "2026-10-12", after: "2026-10-13" } } } });
    render(<ReservationReviewPanel row={{ ...row, propertyMappingState: "AMBIGUOUS" }} properties={properties} language="en" review={review} />);
    fireEvent.click(screen.getByRole("button", { name: "Read saved review" }));
    await screen.findByRole("combobox");
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save Property selection" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Read saved review" }));
    await screen.findByText("External change requires review. Saved Reservation has not been changed.");
    expect(screen.getByText("checkOut: 2026-10-12 → 2026-10-13")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Promote to Reservation" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ignore candidate" })).toBeNull();
  });
  it("late response from a different candidate cannot overwrite current selection", async () => {
    let resolve; const review = vi.fn(() => new Promise(r => { resolve = r; }));
    const view = render(<ReservationReviewPanel row={row} language="en" review={review} />);
    fireEvent.click(screen.getByRole("button", { name: "Read saved review" }));
    view.rerender(<ReservationReviewPanel row={{ ...row, id: "different" }} language="en" review={review} />);
    resolve({ state: "PROMOTED", revision: 2 });
    await waitFor(() => expect(screen.queryByText("Promoted to Reservation")).toBeNull());
  });
  it.each(["en", "pt", "es"])("%s has complete localized review copy", language => {
    expect(Object.keys(reviewMessages[language]).sort()).toEqual(Object.keys(reviewMessages.en).sort());
    render(<ReservationReviewPanel row={row} language={language} />);
    expect(screen.getByText(reviewMessages[language].boundary)).toBeVisible();
  });
});
