import { afterEach, describe, expect, it } from "vitest";
import {
  acceptNormalizationRun,
  applyMigrations,
  importStagingRecords,
  normalizeMappedRecords,
  openDatabase,
} from "@relink-wiki/database";
import { createPublicSnapshotPreview } from "./index";

const openConnections: ReturnType<typeof openDatabase>[] = [];
const importRunId = "11111111-1111-4111-8111-111111111111";
const normalizationRunId = "22222222-2222-4222-8222-222222222222";
const acceptedAt = "2026-07-15T02:10:00.000Z";

afterEach(() => {
  for (const connection of openConnections.splice(0)) {
    connection.sqlite.close();
  }
});

function createConnection() {
  const connection = openDatabase({ path: ":memory:" });
  openConnections.push(connection);
  applyMigrations(connection.sqlite);
  return connection;
}

function createAcceptedBaseline(connection: ReturnType<typeof openDatabase>) {
  const sourceRecords = [
    {
      sourceTable: "chara",
      sourceRecordId: "2",
      id: "character-2",
      slug: "djeeta",
      nameKo: "지타",
    },
    { sourceTable: "chara", sourceRecordId: "1", id: "character-1", slug: "gran", nameKo: "그랑" },
    { sourceTable: "weapon", sourceRecordId: "1", id: "weapon-1", slug: "sword", nameKo: "검" },
    { sourceTable: "gem", sourceRecordId: "1", id: "sigil-1", slug: "attack", nameKo: "공격력" },
    {
      sourceTable: "ability",
      sourceRecordId: "1",
      id: "skill-1",
      slug: "reginleiv",
      nameKo: "레긴레이브",
    },
  ] as const;

  importStagingRecords(connection.db, {
    importRunId,
    inputFingerprint: "a".repeat(64),
    extractorVersion: "2.0.0",
    importedAt: "2026-07-15T00:00:00.000Z",
    schemaVersion: 1,
    records: sourceRecords.map((record) => ({
      sourceTable: record.sourceTable,
      sourceFileId: `system/table/${record.sourceTable}.tbl`,
      sourceRecordId: record.sourceRecordId,
      rawPayload: { privateFixture: record.nameKo },
      payloadHash: "b".repeat(64),
    })),
    warnings: [],
  });
  normalizeMappedRecords(connection.db, {
    normalizationRunId,
    importRunId,
    normalizedAt: "2026-07-15T01:00:00.000Z",
    schemaVersion: 1,
    records: sourceRecords,
  });
  acceptNormalizationRun(connection.db, {
    normalizationRunId,
    acceptedAt,
    expectedBaselineNormalizationRunId: null,
    backup: {
      reference: "NAS-20260715T020000Z",
      createdAt: "2026-07-15T02:00:00.000Z",
      sha256: "c".repeat(64),
    },
  });
}

describe("public snapshot preview", () => {
  it("builds a deterministic allowlisted manifest from the accepted baseline", () => {
    const connection = createConnection();
    createAcceptedBaseline(connection);

    const preview = createPublicSnapshotPreview(connection.db, {
      schemaVersion: 1,
      generatedAt: "2026-07-15T03:00:00.000Z",
    });

    expect(preview).toMatchObject({
      schemaVersion: 1,
      extractor: { name: "GBFRDataTools", version: "2.0.0" },
      recordCounts: { characters: 2, weapons: 1, sigils: 1, skills: 1 },
    });
    expect(preview.characters.map((record) => record.id)).toEqual(["character-1", "character-2"]);
    expect(preview.characters.map((record) => record.reviewState)).toEqual([
      "published",
      "published",
    ]);
    expect(preview.contentRevision).toMatch(/^[0-9a-f]{64}$/);
    expect(preview.sourceRevision).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not expose private provenance or mutate reviewed records", () => {
    const connection = createConnection();
    createAcceptedBaseline(connection);

    const preview = createPublicSnapshotPreview(connection.db, {
      schemaVersion: 1,
      generatedAt: "2026-07-15T03:00:00.000Z",
    });
    const serialized = JSON.stringify(preview);

    expect(serialized).not.toContain("system/table");
    expect(serialized).not.toContain(importRunId);
    expect(serialized).not.toContain(normalizationRunId);
    expect(serialized).not.toContain("NAS-20260715T020000Z");
    expect(
      connection.sqlite.prepare("SELECT DISTINCT review_state FROM normalized_records").all(),
    ).toEqual([{ review_state: "reviewed" }]);
  });

  it("requires an accepted baseline", () => {
    const connection = createConnection();

    expect(() =>
      createPublicSnapshotPreview(connection.db, {
        schemaVersion: 1,
        generatedAt: "2026-07-15T03:00:00.000Z",
      }),
    ).toThrow(
      expect.objectContaining({
        code: "PUBLIC_SNAPSHOT_PREVIEW_SOURCE_INVALID",
        details: ["ACCEPTED_BASELINE_NOT_FOUND"],
      }),
    );
  });

  it("rejects a generation timestamp before baseline acceptance", () => {
    const connection = createConnection();
    createAcceptedBaseline(connection);

    expect(() =>
      createPublicSnapshotPreview(connection.db, {
        schemaVersion: 1,
        generatedAt: "2026-07-15T02:09:59.999Z",
      }),
    ).toThrow(
      expect.objectContaining({
        code: "PUBLIC_SNAPSHOT_PREVIEW_INPUT_INVALID",
        message: "공개 스냅샷은 baseline 승인 이후에 생성되어야 합니다.",
      }),
    );
  });

  it("rejects a drifted review state with privacy-safe category counts", () => {
    const connection = createConnection();
    createAcceptedBaseline(connection);
    connection.sqlite
      .prepare("UPDATE normalized_records SET review_state = 'staged' WHERE id = 'character-1'")
      .run();

    try {
      createPublicSnapshotPreview(connection.db, {
        schemaVersion: 1,
        generatedAt: "2026-07-15T03:00:00.000Z",
      });
      throw new Error("The drifted baseline should have failed.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "PUBLIC_SNAPSHOT_PREVIEW_SOURCE_INVALID",
        details: ["ACCEPTED_BASELINE_REVIEW_STATE_INVALID", "character: 1"],
      });
      expect(JSON.stringify(error)).not.toContain("character-1");
    }
  });
});
