import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations, openDatabase } from "./index";
import { importStagingRecords } from "./staging-import-repository";

const openConnections: ReturnType<typeof openDatabase>[] = [];

afterEach(() => {
  for (const connection of openConnections.splice(0)) {
    connection.sqlite.close();
  }
});

function createImport() {
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
        rawPayload: { CharacterId: 10, InternalName: "pl0000" },
        payloadHash: "b".repeat(64),
      },
    ],
    warnings: [
      {
        code: "SKILL_TABLE_INCOMPATIBLE",
        sourceFileId: "system/table/skill.tbl",
        message: "호환되지 않는 테이블입니다.",
      },
    ],
  };
}

describe("importStagingRecords", () => {
  it("stores private rows with provenance and structured warnings", () => {
    const connection = openDatabase({ path: ":memory:" });
    openConnections.push(connection);
    applyMigrations(connection.sqlite);

    const candidateImport = createImport();
    const result = importStagingRecords(connection.db, candidateImport);
    const storedRecord = connection.sqlite.prepare("SELECT * FROM staging_records").get() as Record<
      string,
      unknown
    >;
    const storedWarning = connection.sqlite
      .prepare("SELECT * FROM import_warnings")
      .get() as Record<string, unknown>;

    expect(result).toMatchObject({ reused: false, recordCount: 1, warningCount: 1 });
    expect(storedRecord).toMatchObject({
      import_run_id: candidateImport.importRunId,
      source_file_id: "system/table/chara.tbl",
      source_record_id: "1",
    });
    expect(JSON.parse(String(storedRecord.payload_json))).toEqual(
      candidateImport.records[0]?.rawPayload,
    );
    expect(storedWarning).toMatchObject({
      import_run_id: candidateImport.importRunId,
      code: "SKILL_TABLE_INCOMPATIBLE",
      source_file_id: "system/table/skill.tbl",
    });
  });

  it("reuses the original run when the same input fingerprint is imported again", () => {
    const connection = openDatabase({ path: ":memory:" });
    openConnections.push(connection);
    applyMigrations(connection.sqlite);

    const firstImport = createImport();
    const secondImport = { ...createImport(), inputFingerprint: firstImport.inputFingerprint };
    const firstResult = importStagingRecords(connection.db, firstImport);
    const secondResult = importStagingRecords(connection.db, secondImport);

    expect(secondResult).toMatchObject({ importRunId: firstResult.importRunId, reused: true });
    expect(connection.sqlite.prepare("SELECT count(*) AS count FROM import_runs").get()).toEqual({
      count: 1,
    });
    expect(
      connection.sqlite.prepare("SELECT count(*) AS count FROM staging_records").get(),
    ).toEqual({ count: 1 });
  });
});
