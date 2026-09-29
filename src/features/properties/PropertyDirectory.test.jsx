import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { PropertyDirectory } from "./PropertyDirectory.jsx";

const properties = [
  { id: "property-a", name: "Pacific Beach Condo", address: "Ocean Boulevard" },
  { id: "property-b", name: "Sunset House", address: "Hill Street" },
];

describe("PropertyDirectory search", () => {
  it("filters the loaded list by name or address without changing source order", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <TranslationProvider>
        <PropertyDirectory
          properties={properties}
          isLoading={false}
          hasError={false}
          onSelect={onSelect}
          onCreate={vi.fn()}
        />
      </TranslationProvider>,
    );

    const search = screen.getByRole("searchbox", { name: "Search properties" });
    expect(screen.getAllByRole("button", { name: /^View / }).map((button) => button.textContent)).toEqual([
      expect.stringContaining("Pacific Beach Condo"),
      expect.stringContaining("Sunset House"),
    ]);

    await user.type(search, "OCEAN");
    expect(screen.getByRole("button", { name: "View Pacific Beach Condo" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "View Sunset House" })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "sunSET");
    await user.click(screen.getByRole("button", { name: "View Sunset House" }));
    expect(onSelect).toHaveBeenCalledWith(properties[1]);
  });

  it("shows a local no-results message without mutating Properties", async () => {
    render(
      <TranslationProvider>
        <PropertyDirectory
          properties={properties}
          isLoading={false}
          hasError={false}
          onSelect={vi.fn()}
          onCreate={vi.fn()}
        />
      </TranslationProvider>,
    );

    await userEvent.type(screen.getByRole("searchbox", { name: "Search properties" }), "not present");
    expect(screen.getByText("No properties match this search.")).toBeVisible();
    expect(properties).toHaveLength(2);
  });
});
