import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptNormalizationRun,
  applyMigrations,
  finalizePublicSnapshotPublication,
  importStagingRecords,
  normalizeMappedRecords,
  openDatabase,
} from "@relink-wiki/database";
import { createPublicSnapshotPreview } from "./index";
import { writePublicSnapshot } from "./snapshot-writer";

const openConnections: ReturnType<typeof openDatabase>[] = [];
const temporaryDirectories: string[] = [];
const importRunId = "11111111-1111-4111-8111-111111111111";
const normalizationRunId = "22222222-2222-4222-8222-222222222222";
const publicationId = "33333333-3333-4333-8333-333333333333";
const backup = {
  reference: "NAS-20260715T040000Z",
  createdAt: "2026-07-15T04:00:00.000Z",
  sha256: "d".repeat(64),
};

afterEach(() => {
  for (const connection of openConnections.splice(0)) {
    connection.sqlite.close();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createConnection() {
  const connection = openDatabase({ path: ":memory:" });
  openConnections.push(connection);
  applyMigrations(connection.sqlite);
  return connection;
}

function createAcceptedBaseline(connection: ReturnType<typeof openDatabase>) {
  const records = [
    { sourceTable: "chara", category: "character", id: "character-1", slug: "gran" },
    { sourceTable: "weapon", category: "weapon", id: "weapon-1", slug: "sword" },
    { sourceTable: "gem", category: "sigil", id: "sigil-1", slug: "attack" },
    { sourceTable: "ability", category: "skill", id: "skill-1", slug: "reginleiv" },
  ] as const;
  importStagingRecords(connection.db, {
    importRunId,
    inputFingerprint: "a".repeat(64),
    extractorVersion: "2.0.0",
    importedAt: "2026-07-15T00:00:00.000Z",
    schemaVersion: 1,
    records: records.map((record, index) => ({
      sourceTable: record.sourceTable,
      sourceFileId: `system/table/${record.sourceTable}.tbl`,
      sourceRecordId: String(index + 1),
      rawPayload: { privateFixture: record.id },
      payloadHash: String(index + 1).repeat(64),
    })),
    warnings: [],
  });
  normalizeMappedRecords(connection.db, {
    normalizationRunId,
    importRunId,
    normalizedAt: "2026-07-15T01:00:00.000Z",
    schemaVersion: 1,
    records: records.map((record, index) => ({
      sourceTable: record.sourceTable,
      sourceRecordId: String(index + 1),
      id: record.id,
      slug: record.slug,
      nameKo: `공개 이름 ${String(index + 1)}`,
    })),
  });
  acceptNormalizationRun(connection.db, {
    normalizationRunId,
    acceptedAt: "2026-07-15T02:00:00.000Z",
    expectedBaselineNormalizationRunId: null,
    backup: {
      reference: "NAS-20260715T015000Z",
      createdAt: "2026-07-15T01:50:00.000Z",
      sha256: "c".repeat(64),
    },
  });
}

function createWrittenCandidate(connection: ReturnType<typeof openDatabase>) {
  const snapshot = createPublicSnapshotPreview(connection.db, {
    schemaVersion: 1,
    generatedAt: "2026-07-15T03:00:00.000Z",
  });
  const directory = mkdtempSync(join(tmpdir(), "relink-publication-history-"));
  temporaryDirectories.push(directory);
  const output = writePublicSnapshot({
    snapshot,
    outputDirectory: directory,
    writtenAt: "2026-07-15T04:10:00.000Z",
    backup,
    expectedCurrentContentRevision: null,
  });
  return { snapshot, output };
}

function createFinalizeInput(
  connection: ReturnType<typeof openDatabase>,
  overrides: Record<string, unknown> = {},
) {
  const candidate = createWrittenCandidate(connection);
  return {
    publicationId,
    ...candidate,
    publishedAt: "2026-07-15T04:20:00.000Z",
    backup,
    expectedCurrentContentRevision: null,
    ...overrides,
  };
}

describe("public snapshot publication history", () => {
  it("records the verified candidate and marks the accepted baseline published", () => {
    const connection = createConnection();
    createAcceptedBaseline(connection);
    const input = createFinalizeInput(connection);

    const result = finalizePublicSnapshotPublication(connection.db, input);

    expect(result).toMatchObject({ reused: false, publishedRecordCount: 4 });
    expect(result.publication).toMatchObject({
      id: publicationId,
      normalizationRunId,
      contentRevision: input.snapshot.contentRevision,
      outputSha256: input.output.outputSha256,
      previousContentRevision: null,
      backup,
    });
    expect(
      connection.sqlite.prepare("SELECT DISTINCT review_state FROM normalized_records").all(),
    ).toEqual([{ review_state: "published" }]);
    expect(
      connection.sqlite.prepare("SELECT count(*) AS count FROM public_snapshot_publications").get(),
    ).toEqual({ count: 1 });
    expect(
      connection.sqlite
        .prepare("SELECT content_revision FROM current_public_snapshot_publications")
        .get(),
    ).toEqual({ content_revision: input.snapshot.contentRevision });
  });

  it("reuses the exact completion request after the records are already published", () => {
    const connection = createConnection();
    createAcceptedBaseline(connection);
    const input = createFinalizeInput(connection);

    finalizePublicSnapshotPublication(connection.db, input);

    expect(finalizePublicSnapshotPublication(connection.db, input)).toMatchObject({
      reused: true,
      publishedRecordCount: 4,
    });
  });

  it("rejects a changed current publication without mutating history or review state", () => {
    const connection = createConnection();
    createAcceptedBaseline(connection);
    const input = createFinalizeInput(connection);
    connection.sqlite.exec(`
      INSERT INTO public_snapshot_publications (
        id, normalization_run_id, schema_version, published_at, snapshot_generated_at,
        content_revision, source_revision, output_sha256, record_count,
        previous_content_revision, backup_reference, backup_created_at, backup_sha256
      ) VALUES (
        '44444444-4444-4444-8444-444444444444', '${normalizationRunId}', 1,
        '2026-07-15T04:15:00.000Z', '2026-07-15T03:00:00.000Z',
        '${"e".repeat(64)}', '${input.snapshot.sourceRevision}', '${"f".repeat(64)}', 4,
        NULL, 'NAS-20260715T040000Z', '2026-07-15T04:00:00.000Z', '${"d".repeat(64)}'
      );
      INSERT INTO current_public_snapshot_publications (
        schema_version, publication_id, content_revision, published_at
      ) VALUES (
        1, '44444444-4444-4444-8444-444444444444', '${"e".repeat(64)}',
        '2026-07-15T04:15:00.000Z'
      );
    `);

    expect(() => finalizePublicSnapshotPublication(connection.db, input)).toThrow(
      expect.objectContaining({ code: "PUBLICATION_CURRENT_CHANGED" }),
    );
    expect(
      connection.sqlite.prepare("SELECT DISTINCT review_state FROM normalized_records").all(),
    ).toEqual([{ review_state: "reviewed" }]);
    expect(
      connection.sqlite.prepare("SELECT count(*) AS count FROM public_snapshot_publications").get(),
    ).toEqual({ count: 1 });
  });

  it("rejects snapshot content drift without exposing private identifiers", () => {
    const connection = createConnection();
    createAcceptedBaseline(connection);
    const input = createFinalizeInput(connection);
    const driftedInput = {
      ...input,
      snapshot: {
        ...input.snapshot,
        characters: [{ ...input.snapshot.characters[0], nameKo: "변조된 이름" }],
      },
    };

    try {
      finalizePublicSnapshotPublication(connection.db, driftedInput);
      throw new Error("The drifted snapshot should have failed.");
    } catch (error) {
      expect(error).toMatchObject({ code: "PUBLICATION_SNAPSHOT_CONTENT_INVALID" });
      expect(JSON.stringify(error)).not.toContain(normalizationRunId);
      expect(JSON.stringify(error)).not.toContain(backup.reference);
    }
    expect(
      connection.sqlite.prepare("SELECT count(*) AS count FROM public_snapshot_publications").get(),
    ).toEqual({ count: 0 });
  });

  it("rolls back when a reviewed record changes after the candidate write", () => {
    const connection = createConnection();
    createAcceptedBaseline(connection);
    const input = createFinalizeInput(connection);
    connection.sqlite
      .prepare("UPDATE normalized_records SET review_state = 'staged' WHERE id = 'character-1'")
      .run();

    expect(() => finalizePublicSnapshotPublication(connection.db, input)).toThrow(
      expect.objectContaining({ code: "PUBLICATION_REVIEW_STATE_INVALID" }),
    );
    expect(
      connection.sqlite.prepare("SELECT count(*) AS count FROM public_snapshot_publications").get(),
    ).toEqual({ count: 0 });
    expect(
      connection.sqlite
        .prepare(
          "SELECT review_state, count(*) AS count FROM normalized_records GROUP BY review_state",
        )
        .all(),
    ).toEqual([
      { review_state: "reviewed", count: 3 },
      { review_state: "staged", count: 1 },
    ]);
  });

  it("rejects reusing a publication identifier with different completion evidence", () => {
    const connection = createConnection();
    createAcceptedBaseline(connection);
    const input = createFinalizeInput(connection);
    finalizePublicSnapshotPublication(connection.db, input);

    expect(() =>
      finalizePublicSnapshotPublication(connection.db, {
        ...input,
        output: { ...input.output, outputSha256: "0".repeat(64) },
      }),
    ).toThrow(expect.objectContaining({ code: "PUBLICATION_ALREADY_RECORDED" }));
  });
});
