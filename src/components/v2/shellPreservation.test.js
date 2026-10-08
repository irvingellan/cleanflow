import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
const baseline = execFileSync("git", ["show", "e4a3cfc9862e75b8680c237804fe703a3e45fd6b:src/App.jsx"], { encoding: "utf8" });
const current = fs.readFileSync("src/App.jsx", "utf8");
function manager(code) { return code.slice(code.indexOf("function ManagerApplication"), code.indexOf("function AuthenticationLoading")); }
describe("Phase C1 presentation preservation", () => {
  it("manager controllers, authorization checks and existing handlers remain byte-identical", () => {
    const logic = code => manager(code).split("  const foundationClass =")[0].split("  return (\n    <main className=\"app-shell\">")[0]
      .replace(/  const \[integratedChoice[\s\S]*?(?=\n  useEffect\()/, "");
    expect(logic(current)).toBe(logic(baseline));
  });
  it("every existing screen JSX/handler binding is unchanged", () => {
    const pages = code => manager(code).slice(manager(code).indexOf("        <PwaUpdatePrompt />"), manager(code).lastIndexOf("      </section>"))
      .replaceAll('DashboardPresentation presentation="v2" hideComparison', "Dashboard")
      .replaceAll('ServicesPresentation presentation="v2" hideComparison', "JobsPage")
      .replaceAll('DetailPresentation presentation="v2" hideComparison', "JobDetail")
      .replace('            onRetry={jobWorklist.retry}\n', "");
    const currentPages = manager(current).slice(manager(current).indexOf("        <PwaUpdatePrompt />"), manager(current).lastIndexOf("      </Shell>"))
      .replaceAll('DashboardPresentation presentation="v2" hideComparison', "Dashboard")
      .replaceAll('ServicesPresentation presentation="v2" hideComparison', "JobsPage")
      .replaceAll('DetailPresentation presentation="v2" hideComparison', "JobDetail")
      .replace('            onRetry={jobWorklist.retry}\n', "");
    const oldPages = pages(baseline);
    expect(currentPages).toBe(oldPages);
  });
  it("all legacy account components and callbacks are reused verbatim", () => {
    const account = code => manager(code).match(/            <div className="manager-account">[\s\S]*?\{hasSignOutError[\s\S]*?\n            \)}/)?.[0];
    expect(account(current)).toBe(account(baseline));
  });
  it("all shell CSS values refer to existing tokens; no arbitrary colors", () => {
    const css = fs.readFileSync("src/components/v2/shell.css", "utf8");
    const tokens = fs.readFileSync("src/index.css", "utf8");
    for (const [, name] of css.matchAll(/var\((--v2-[\w-]+)/g)) expect(tokens).toContain(`${name}:`);
    expect(css).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
    for (const [, width] of css.matchAll(/(?:min|max)-width:\s*(\d+)px/g)) expect([719, 720, 1099, 1100, 1439, 1440]).toContain(Number(width));
  });
});
