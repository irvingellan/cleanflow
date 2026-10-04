import { describe, expect, it } from "vitest";
import { translateInLanguage } from "../i18n/translations.js";
import { formatOperationalStatus, formatStatus } from "./presentation.js";

const knownStatuses = {
  UNASSIGNED: "status.unassigned",
  OFFERED: "status.offered",
  ASSIGNED: "status.assigned",
  IN_PROGRESS: "status.inProgress",
  COMPLETED: "status.completed",
  PENDING: "status.pending",
  INTERESTED: "status.interested",
  DECLINED: "status.declined",
  OPEN: "status.open",
  RESOLVED: "status.resolved",
};

describe("formatStatus localized missing value", () => {
  it.each([
    ["en", "Not provided"],
    ["pt", "Não informado"],
    ["es", "No indicado"],
  ])("uses the real %s missing-value translation for absent or unknown status", (language, missing) => {
    const translate = (key) => translateInLanguage(language, key);
    for (const status of [undefined, null, "", "UNSUPPORTED", "constructor", "toString", 0, {}]) {
      expect(formatStatus(status, translate)).toBe(missing);
      expect(formatOperationalStatus(status, translate)).toBe(missing);
    }
  });

  it.each(["en", "pt", "es"])("preserves every known %s translated status", (language) => {
    const translate = (key) => translateInLanguage(language, key);
    for (const [status, key] of Object.entries(knownStatuses)) {
      expect(formatStatus(status, translate)).toBe(translate(key));
      expect(formatOperationalStatus(status, translate)).toBe(translate(key));
    }
  });

  it("keeps English missing fallback when no translator is supplied", () => {
    for (const status of [undefined, null, "", "UNSUPPORTED", "constructor", "toString"]) {
      expect(formatStatus(status)).toBe("Not provided");
      expect(formatOperationalStatus(status)).toBe("Not provided");
    }
  });

  it("keeps all known English fallback labels unchanged", () => {
    expect(Object.keys(knownStatuses).map((status) => formatStatus(status))).toEqual([
      "Unassigned", "Offered", "Assigned", "In progress", "Completed",
      "Pending", "Interested", "Not available", "Open", "Resolved",
    ]);
  });
});
