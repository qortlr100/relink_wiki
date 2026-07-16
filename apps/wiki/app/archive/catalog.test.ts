import { describe, expect, it } from "vitest";
import { catalogRecords, getRecord, getRecordHref, isCategoryKey } from "./catalog";

describe("public archive catalog", () => {
  it("contains only published records from supported categories", () => {
    expect(catalogRecords).toHaveLength(5);
    expect(new Set(catalogRecords.map((record) => record.categoryKey))).toEqual(
      new Set(["characters", "weapons", "sigils", "skills"]),
    );
    expect(isCategoryKey("characters")).toBe(true);
    expect(isCategoryKey("private-staging")).toBe(false);
  });

  it("resolves records and their public detail routes", () => {
    const record = getRecord("characters", "gran");
    expect(record?.nameKo).toBe("그랑");
    expect(getRecordHref({ categoryKey: "characters", slug: record?.slug ?? "missing" })).toBe(
      "/archive/characters/gran",
    );
    expect(getRecord("characters", "missing")).toBeUndefined();
  });
});
