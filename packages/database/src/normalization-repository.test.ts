import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations, importStagingRecords, openDatabase } from "./index";
import { NormalizationError, normalizeMappedRecords } from "./normalization-repository";

const openConnections: ReturnType<typeof openDatabase>[] = [];

afterEach(() => {
  for (const connection of openConnections.splice(0)) {
    connection.sqlite.close();
  }
});

function createStagingImport() {
  return {
    importRunId: randomUUID(),
    inputFingerprint: "a".repeat(64),
    extractorVersion: "2.0.0",
    importedAt: "2026-07-15T00:00:00.000Z",
    schemaVersion: 1,
    records: [
      {
        sourceTable: "chara" as const,
        sourceFileId: "system/table/chara.tbl",
        sourceRecordId: "1",
        rawPayload: { CharacterId: 10 },
        payloadHash: "b".repeat(64),
      },
      {
        sourceTable: "weapon" as const,
        sourceFileId: "system/table/weapon.tbl",
        sourceRecordId: "2",
        rawPayload: { WeaponId: 20 },
        payloadHash: "c".repeat(64),
      },
    ],
    warnings: [],
  };
}

function createNormalization(importRunId: string) {
  return {
    normalizationRunId: randomUUID(),
    importRunId,
    normalizedAt: "2026-07-15T01:00:00.000Z",
    schemaVersion: 1,
    records: [
      {
        sourceTable: "chara" as const,
        sourceRecordId: "1",
        id: "character-10",
        slug: "gran",
        nameKo: "그랑",
      },
    ],
  };
}

describe("normalizeMappedRecords", () => {
  it("stores mapped records as staged with complete provenance", () => {
    const connection = openDatabase({ path: ":memory:" });
    openConnections.push(connection);
    applyMigrations(connection.sqlite);
    const stagingImport = createStagingImport();
    importStagingRecords(connection.db, stagingImport);

    const result = normalizeMappedRecords(
      connection.db,
      createNormalization(stagingImport.importRunId),
    );
    const stored = connection.sqlite.prepare("SELECT * FROM normalized_records").get();

    expect(result).toMatchObject({ reused: false, recordCount: 1, unmappedRecordCount: 1 });
    expect(stored).toMatchObject({
      category: "character",
      id: "character-10",
      slug: "gran",
      name_ko: "그랑",
      review_state: "staged",
      source_table: "chara",
      source_file_id: "system/table/chara.tbl",
      source_record_id: "1",
      extractor_version: "2.0.0",
      import_run_id: stagingImport.importRunId,
      imported_at: stagingImport.importedAt,
      schema_version: 1,
    });
  });

  it("reuses a logically identical normalization without duplicating records", () => {
    const connection = openDatabase({ path: ":memory:" });
    openConnections.push(connection);
    applyMigrations(connection.sqlite);
    const stagingImport = createStagingImport();
    importStagingRecords(connection.db, stagingImport);

    const first = normalizeMappedRecords(
      connection.db,
      createNormalization(stagingImport.importRunId),
    );
    const second = normalizeMappedRecords(connection.db, {
      ...createNormalization(stagingImport.importRunId),
      normalizedAt: "2026-07-15T02:00:00.000Z",
    });

    expect(second).toMatchObject({ normalizationRunId: first.normalizationRunId, reused: true });
    expect(
      connection.sqlite.prepare("SELECT count(*) AS count FROM normalization_runs").get(),
    ).toEqual({
      count: 1,
    });
    expect(
      connection.sqlite.prepare("SELECT count(*) AS count FROM normalized_records").get(),
    ).toEqual({
      count: 1,
    });
  });

  it("fails atomically when a mapping does not reference the selected import", () => {
    const connection = openDatabase({ path: ":memory:" });
    openConnections.push(connection);
    applyMigrations(connection.sqlite);
    const stagingImport = createStagingImport();
    importStagingRecords(connection.db, stagingImport);
    const input = createNormalization(stagingImport.importRunId);
    const [firstRecord] = input.records;
    if (!firstRecord) {
      throw new Error("The normalization fixture must contain a record.");
    }
    firstRecord.sourceRecordId = "missing";

    expect(() => normalizeMappedRecords(connection.db, input)).toThrow(NormalizationError);
    expect(
      connection.sqlite.prepare("SELECT count(*) AS count FROM normalization_runs").get(),
    ).toEqual({
      count: 0,
    });
  });

  it("rejects duplicate category slugs before writing", () => {
    const connection = openDatabase({ path: ":memory:" });
    openConnections.push(connection);
    applyMigrations(connection.sqlite);
    const stagingImport = createStagingImport();
    importStagingRecords(connection.db, stagingImport);
    const input = createNormalization(stagingImport.importRunId);
    input.records.push({
      sourceTable: "chara",
      sourceRecordId: "2",
      id: "character-11",
      slug: "gran",
      nameKo: "지타",
    });

    try {
      normalizeMappedRecords(connection.db, input);
      throw new Error("The invalid normalization input should have failed.");
    } catch (error) {
      expect(error).toMatchObject({ code: "NORMALIZATION_INPUT_INVALID" });
      expect(String(error)).toContain("records.1: slug 매핑이 중복되었습니다.");
    }
  });

  it("reports unsafe record IDs with a stable normalization error", () => {
    const connection = openDatabase({ path: ":memory:" });
    openConnections.push(connection);
    applyMigrations(connection.sqlite);
    const stagingImport = createStagingImport();
    importStagingRecords(connection.db, stagingImport);
    const input = createNormalization(stagingImport.importRunId);
    const [firstRecord] = input.records;
    if (!firstRecord) {
      throw new Error("The normalization fixture must contain a record.");
    }
    firstRecord.id = "character\n10";

    try {
      normalizeMappedRecords(connection.db, input);
      throw new Error("The invalid normalization input should have failed.");
    } catch (error) {
      expect(error).toMatchObject({ code: "NORMALIZATION_INPUT_INVALID" });
      expect(String(error)).toContain("records.0.id: 식별자는 제어 문자를 포함할 수 없습니다.");
    }
  });
});
