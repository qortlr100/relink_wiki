import { describe, expect, it } from "vitest";
import { normalizedRecordSchema, publicSnapshotSchema } from "./index";
describe("publicSnapshotSchema", () => {
  it("rejects unreviewed public records", () => {
    const result = publicSnapshotSchema.safeParse({
      schemaVersion: 1,
      contentRevision: "1",
      generatedAt: new Date().toISOString(),
      sourceRevision: "abc",
      characters: [{ id: "1", slug: "gran", nameKo: "그랑", reviewState: "staged" }],
      weapons: [],
      sigils: [],
      skills: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an allowlisted snapshot for all MVP categories", () => {
    const publishedRecord = { id: "1", slug: "gran", nameKo: "그랑", reviewState: "published" };
    const result = publicSnapshotSchema.safeParse({
      schemaVersion: 1,
      contentRevision: "sample",
      generatedAt: new Date().toISOString(),
      sourceRevision: "abc",
      characters: [publishedRecord],
      weapons: [],
      sigils: [],
      skills: [],
    });
    expect(result.success).toBe(true);
  });

  it("validates a normalized record with complete private provenance", () => {
    expect(
      normalizedRecordSchema.safeParse({
        category: "character",
        id: "character-10",
        slug: "gran",
        nameKo: "그랑",
        reviewState: "staged",
        provenance: {
          sourceFileId: "system/table/chara.tbl",
          sourceRecordId: "1",
          extractorVersion: "2.0.0",
          importRunId: "7b6eb5c2-17bb-4c24-b4b0-701b080cd29b",
          importedAt: "2026-07-15T00:00:00.000Z",
          schemaVersion: 1,
        },
      }).success,
    ).toBe(true);
  });
});
