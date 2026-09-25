import { describe, expect, it } from "vitest";
import { filterCleanersByName, normalizeCleanerSearchText } from "./cleanerSearch.js";

describe("cleaner name search", () => {
  const cleaners = [
    { id: "accented", name: "Beatríz Gómez", phone: "+15550000001" },
    { id: "unaccented", name: "Joao Silva", phone: "+15550000002" },
    { id: "other", name: "Ana Example", phone: "+15550000003" },
  ];

  it("matches names case- and diacritic-insensitively", () => {
    expect(filterCleanersByName(cleaners, "BEATRIZ").map(({ id }) => id)).toEqual(["accented"]);
    expect(filterCleanersByName(cleaners, "joão").map(({ id }) => id)).toEqual(["unaccented"]);
    expect(normalizeCleanerSearchText("  João  ")).toBe("joao");
  });

  it("matches names only and returns no rows for an unmatched query", () => {
    expect(filterCleanersByName(cleaners, "+15550000001")).toEqual([]);
    expect(filterCleanersByName(cleaners, "missing")).toEqual([]);
  });

  it("returns the already-loaded list unchanged for a blank query", () => {
    expect(filterCleanersByName(cleaners, "   ")).toBe(cleaners);
  });
});
