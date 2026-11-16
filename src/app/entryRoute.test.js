import { describe, expect, it } from "vitest";
import {
  isChecklistPreviewPath,
  isCleanerHubPath,
  isManagerLoadDiagnosticsPath,
  isWeeklyClosePreviewPath,
  publicChecklistTokenFromSearch,
  publicClientPortalTokenFromSearch,
  publicClientReportTokenFromSearch,
  publicOfferTokenFromPathname,
} from "./entryRoute.js";

describe("entry route detection", () => {
  it("reads the public offer token from /offer/<token>", () => {
    expect(publicOfferTokenFromPathname("/offer/abc")).toBe("abc");
    expect(publicOfferTokenFromPathname("/offer/abc/")).toBe("abc");
    expect(publicOfferTokenFromPathname("/offer/a%20b")).toBe("a b");
    expect(publicOfferTokenFromPathname("/offer")).toBe("");
    expect(publicOfferTokenFromPathname("/offer/abc/extra")).toBe("");
    expect(publicOfferTokenFromPathname("/offer/%E0%A4%A")).toBe("");
    expect(publicOfferTokenFromPathname("/offers/abc")).toBeNull();
    expect(publicOfferTokenFromPathname("/")).toBeNull();
  });

  it.each([
    ["checklist preview", isChecklistPreviewPath, "/checklist-preview", "/checklist"],
    ["weekly close preview", isWeeklyClosePreviewPath, "/weekly-close-preview", "/weekly-close"],
    ["manager load diagnostics", isManagerLoadDiagnosticsPath, "/diagnostics/load-times", "/diagnostics"],
  ])("detects the %s path", (_label, detect, accepted, other) => {
    expect(detect(accepted)).toBe(true);
    expect(detect(`${accepted}/`)).toBe(true);
    expect(detect(other)).toBe(false);
    expect(detect("/")).toBe(false);
  });

  it("detects the Cleaner Hub at /agenda and /agenda.html", () => {
    expect(isCleanerHubPath("/agenda")).toBe(true);
    expect(isCleanerHubPath("/agenda/")).toBe(true);
    expect(isCleanerHubPath("/agenda.html")).toBe(true);
    expect(isCleanerHubPath("/agenda/today")).toBe(false);
    expect(isCleanerHubPath("/")).toBe(false);
  });

  it.each([
    ["public checklist", publicChecklistTokenFromSearch, "/checklist", "/checklist-preview"],
    ["client report", publicClientReportTokenFromSearch, "/client-report", "/client-reports"],
    ["client portal", publicClientPortalTokenFromSearch, "/portal", "/portals"],
  ])("reads the %s token from the query string", (_label, read, accepted, other) => {
    expect(read(accepted, "?t=token-value")).toBe("token-value");
    expect(read(`${accepted}/`, "?t=token-value")).toBe("token-value");
    expect(read(accepted, "")).toBe("");
    expect(read(accepted, "?token=token-value")).toBe("");
    expect(read(other, "?t=token-value")).toBeNull();
    expect(read("/", "?t=token-value")).toBeNull();
  });
});
