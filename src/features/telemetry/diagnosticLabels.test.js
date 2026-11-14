import { describe, expect, it } from "vitest";
import { deviceKeyLabel, deviceLabel, personLabel } from "./diagnosticLabels.js";

describe("diagnostic labels", () => {
  it("names devices instead of raw browser/platform keys", () => {
    expect(deviceLabel({ browser: "safari", platform: "macos" })).toBe("Mac · Safari");
    expect(deviceLabel({ browser: "safari", platform: "ios", standalone: true }, "app instalado")).toBe("iPhone/iPad · app instalado");
    expect(deviceKeyLabel("chrome/macos")).toBe("Mac · Chrome");
    expect(deviceLabel({})).toBe("—");
  });

  it("names the signed-in person and shortens other accounts", () => {
    const copy = { you: "Você", otherAccount: "Outra conta" };
    const me = { uid: "8RfIeVDCabc", email: "me@example.com" };
    expect(personLabel("8RfIeVDCabc", me, copy)).toBe("Você (me@example.com)");
    expect(personLabel("Zx91ab77zz", me, copy)).toBe("Outra conta · Zx91ab");
    expect(personLabel(undefined, me, copy)).toBe("—");
  });
});
