import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatWorkedMinutes, WorkedTimeForm } from "./WorkedTimeForm.jsx";

const field = name => screen.getByRole("spinbutton", { name });

describe("worked time form", () => {
  it("formats durations as hours and minutes", () => {
    expect(formatWorkedMinutes(0)).toBe("0 min");
    expect(formatWorkedMinutes(45)).toBe("45 min");
    expect(formatWorkedMinutes(120)).toBe("2 h");
    expect(formatWorkedMinutes(125)).toBe("2 h 05 min");
  });

  it("takes hours and minutes separately, shows a failure, then the rounded result after a retry", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ minutes: 120 });
    render(<WorkedTimeForm language="en" work={{}} touchUp onSave={save} />);
    expect(field("Hours")).toHaveValue(2);
    expect(field("Minutes")).toHaveValue(0);
    fireEvent.change(field("Hours"), { target: { value: "1" } });
    fireEvent.change(field("Minutes"), { target: { value: "58" } });
    expect(screen.getByText("Total: 1 h 58 min")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save hours");
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
    expect(await screen.findByText("Waiting for approval · 2 h")).toBeVisible();
    expect(save).toHaveBeenLastCalledWith(118);
  });

  it("does not let a cleaner save zero or more than 24 hours", () => {
    render(<WorkedTimeForm language="en" work={{}} onSave={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Save hours" });
    expect(button).toBeDisabled();
    fireEvent.change(field("Hours"), { target: { value: "0" } });
    fireEvent.change(field("Minutes"), { target: { value: "0" } });
    expect(button).toBeDisabled();
    fireEvent.change(field("Hours"), { target: { value: "25" } });
    expect(button).toBeDisabled();
    fireEvent.change(field("Hours"), { target: { value: "3" } });
    expect(button).toBeEnabled();
  });

  it("shows an approval to the cleaner without any way to change it", () => {
    render(<WorkedTimeForm language="en" work={{ approvedMinutes: 0, payoutCents: 0 }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Approved · 0 min · $0.00");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("lets the manager correct an unpaid approval, but not a paid one", async () => {
    const save = vi.fn().mockResolvedValue({ minutes: 130, payoutCents: 5200 });
    const { rerender } = render(<WorkedTimeForm manager language="en"
      work={{ reportedMinutes: 120, approvedMinutes: 120, payoutCents: 4800 }} onSave={save} />);
    expect(screen.getByRole("status")).toHaveTextContent("Approved · 2 h · $48.00");
    fireEvent.click(screen.getByRole("button", { name: "Correct hours" }));
    expect(field("Hours")).toHaveValue(2);
    fireEvent.change(field("Minutes"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve hours" }));
    expect(await screen.findByText("Approved · 2 h 10 min · $52.00")).toBeVisible();
    expect(save).toHaveBeenCalledWith(130);

    rerender(<WorkedTimeForm manager paid language="en"
      work={{ approvedMinutes: 120, payoutCents: 4800 }} onSave={save} />);
    expect(screen.queryByRole("button", { name: "Correct hours" })).not.toBeInTheDocument();
  });
});
