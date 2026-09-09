import { describe, expect, it } from "vitest";
import {
  buildArchiveUpdate,
  buildRestoreUpdate,
  filterArchivedRecords,
  isArchived,
} from "./archiveState.js";

describe("archive state", () => {
  it("keeps legacy records without archivedAt operationally visible", () => {
    expect(isArchived({ id: "legacy" })).toBe(false);
    expect(filterArchivedRecords([{ id: "legacy" }, { id: "archived", archivedAt: {} }]))
      .toEqual([{ id: "legacy" }]);
  });

  it("supports a developer archive view without changing record data", () => {
    const records = [{ id: "legacy" }, { id: "archived", archivedAt: {} }];
    expect(filterArchivedRecords(records, true)).toBe(records);
  });

  it("writes only archive visibility metadata and leaves provenance independent", () => {
    const timestamp = { server: true };
    expect(buildArchiveUpdate("manager-uid", timestamp)).toEqual({
      archivedAt: timestamp,
      archivedBy: "manager-uid",
    });
    expect(buildRestoreUpdate("manager-uid", timestamp)).toEqual({
      archivedAt: null,
      restoredAt: timestamp,
      restoredBy: "manager-uid",
    });
  });
});
