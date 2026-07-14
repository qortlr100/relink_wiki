import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMigrations, importStagingRecords, openDatabase } from "@relink-wiki/database";
import { afterEach, describe, expect, it } from "vitest";
import {
  NormalizationMappingError,
  normalizeMappedDatabase,
  readMappedNormalizationConfig,
} from "./normalize-mapped";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "relink-normalize-"));
  temporaryRoots.push(root);
  const privateDirectory = join(root, "private");
  mkdirSync(privateDirectory);
  const targetDatabasePath = join(privateDirectory, "relink.sqlite");
  const mappingPath = join(privateDirectory, "normalization.json");
  const connection = openDatabase({ path: targetDatabasePath });
  applyMigrations(connection.sqlite);
  const importRunId = "7b6eb5c2-17bb-4c24-b4b0-701b080cd29b";
  importStagingRecords(connection.db, {
    importRunId,
    inputFingerprint: "a".repeat(64),
    extractorVersion: "2.0.0",
    importedAt: "2026-07-15T00:00:00.000Z",
    schemaVersion: 1,
    records: [
      {
        sourceTable: "chara",
        sourceFileId: "system/table/chara.tbl",
        sourceRecordId: "1",
        rawPayload: { CharacterId: 10 },
        payloadHash: "b".repeat(64),
      },
    ],
    warnings: [],
  });
  connection.sqlite.close();
  writeFileSync(
    mappingPath,
    JSON.stringify({
      importRunId,
      schemaVersion: 1,
      records: [
        {
          sourceTable: "chara",
          sourceRecordId: "1",
          id: "character-10",
          slug: "gran",
          nameKo: "그랑",
        },
      ],
    }),
  );
  return { targetDatabasePath, mappingPath };
}

describe("normalizeMappedDatabase", () => {
  it("reads a private mapping file and normalizes the selected import", () => {
    const config = createFixture();

    const first = normalizeMappedDatabase({ ...config, schemaVersion: 1 });
    const second = normalizeMappedDatabase({ ...config, schemaVersion: 1 });

    expect(first).toMatchObject({ reused: false, recordCount: 1, unmappedRecordCount: 0 });
    expect(second).toMatchObject({ normalizationRunId: first.normalizationRunId, reused: true });
  });

  it("reports an invalid mapping without exposing its private path", () => {
    const config = createFixture();
    writeFileSync(config.mappingPath, "not-json");

    expect(() => normalizeMappedDatabase({ ...config, schemaVersion: 1 })).toThrow(
      NormalizationMappingError,
    );
    try {
      normalizeMappedDatabase({ ...config, schemaVersion: 1 });
    } catch (error) {
      expect(String(error)).not.toContain(config.mappingPath);
    }
  });

  it("requires private database and mapping paths", () => {
    expect(() => readMappedNormalizationConfig({})).toThrow();
  });
});
