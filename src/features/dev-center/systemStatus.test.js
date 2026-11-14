import { describe, expect, it } from "vitest";
import { classifyLatency, consoleLinks, describeBuild } from "./systemStatus.js";

const sha = "4b9e25de9ac9914852b9c47b64282e43be538a82";

describe("describeBuild", () => {
  it("reads the commit and feature flags from the deployment id", () => {
    const build = describeBuild({ version: "v0.9.3", buildId: sha, environment: "production", deploymentId: `${sha}-cleaner-push-automatic-offers` });
    expect(build.shortId).toBe("4b9e25d");
    expect(build.commitUrl).toBe(`https://github.com/irvingellan/cleanflow/commit/${sha}`);
    expect(build.flags).toEqual({ automaticOffers: true, cleanerPush: true, inbox: true });
  });

  it("handles local builds and the inbox-off variant", () => {
    const build = describeBuild({ buildId: "0.9.3-2026-11-14T00:00:00.000Z", deploymentId: "0.9.3-2026-11-14T00:00:00.000Z-inbox-off" });
    expect(build.commitUrl).toBeNull();
    expect(build.flags).toEqual({ automaticOffers: false, cleanerPush: false, inbox: false });
    expect(describeBuild(null).environment).toBe("unknown");
  });
});

describe("classifyLatency", () => {
  it("separates warm, cold and failed calls", () => {
    expect(classifyLatency(420)).toBe("warm");
    expect(classifyLatency(3900)).toBe("cold");
    expect(classifyLatency(Number.NaN)).toBe("failed");
  });
});

it("builds console links for the project", () => {
  expect(consoleLinks("clean-flow-prototipo").functions).toContain("/project/clean-flow-prototipo/functions");
});
