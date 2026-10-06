import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReservationReviewPanel } from "./ReservationReviewPanel.jsx";
import { reviewMessages } from "./reservationReviewMessages.js";
import { designMessages } from "./reservationDesignMessages.js";
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
    expect(screen.queryByRole("radio", { name: "Inactive" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Demo house" }));
    expect(review).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Save Property selection" }));
    const first = await screen.findByRole("button", { name: designMessages.en.approve });
    fireEvent.click(first);
    expect(review).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("dialog")).toHaveTextContent("Does NOT create");
    fireEvent.click(screen.getByRole("button", { name: designMessages.en.final }));
    await screen.findByText("Promoted to Reservation", { selector: ".intake-state" });
    expect(review).toHaveBeenLastCalledWith(row, "PROMOTE", { expectedRevision: 1, confirmed: true });
    expect(screen.queryByRole("button", { name: designMessages.en.approve })).toBeNull();
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
    await screen.findByRole("radio", { name: "Demo house" });
    expect(screen.getByRole("radio", { name: "Demo house" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save Property selection" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Read saved review" }));
    await screen.findByText("External change requires review. Saved Reservation has not been changed.");
    expect(screen.getByText("Check-out: Oct 12, 2026 → Oct 13, 2026")).toBeVisible();
    expect(screen.queryByRole("button", { name: designMessages.en.approve })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ignore", exact: true })).toBeNull();
  });
  it("late response from a different candidate cannot overwrite current selection", async () => {
    let resolve; const review = vi.fn(() => new Promise(r => { resolve = r; }));
    const view = render(<ReservationReviewPanel row={row} language="en" review={review} />);
    fireEvent.click(screen.getByRole("button", { name: "Read saved review" }));
    view.rerender(<ReservationReviewPanel row={{ ...row, id: "different" }} language="en" review={review} />);
    resolve({ state: "PROMOTED", revision: 2 });
    await waitFor(() => expect(screen.queryByText("Promoted to Reservation")).toBeNull());
  });
  it("ignore needs a second explicit decision; cancel never calls the server", async () => {
    const review = vi.fn().mockResolvedValueOnce({ state: "NEW", revision: 0 }).mockResolvedValueOnce({ state: "IGNORED", revision: 1 });
    render(<ReservationReviewPanel row={row} language="en" review={review} />);
    fireEvent.click(screen.getByRole("button", { name: "Read saved review" })); await screen.findByText("New");
    fireEvent.click(screen.getByRole("button", { name: "Ignore", exact: true }));
    expect(review).toHaveBeenCalledTimes(1); expect(screen.getByRole("alertdialog")).toHaveTextContent("No undo");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ignore", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm ignore" })); await screen.findByText("Ignored", { selector: ".intake-state" });
    expect(review).toHaveBeenLastCalledWith(row, "IGNORE", { expectedRevision: 0 });
  });
  it.each(["en", "pt", "es"])("%s has complete localized review copy", language => {
    expect(Object.keys(reviewMessages[language]).sort()).toEqual(Object.keys(reviewMessages.en).sort());
    render(<ReservationReviewPanel row={row} language={language} />);
    expect(Object.keys(designMessages[language]).sort()).toEqual(Object.keys(designMessages.en).sort());
    expect(screen.getByText(designMessages[language].noJob)).toBeVisible();
  });
  it("first approval/back are presentation only and a pending confirmation is discarded on candidate change", async () => {
    const review = vi.fn().mockResolvedValue({ state: "NEEDS_REVIEW", revision: 3, propertyId: "house" });
    const view = render(<ReservationReviewPanel row={row} properties={properties} language="en" review={review} />);
    fireEvent.click(screen.getByRole("button", { name: designMessages.en.refresh }));
    fireEvent.click(await screen.findByRole("button", { name: designMessages.en.approve }));
    expect(review).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: designMessages.en.final })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: designMessages.en.back }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(review).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: designMessages.en.approve })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: designMessages.en.approve }));
    view.rerender(<ReservationReviewPanel row={{ ...row, id: "other" }} properties={properties} language="en" review={review} />);
    expect(screen.queryByRole("dialog")).toBeNull(); expect(review).toHaveBeenCalledTimes(1);
  });
  it("inactive saved Property and cancellation/conflict cannot open confirmation", async () => {
    const review = vi.fn().mockResolvedValue({ state: "NEEDS_REVIEW", revision: 1, propertyId: "inactive" });
    render(<ReservationReviewPanel row={{ ...row, changeType: "CONFLICT" }} properties={properties} language="en" review={review} />);
    fireEvent.click(screen.getByRole("button", { name: designMessages.en.refresh }));
    expect(await screen.findByRole("button", { name: designMessages.en.locked })).toBeDisabled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
