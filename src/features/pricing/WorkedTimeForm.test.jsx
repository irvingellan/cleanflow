import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkedTimeForm } from "./WorkedTimeForm.jsx";

describe("worked time form", () => {
  it("shows a failed report, then displays the rounded result after a retry", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ minutes: 120 });
    render(<WorkedTimeForm language="en" work={{}} touchUp onSave={save} />);
    expect(screen.getByRole("spinbutton")).toHaveValue(120);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "118" } });
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save hours");
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
    expect(await screen.findByText("Waiting for approval · 120 min")).toBeVisible();
    expect(save).toHaveBeenLastCalledWith(118);
  });

  it("renders approved zero as a recorded result and disables editing", () => {
    render(<WorkedTimeForm language="en" work={{ approvedMinutes: 0, payoutCents: 0 }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Approved · 0 min · $0.00");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
