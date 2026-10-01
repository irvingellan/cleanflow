import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EnvironmentBanner } from "./EnvironmentBanner.jsx";

describe("EnvironmentBanner", () => {
  it("is permanently visible for sandbox builds", () => {
    render(<EnvironmentBanner environment="sandbox" buildId="abcdef1234567890" />);
    expect(screen.getByRole("status", { name: "Sandbox environment" })).toHaveTextContent("SANDBOX");
    expect(screen.getByText("TEST DATA")).toBeVisible();
    expect(screen.getByText("Build abcdef123456")).toBeVisible();
  });

  it("does not add production noise", () => {
    render(<EnvironmentBanner environment="production" buildId="abcdef" />);
    expect(screen.queryByRole("status", { name: "Sandbox environment" })).not.toBeInTheDocument();
  });
});
