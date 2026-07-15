import { describe, expect, it } from "vitest";
import {
  normalizationDiffSchema,
  normalizedRecordSchema,
  publicSnapshotSchema,
  recordIdSchema,
} from "./index";

describe("recordIdSchema", () => {
  it("keeps the identifier format open while rejecting unsafe strings", () => {
    expect(recordIdSchema.safeParse("Character_한글").success).toBe(true);
    expect(recordIdSchema.safeParse(" character-10").success).toBe(false);
    expect(recordIdSchema.safeParse("character\n10").success).toBe(false);
    expect(recordIdSchema.safeParse("x".repeat(129)).success).toBe(false);
  });
});

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

describe("normalizationDiffSchema", () => {
  it("accepts a private read-only diff without source payloads", () => {
    expect(
      normalizationDiffSchema.safeParse({
        baselineNormalizationRunId: "7b6eb5c2-17bb-4c24-b4b0-701b080cd29b",
        candidateNormalizationRunId: "e425bb8f-d65f-4542-9b80-fb44a13cf726",
        schemaVersion: 1,
        summary: { added: 0, changed: 1, removed: 0, unchanged: 0 },
        records: [
          {
            category: "character",
            sourceRecordId: "1",
            status: "changed",
            changedFields: ["nameKo"],
            baseline: { id: "character-10", slug: "gran", nameKo: "그랑" },
            candidate: { id: "character-10", slug: "gran", nameKo: "그랑 (주인공)" },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects a summary that does not match the record statuses", () => {
    const result = normalizationDiffSchema.safeParse({
      baselineNormalizationRunId: "7b6eb5c2-17bb-4c24-b4b0-701b080cd29b",
      candidateNormalizationRunId: "e425bb8f-d65f-4542-9b80-fb44a13cf726",
      schemaVersion: 1,
      summary: { added: 1, changed: 0, removed: 0, unchanged: 0 },
      records: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects changed fields that do not match the before and after values", () => {
    const result = normalizationDiffSchema.safeParse({
      baselineNormalizationRunId: "7b6eb5c2-17bb-4c24-b4b0-701b080cd29b",
      candidateNormalizationRunId: "e425bb8f-d65f-4542-9b80-fb44a13cf726",
      schemaVersion: 1,
      summary: { added: 0, changed: 1, removed: 0, unchanged: 0 },
      records: [
        {
          category: "character",
          sourceRecordId: "1",
          status: "changed",
          changedFields: ["slug"],
          baseline: { id: "character-10", slug: "gran", nameKo: "그랑" },
          candidate: { id: "character-10", slug: "gran", nameKo: "그랑 (주인공)" },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
