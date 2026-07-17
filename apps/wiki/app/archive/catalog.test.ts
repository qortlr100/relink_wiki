import { describe, expect, it } from "vitest";
import {
  catalogRecords,
  categories,
  getCategoryRecords,
  getRecord,
  getRecordHref,
  isCategoryKey,
  publicSnapshot,
} from "./catalog";

describe("public archive catalog", () => {
  it("contains only published records from supported categories", () => {
    const expectedRecordCount = Object.values(publicSnapshot.recordCounts).reduce(
      (total, count) => total + count,
      0,
    );
    const populatedCategories = categories
      .filter((category) => getCategoryRecords(category.key).length > 0)
      .map((category) => category.key);

    expect(catalogRecords).toHaveLength(expectedRecordCount - 1);
    expect(new Set(catalogRecords.map((record) => record.categoryKey))).toEqual(
      new Set(populatedCategories),
    );
    expect(isCategoryKey("characters")).toBe(true);
    expect(isCategoryKey("private-staging")).toBe(false);
  });

  it("preserves presentation exceptions in the snapshot but hides them from the UI", () => {
    expect(publicSnapshot.characters).toContainEqual(
      expect.objectContaining({ id: "character-pl000b", nameKo: "dummy" }),
    );
    expect(getCategoryRecords("characters")).not.toContainEqual(
      expect.objectContaining({ id: "character-pl000b" }),
    );
    expect(catalogRecords).not.toContainEqual(expect.objectContaining({ id: "character-pl000b" }));
    expect(getRecord("characters", "character-pl000b")).toBeUndefined();
  });

  it("resolves records and their public detail routes", () => {
    const catalogRecord = catalogRecords[0];
    expect(catalogRecord).toBeDefined();
    if (!catalogRecord) {
      return;
    }

    expect(getRecord(catalogRecord.categoryKey, catalogRecord.slug)).toMatchObject({
      id: catalogRecord.id,
      nameKo: catalogRecord.nameKo,
    });
    expect(getRecordHref(catalogRecord)).toBe(
      `/archive/${catalogRecord.categoryKey}/${catalogRecord.slug}`,
    );
    expect(getRecord(catalogRecord.categoryKey, "__missing__")).toBeUndefined();
  });
});
