import { describe, expect, it } from "vitest";

describe("Functions export surface", () => {
  it("keeps the name, trigger and options of every deployed Function", async () => {
    const handlers = await import("./index.js");
    const surface = Object.entries(handlers)
      .filter(([, value]) => value?.__endpoint)
      .map(([name, value]) => [name, JSON.parse(JSON.stringify(value.__endpoint))])
      .sort(([a], [b]) => (a < b ? -1 : 1));

    expect(surface).toMatchSnapshot();
    expect(surface.length).toBe(61);

    const helpers = Object.entries(handlers)
      .filter(([, value]) => !value?.__endpoint)
      .map(([name]) => name)
      .sort();
    expect(helpers).toMatchInlineSnapshot(`
      [
        "publicOfferResult",
      ]
    `);
  });
});
