import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/index.css", "utf8");
const tokens = JSON.parse(readFileSync("docs/design-system-v2/TOKENS.json", "utf8"));
const legacy = JSON.parse(readFileSync("docs/design-system-v2/LEGACY_VALUES.json", "utf8"));
const blocks = [...css.matchAll(/:root(?:\[data-theme="dark"\])?\s*\{([^}]+)\}/g)].slice(0, 2);
const declarations = (block) => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
const light = declarations(blocks[0][1]);
const dark = { ...light, ...declarations(blocks[1][1]) };
function resolve(value, variables) {
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference ? resolve(variables[reference[1]], variables) : value;
}

describe("Design System V2 Phase A zero-visual-change contract", () => {
  it("defines all approved color roles explicitly in both theme blocks", () => {
    expect(Object.keys(tokens.color.dark).sort()).toEqual(Object.keys(tokens.color.light).sort());
    for (const block of blocks) {
      const names = Object.keys(declarations(block[1])).filter((name) => name.startsWith("--v2-color-"));
      expect(names.sort()).toEqual(Object.keys(tokens.color.light).map((role) => `--v2-color-${role}`).sort());
    }
  });

  it.each(["light", "dark"])("%s semantic values match TOKENS.json exactly", (theme) => {
    const variables = theme === "light" ? light : dark;
    for (const [role, value] of Object.entries(tokens.color[theme])) expect(variables[`--v2-color-${role}`], role).toBe(value);
    expect(variables["--v2-elevation-overlay"]).toBe(tokens.elevation.overlay[theme]);
  });

  it.each(["light", "dark"])("%s legacy aliases resolve without applying changed values", (theme) => {
    const variables = theme === "light" ? light : dark;
    const own = declarations(blocks[theme === "light" ? 0 : 1][1]);
    for (const [name, original] of Object.entries(legacy.values[theme])) {
      expect(resolve(variables[name], variables), name).toBe(original);
      const role = tokens["legacy-map"][name];
      if (tokens.color[theme][role] === original) {
        expect(own[name], name).toBe(`var(--v2-color-${role})`);
        expect(legacy.aliases[theme][name]).toBe(role);
      } else {
        expect(own[name], name).toBe(original);
      }
    }
  });

  it("does not apply changed-from-current values to existing mapped variables", () => {
    for (const theme of ["light", "dark"]) for (const [name, role] of Object.entries(tokens["legacy-map"])) {
      if (!legacy.values[theme][name] || legacy.values[theme][name] === tokens.color[theme][role]) continue;
      expect(resolve((theme === "light" ? light : dark)[name], theme === "light" ? light : dark), name).not.toBe(tokens.color[theme][role]);
    }
  });

  it("establishes opt-in typography, geometry, layout, breakpoints and motion", () => {
    expect(light["--v2-type-font-family"]).toBe(tokens.typography["font-family"]);
    expect(light["--v2-type-body-size"]).toBe("15px");
    expect(light["--v2-type-body-line"]).toBe("22px");
    expect(light["--v2-type-body-weight"]).toBe("400");
    expect(light["--v2-type-page-title-tracking"]).toBe("-0.032em");
    expect(light["--v2-type-secondary-color"]).toBe("var(--v2-color-text-secondary)");
    for (const [key, value] of Object.entries(tokens.space)) expect(light[`--v2-space-${key}`]).toBe(`${value}px`);
    for (const [key, value] of Object.entries(tokens.radius)) expect(light[`--v2-radius-${key}`]).toBe(`${value}px`);
    expect(light["--v2-size-touch-target-min"]).toBe("44px");
    expect(light["--v2-layout-content-max-wide"]).toBe("1560px");
    expect(light["--v2-layout-mobile-safe-area-bottom"]).toBe("env(safe-area-inset-bottom)");
    expect(light["--v2-breakpoint-compact-max"]).toBe("719px");
    expect(light["--v2-breakpoint-medium-min"]).toBe("720px");
    expect(light["--v2-breakpoint-wide-min"]).toBe("1100px");
    expect(light["--v2-breakpoint-extra-wide-min"]).toBe("1440px");
    expect(light["--v2-motion-duration-fast"]).toBe("120ms");
    expect(light["--v2-motion-slow-network-notice-after"]).toBe("5000ms");
    expect(light["--v2-motion-easing-standard"]).toBe(tokens.motion.easing.standard);
  });

  it("leaves all existing component rules and media queries byte-identical", () => {
    const componentCss = css.slice(css.indexOf("\n* {"));
    expect(createHash("sha256").update(componentCss).digest("hex")).toBe("ede189f444757238139332674a2d14aab4c299b2d3dbe8114baa269bb70aa64b");
    expect(componentCss).not.toContain("var(--v2-");
  });
});
