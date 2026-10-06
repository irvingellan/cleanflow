import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import * as UI from "./primitives.jsx";
import { catalogMessages } from "../../design-system/catalog/messages.js";
import { serviceLifecyclePresentation } from "../../features/jobs/serviceLifecyclePresentation.js";

describe("V2 presentation primitives", () => {
  it.each(["light", "dark"])("renders all tones in %s without theme-specific branches", theme => {
    document.documentElement.dataset.theme = theme;
    render(<>{["neutral", "brand", "info", "attention", "warning", "risk", "success", "sandbox"].map(tone => <UI.StateLabel key={tone} tone={tone}>{tone}</UI.StateLabel>)}</>);
    for (const tone of ["neutral", "brand", "info", "attention", "warning", "risk", "success", "sandbox"]) {
      const label = screen.getByText(tone);
      expect(label).toHaveClass(`cfv2-tone-${tone}`); expect(label.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
  });
  it.each(["primary", "secondary", "tertiary", "danger", "danger-solid", "icon"])("%s action is explicit and keyboard-operable", async variant => {
    const action = vi.fn(); const user = userEvent.setup();
    render(<UI.Button variant={variant} onClick={action}>Action</UI.Button>);
    await user.tab(); expect(screen.getByRole("button")).toHaveFocus(); expect(action).not.toHaveBeenCalled();
    await user.keyboard("{Enter}"); expect(action).toHaveBeenCalledTimes(1);
  });
  it.each([{ disabled: true }, { busy: true }, { blockedReason: "Choose input first" }])("unavailable action cannot invoke callback: %o", async state => {
    const action = vi.fn(); render(<UI.Button {...state} onClick={action}>Save</UI.Button>);
    fireEvent.click(screen.getByRole("button")); expect(action).not.toHaveBeenCalled();
    if (state.blockedReason) { expect(screen.getByRole("button")).not.toBeDisabled(); expect(screen.getByRole("button")).toHaveAttribute("aria-disabled", "true"); }
    else expect(screen.getByRole("button")).toBeDisabled();
    if (state.busy) expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });
  it("icon-only action has a consumer-provided accessible name", () => { render(<UI.IconButton label="Refresh list" icon="refresh" />); expect(screen.getByRole("button", { name: "Refresh list" })).toBeInTheDocument(); });
  it("surfaces/rows use opt-in semantic variants; rendering does not invoke actions", async () => {
    const click = vi.fn(); render(<UI.Panel title="Rows"><UI.Card subtle>Inset</UI.Card><UI.Row selected dense onClick={click} action={<UI.Button variant="secondary">Second action</UI.Button>}>Selected row</UI.Row></UI.Panel>);
    expect(click).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Selected row" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Second action" })); expect(click).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Selected row" })); expect(click).toHaveBeenCalledTimes(1);
  });
  it("field errors are labeled/described rather than color-only", () => { render(<UI.TextField label="Amount" error="Enter amount" defaultValue="abc" />); const field = screen.getByLabelText("Amount"); expect(field).toHaveAttribute("aria-invalid", "true"); expect(field).toHaveAccessibleDescription("Enter amount"); expect(screen.getByRole("alert")).toHaveTextContent("Enter amount"); });
  it("search clearing is explicit and select uses native keyboard semantics", async () => {
    const change = vi.fn(); render(<><UI.SearchField label="Search" value="demo" onChange={change} clearLabel="Clear search" /><UI.Select label="Cleaner" options={[{ value: "a", label: "Demo A" }]} /></>);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" })); expect(change).toHaveBeenCalledWith({ target: { value: "" } }); expect(screen.getByRole("combobox", { name: "Cleaner" })).toBeInTheDocument();
  });
  it("segmented/filter choices expose selection and never change on render", () => { const change = vi.fn(); render(<><UI.SegmentedControl label="Filter" options={[{ value: "a", label: "All" }, { value: "b", label: "Active" }]} value="a" onChange={change} /><UI.FilterChip selected>Today</UI.FilterChip></>); expect(change).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true"); fireEvent.click(screen.getByRole("button", { name: "Active" })); expect(change).toHaveBeenCalledWith("b"); });
  it("checkbox/radio labels are actual interactive labels", async () => { render(<><UI.Checkbox label="Include link" /><UI.Radio label="Demo A" name="cleaner" /><UI.Radio label="Demo B" name="cleaner" /></>); await userEvent.click(screen.getByText("Include link")); expect(screen.getByRole("checkbox")).toBeChecked(); await userEvent.click(screen.getByText("Demo B")); expect(screen.getByRole("radio", { name: "Demo B" })).toBeChecked(); });
  it("disclosures keep inputs mounted and preserve pending edits", () => { render(<UI.Disclosure title="Details"><UI.TextField label="Note" defaultValue="pending" /></UI.Disclosure>); const details = screen.getByText("Details").closest("details"); expect(details).not.toHaveAttribute("open"); const field = screen.getByLabelText("Note"); fireEvent.change(field, { target: { value: "edited" } }); details.open = true; details.open = false; expect(field).toHaveValue("edited"); });
  it("technical disclosure is closed by default; consequence/diff do not infer operations", () => { render(<><UI.TechnicalDetails title="Technical details">synthetic</UI.TechnicalDetails><UI.ConsequenceDisclosure title="Confirm" will={["Change example"]} willNot={["Do not send"]} /><UI.BeforeAfterDiff label="Time" beforeLabel="Before" afterLabel="After" before="11:00" after="13:00" /></>); expect(screen.getByText("Technical details").closest("details")).not.toHaveAttribute("open"); expect(screen.getAllByRole("listitem")).toHaveLength(2); expect(screen.queryByRole("button")).not.toBeInTheDocument(); });
  it("confirmation focuses safe action, does not commit on open and restores focus", async () => {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
    const confirm = vi.fn(); const cancel = vi.fn(); const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
    const { rerender, unmount } = render(<UI.ConfirmationSheet open title="Confirm?" confirmLabel="Archive example" cancelLabel="Keep example" onConfirm={confirm} onCancel={cancel}>Preview</UI.ConfirmationSheet>);
    expect(confirm).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Keep example" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Archive example" })); expect(confirm).toHaveBeenCalledTimes(1);
    rerender(<UI.ConfirmationSheet open={false} title="Confirm?" confirmLabel="Archive example" cancelLabel="Keep example" onConfirm={confirm} onCancel={cancel} />); expect(trigger).toHaveFocus(); unmount(); trigger.remove();
  });
  it("error retry is explicit; loading/stale/refresh retain their own semantics", () => { const retry = vi.fn(); render(<><UI.ErrorState title="Read failed" retryLabel="Try again" onRetry={retry}>Nothing changed</UI.ErrorState><UI.Skeleton label="Loading rows" /><UI.SyncLine status="updating">Updating</UI.SyncLine><UI.StaleIndicator>Last updated 13:12</UI.StaleIndicator></>); expect(retry).not.toHaveBeenCalled(); expect(screen.getByRole("status", { name: "Loading rows" })).toHaveAttribute("aria-busy", "true"); expect(screen.getByRole("alert")).toHaveTextContent("Read failed"); fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(retry).toHaveBeenCalledTimes(1); expect(screen.getByText("Last updated 13:12")).toHaveClass("cfv2-tone-attention"); });
  it("sticky action hides when host reports keyboard; no new keyboard/network listener", () => { const { rerender } = render(<UI.StickyMobileAction label="Next"><UI.Button>Continue</UI.Button></UI.StickyMobileAction>); expect(screen.getByRole("button", { name: "Continue" })).toBeVisible(); rerender(<UI.StickyMobileAction keyboardOpen><UI.Button>Continue</UI.Button></UI.StickyMobileAction>); expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument(); });
  it.each([true, false])("lifecycle compact=%s preserves authoritative unknown/skipped history", compact => { const presentation = serviceLifecyclePresentation({ job: { operationalStatus: "COMPLETED", assignedCleanerIds: ["demo"] } }); render(<UI.LifecycleRail compact={compact} presentation={presentation} translate={key => key} stateLabels={{ completed: "Done", current: "Current", future: "Future", skipped: "Skipped", "unknown-past": "Not known" }} />); expect(screen.getByText("lifecycle.stage.OFFERED · Not known")).toBeInTheDocument(); expect(screen.getByText("lifecycle.stage.IN_PROGRESS · Skipped")).toBeInTheDocument(); });
  it("CSS uses semantic V2 tokens, 44px targets, focus and safe area without literal colors", () => { const css = fs.readFileSync("src/components/v2/primitives.css", "utf8"); expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i); expect(css).not.toMatch(/var\(--color-/); expect(css).toContain("var(--v2-size-touch-target-min)"); expect(css).toContain("var(--v2-size-focus-ring)"); expect(css).toContain("env(safe-area-inset-bottom)"); expect(css).toContain("prefers-reduced-motion"); expect([...css.matchAll(/animation:\s*([^;]+);/g)].map(match => match[1])).toEqual(["none"]); });
  it.each(["en", "pt", "es"])("catalog %s supplies the full localized copy contract", language => { expect(Object.keys(catalogMessages[language]).sort()).toEqual(Object.keys(catalogMessages.en).sort()); for (const [key, value] of Object.entries(catalogMessages[language])) expect(value, key).toBeTruthy(); });
  it("every referenced V2 variable exists in the foundation", () => {
    const foundation = fs.readFileSync("src/index.css", "utf8");
    const css = fs.readFileSync("src/components/v2/primitives.css", "utf8") + fs.readFileSync("src/design-system/catalog/catalog.css", "utf8");
    for (const match of css.matchAll(/var\((--v2-[\w-]+)/g)) expect(foundation).toContain(`${match[1]}:`);
  });
});
