import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  compareNormalizationRuns,
  importStagingRecords,
  normalizeMappedRecords,
  openDatabase,
} from "./index";
import { NormalizationDiffError } from "./normalization-diff-repository";

const openConnections: ReturnType<typeof openDatabase>[] = [];

afterEach(() => {
  for (const connection of openConnections.splice(0)) {
    connection.sqlite.close();
  }
});

function createImport(records: { sourceTable: "chara" | "weapon" | "gem"; id: string }[]) {
  const importRunId = randomUUID();
  return {
    importRunId,
    inputFingerprint: importRunId.replaceAll("-", "").padEnd(64, "0"),
    extractorVersion: "2.0.0",
    importedAt: "2026-07-15T00:00:00.000Z",
    schemaVersion: 1,
    records: records.map((record, index) => ({
      sourceTable: record.sourceTable,
      sourceFileId: `system/table/${record.sourceTable}.tbl`,
      sourceRecordId: record.id,
      rawPayload: { fixture: index },
      payloadHash: String(index + 1).repeat(64),
    })),
    warnings: [],
  };
}

function normalize(
  connection: ReturnType<typeof openDatabase>,
  importRunId: string,
  schemaVersion: number,
  records: {
    sourceTable: "chara" | "weapon" | "gem";
    sourceRecordId: string;
    id: string;
    slug: string;
    nameKo: string;
  }[],
) {
  return normalizeMappedRecords(connection.db, {
    normalizationRunId: randomUUID(),
    importRunId,
    normalizedAt: "2026-07-15T01:00:00.000Z",
    schemaVersion,
    records,
  });
}

function createConnection() {
  const connection = openDatabase({ path: ":memory:" });
  openConnections.push(connection);
  applyMigrations(connection.sqlite);
  return connection;
}

describe("compareNormalizationRuns", () => {
  it("classifies added, changed, removed, and unchanged records deterministically", () => {
    const connection = createConnection();
    const baselineImport = createImport([
      { sourceTable: "chara", id: "1" },
      { sourceTable: "weapon", id: "2" },
      { sourceTable: "gem", id: "3" },
    ]);
    const candidateImport = createImport([
      { sourceTable: "chara", id: "1" },
      { sourceTable: "gem", id: "3" },
      { sourceTable: "gem", id: "4" },
    ]);
    importStagingRecords(connection.db, baselineImport);
    importStagingRecords(connection.db, candidateImport);
    const baseline = normalize(connection, baselineImport.importRunId, 1, [
      {
        sourceTable: "chara",
        sourceRecordId: "1",
        id: "character-1",
        slug: "gran",
        nameKo: "그랑",
      },
      { sourceTable: "weapon", sourceRecordId: "2", id: "weapon-2", slug: "sword", nameKo: "검" },
      { sourceTable: "gem", sourceRecordId: "3", id: "sigil-3", slug: "attack", nameKo: "공격" },
    ]);
    const candidate = normalize(connection, candidateImport.importRunId, 1, [
      {
        sourceTable: "chara",
        sourceRecordId: "1",
        id: "character-1",
        slug: "gran",
        nameKo: "그랑 (주인공)",
      },
      { sourceTable: "gem", sourceRecordId: "3", id: "sigil-3", slug: "attack", nameKo: "공격" },
      { sourceTable: "gem", sourceRecordId: "4", id: "sigil-4", slug: "health", nameKo: "체력" },
    ]);

    const result = compareNormalizationRuns(connection.db, {
      baselineNormalizationRunId: baseline.normalizationRunId,
      candidateNormalizationRunId: candidate.normalizationRunId,
    });

    expect(result.summary).toEqual({ added: 1, changed: 1, removed: 1, unchanged: 1 });
    expect(
      result.records.map(({ category, sourceRecordId, status, changedFields }) => ({
        category,
        sourceRecordId,
        status,
        changedFields,
      })),
    ).toEqual([
      { category: "character", sourceRecordId: "1", status: "changed", changedFields: ["nameKo"] },
      { category: "sigil", sourceRecordId: "3", status: "unchanged", changedFields: [] },
      { category: "sigil", sourceRecordId: "4", status: "added", changedFields: [] },
      { category: "weapon", sourceRecordId: "2", status: "removed", changedFields: [] },
    ]);
  });

  it("ignores provenance-only changes", () => {
    const connection = createConnection();
    const firstImport = createImport([{ sourceTable: "chara", id: "1" }]);
    const secondImport = createImport([{ sourceTable: "chara", id: "1" }]);
    importStagingRecords(connection.db, firstImport);
    importStagingRecords(connection.db, secondImport);
    const mapping = [
      {
        sourceTable: "chara" as const,
        sourceRecordId: "1",
        id: "character-1",
        slug: "gran",
        nameKo: "그랑",
      },
    ];
    const baseline = normalize(connection, firstImport.importRunId, 1, mapping);
    const candidate = normalize(connection, secondImport.importRunId, 1, mapping);

    expect(
      compareNormalizationRuns(connection.db, {
        baselineNormalizationRunId: baseline.normalizationRunId,
        candidateNormalizationRunId: candidate.normalizationRunId,
      }).summary,
    ).toEqual({ added: 0, changed: 0, removed: 0, unchanged: 1 });
  });

  it("rejects missing runs without exposing requested identifiers", () => {
    const connection = createConnection();

    try {
      compareNormalizationRuns(connection.db, {
        baselineNormalizationRunId: randomUUID(),
        candidateNormalizationRunId: randomUUID(),
      });
      throw new Error("Missing normalization runs should fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(NormalizationDiffError);
      expect(error).toMatchObject({ code: "NORMALIZATION_RUN_NOT_FOUND" });
      expect(String(error)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
    }
  });

  it("rejects comparisons across normalization schema versions", () => {
    const connection = createConnection();
    const baselineImport = createImport([{ sourceTable: "chara", id: "1" }]);
    const candidateImport = createImport([{ sourceTable: "chara", id: "1" }]);
    importStagingRecords(connection.db, baselineImport);
    importStagingRecords(connection.db, candidateImport);
    const mapping = [
      {
        sourceTable: "chara" as const,
        sourceRecordId: "1",
        id: "character-1",
        slug: "gran",
        nameKo: "그랑",
      },
    ];
    const baseline = normalize(connection, baselineImport.importRunId, 1, mapping);
    const candidate = normalize(connection, candidateImport.importRunId, 2, mapping);

    expect(() =>
      compareNormalizationRuns(connection.db, {
        baselineNormalizationRunId: baseline.normalizationRunId,
        candidateNormalizationRunId: candidate.normalizationRunId,
      }),
    ).toThrow(expect.objectContaining({ code: "NORMALIZATION_DIFF_SCHEMA_MISMATCH" }));
  });
});
