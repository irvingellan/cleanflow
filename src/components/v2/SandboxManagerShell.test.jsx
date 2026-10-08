import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { V2ManagerShell } from "./SandboxManagerShell.jsx";
import { shellComparisonHref, shellPilotEnabled, rememberShellPilot } from "./shellPilot.js";
import { shellText } from "./shellMessages.js";

const keys = ["dashboard", "jobs", "properties", "cleaners", "clients", "payouts", "dev-center"];
it("Production V2 shell never labels real operations as Sandbox test data", () => {
  render(<V2ManagerShell {...props({ environment: "production" })}>Real manager content</V2ManagerShell>);
  expect(screen.queryByText("SANDBOX · TEST DATA")).toBeNull();
  expect(screen.getByText("Real manager content")).toBeVisible();
});
function props(extra = {}) {
  return { language: "en", translate: key => key, activeSection: "dashboard", view: "dashboard", foundationClass: "foundation foundation--dashboard",
    destinations: keys.map((key, index) => ({ key, labelKey: key, icon: "home", group: index < 2 ? "daily" : index < 5 ? "directory" : index === 5 ? "money" : "internal", onClick: vi.fn() })),
    utilities: <><input aria-label="Pending utility input" defaultValue="pending" /><button>Notifications</button><button>Sign out</button></>, children: <h2>Existing content</h2>, ...extra };
}
describe("Sandbox shell boundary", () => {
  it.each(["production", "unknown", "development", "e2e"])("%s cannot opt in even with query/storage/allowlist", mode => {
    expect(shellPilotEnabled({ mode, authorized: true, search: "?shell=v2", storage: { getItem: () => "v2" } })).toBe(false);
  });
  it("Sandbox non-developer cannot opt in", () => expect(shellPilotEnabled({ mode: "sandbox", authorized: false, search: "?shell=v2" })).toBe(false));
  it("Sandbox developer comparison is explicit and session scoped", () => {
    const storage = { getItem: vi.fn(() => "v2"), setItem: vi.fn() };
    expect(shellPilotEnabled({ mode: "sandbox", authorized: true, storage })).toBe(true);
    expect(shellPilotEnabled({ mode: "sandbox", authorized: true, search: "?shell=current", storage })).toBe(false);
    rememberShellPilot("current", storage); expect(storage.setItem).toHaveBeenCalledWith("cleanflow-sandbox-shell-pilot", "current");
    expect(shellComparisonHref("?lang=pt", "v2")).toBe("?lang=pt&shell=v2");
  });
  it("blocked session storage fails closed without breaking explicit opt-in", () => {
    const storage = { getItem: () => { throw Error("denied"); }, setItem: () => { throw Error("denied"); } };
    expect(shellPilotEnabled({ mode: "sandbox", authorized: true, storage })).toBe(false);
    expect(shellPilotEnabled({ mode: "sandbox", authorized: true, storage, search: "?shell=v2" })).toBe(true);
    expect(() => rememberShellPilot("current", storage)).not.toThrow();
  });
});
describe("V2 manager presentation", () => {
  it("detail More preserves all primary navigation without invoking callbacks on open", () => {
    const input = props({ view: "job-detail" });
    render(<V2ManagerShell {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const dialog = screen.getByRole("dialog");
    for (const name of ["dashboard", "Services", "properties"]) expect(within(dialog).getByRole("button", { name })).toBeVisible();
    expect(input.destinations.every(item => item.onClick.mock.calls.length === 0)).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Services" }));
    expect(input.destinations.find(item => item.key === "jobs").onClick).toHaveBeenCalledOnce();
  });
  it.each(keys)("%s remains reachable via the supplied existing callback", key => {
    const input = props(); render(<V2ManagerShell {...input} />);
    expect(input.destinations.every(item => item.onClick.mock.calls.length === 0)).toBe(true);
    const sidebar = screen.getByRole("complementary");
    fireEvent.click(within(sidebar).getByRole("button", { name: key === "jobs" ? "Services" : key }));
    expect(input.destinations.find(item => item.key === key).onClick).toHaveBeenCalledOnce();
    expect(screen.getByText("Existing content")).toBeInTheDocument();
  });
  it("unauthorized internals are not invented by the shell", () => {
    render(<V2ManagerShell {...props({ destinations: props().destinations.filter(item => item.group !== "internal") })} />);
    expect(screen.queryByRole("button", { name: "dev-center" })).not.toBeInTheDocument();
    expect(screen.queryByText("Internal tools")).not.toBeInTheDocument();
  });
  it("account utilities stay mounted across open/close and keep pending values", () => {
    render(<V2ManagerShell {...props()} />);
    const input = screen.getByLabelText("Pending utility input");
    fireEvent.change(input, { target: { value: "edited" } });
    fireEvent.click(screen.getByRole("button", { name: "Account & settings" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Pending utility input")).toBe(input); expect(input).toHaveValue("edited");
  });
  it("view change closes overlay without changing existing content/handlers", () => {
    const input = props(); const { rerender } = render(<V2ManagerShell {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Account & settings" }));
    rerender(<V2ManagerShell {...input} view="job-detail" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector(".cfv2-shell-tabs")).toBeNull();
    expect(input.destinations.every(item => item.onClick.mock.calls.length === 0)).toBe(true);
  });
  it("active section is semantic, including diagnostics deep-link", () => {
    const input = props({ view: "load-time-diagnostics", activeSection: "dev-center" });
    input.destinations.push({ key: "diagnostics", labelKey: "Diagnostics", group: "internal", href: "/diagnostics/load-times", icon: "clock" });
    render(<V2ManagerShell {...input} />);
    expect(screen.getByRole("link", { name: "Diagnostics" })).toHaveAttribute("href", "/diagnostics/load-times");
    expect(screen.getByRole("link", { name: "Diagnostics" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "dev-center" })).not.toHaveAttribute("aria-current");
  });
  it.each(["en", "pt", "es"])("%s shell labels are localized", language => {
    render(<V2ManagerShell {...props({ language })} />);
    expect(screen.getByRole("button", { name: shellText(language, "account") })).toBeInTheDocument();
    expect(shellText(language, "services")).toBeTruthy();
    expect(shellText(language, "internal")).toBeTruthy();
  });
});
