import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TranslationProvider } from "../i18n/translations.js";
import { DeveloperEnvironmentControls, EnvironmentBanner } from "./EnvironmentBanner.jsx";

describe("environment UI", () => {
  it("permanently identifies Sandbox including public/unauthenticated routes", () => {
    const { rerender } = render(<EnvironmentBanner environment="sandbox" />);
    expect(screen.getByRole("status")).toHaveTextContent("SANDBOX · TEST DATA");
    rerender(<EnvironmentBanner environment="production" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("shows build and full-origin navigation only for an authorized developer", () => {
    const buildId = "synthetic-commit-for-test";
    const view = (authorized) => <TranslationProvider><DeveloperEnvironmentControls authorized={authorized} environment="sandbox" buildId={buildId} /></TranslationProvider>;
    const { rerender } = render(view(false));
    expect(screen.queryByText(/Build/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    rerender(view(true));
    expect(screen.getByTitle(buildId)).toHaveTextContent("SANDBOX · Build synthetic-co");
    expect(screen.getByRole("link", { name: "Back to Production" })).toHaveAttribute("href", "https://clean-flow-prototipo.web.app");
  });
});
