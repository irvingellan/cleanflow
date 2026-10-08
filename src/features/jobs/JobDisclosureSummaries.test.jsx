import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { JobDetailV2Pilot } from "./JobDetailV2Pilot.jsx";
import { getServiceLifecycleFixture } from "../../../scripts/serviceLifecycleFixtures.mjs";
vi.mock("../cleaners/cleanerService.js", () => ({ getCleanerContactsById: vi.fn().mockResolvedValue({}) }));
beforeEach(() => {
  window.history.replaceState(null, "", "/?jobDetail=v2");
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
});
it("adds descriptions without changing disclosure names, controls or mutation behavior", () => {
  const fixture = getServiceLifecycleFixture("assigned-draft");
  const mutation = vi.fn();
  const { container } = render(<TranslationProvider><JobDetailV2Pilot {...fixture} isLoadingChecklistRun={false} hasChecklistRunError={false} onUpdatePrices={mutation} /></TranslationProvider>);
  const headings = [...container.querySelectorAll(".job-detail-section > summary")];
  expect(headings).toHaveLength(7);
  expect(headings[2]).toHaveAccessibleName("Checklist");
  expect(headings[2]).toHaveAccessibleDescription("Draft");
  expect(headings[5]).toHaveAccessibleName("Financial");
  expect(headings[5]).toHaveAccessibleDescription("Client price and cleaner payout");
  for (const heading of headings) { fireEvent.click(heading); expect(heading.querySelector("button, input, a")).toBeNull(); }
  expect(mutation).not.toHaveBeenCalled();
  expect(container.querySelector(".service-financial-summary")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next step: Open existing checklist" })).toBeInTheDocument();
});
it("CURRENT and mobile have no added descriptions", () => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  const { container } = render(<TranslationProvider><JobDetailV2Pilot {...getServiceLifecycleFixture("assigned-draft")} /></TranslationProvider>);
  expect(container.querySelectorAll(".job-v2-disclosure-summary")).toHaveLength(0);
  expect(container.querySelector(".panel.job-detail")).toBeInTheDocument();
});
it("changing Job changes summaries without keeping prior Run evidence", () => {
  const first = getServiceLifecycleFixture("assigned-draft");
  const second = getServiceLifecycleFixture("ready");
  const { container, rerender } = render(<TranslationProvider><JobDetailV2Pilot {...first} isLoadingChecklistRun={false} hasChecklistRunError={false} /></TranslationProvider>);
  expect(container.querySelectorAll(".job-v2-disclosure-summary")[2]).toHaveTextContent("Draft");
  rerender(<TranslationProvider><JobDetailV2Pilot {...second} isLoadingChecklistRun={true} hasChecklistRunError={false} /></TranslationProvider>);
  expect(container.querySelectorAll(".job-v2-disclosure-summary")[2]).toHaveTextContent("Loading…");
});
