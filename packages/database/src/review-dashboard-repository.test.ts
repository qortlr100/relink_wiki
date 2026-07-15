import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptNormalizationRun,
  applyMigrations,
  getReviewDashboard,
  importStagingRecords,
  normalizeMappedRecords,
  openDatabase,
} from "./index";

const openConnections: ReturnType<typeof openDatabase>[] = [];

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

function createRun(
  connection: ReturnType<typeof openDatabase>,
  normalizedAt: string,
  schemaVersion = 1,
) {
  const importRunId = randomUUID();
  const normalizationRunId = randomUUID();
  const records = [
    { sourceTable: "chara", id: "character-1", slug: "gran" },
    { sourceTable: "weapon", id: "weapon-1", slug: "sword" },
    { sourceTable: "gem", id: "sigil-1", slug: "attack" },
    { sourceTable: "ability", id: "skill-1", slug: "reginleiv" },
  ] as const;
  importStagingRecords(connection.db, {
    importRunId,
    inputFingerprint: randomUUID().replaceAll("-", "").padEnd(64, "0"),
    extractorVersion: "2.0.0",
    importedAt: "2026-07-15T00:00:00.000Z",
    schemaVersion,
    records: records.map((record, index) => ({
      sourceTable: record.sourceTable,
      sourceFileId: `private/${record.sourceTable}.tbl`,
      sourceRecordId: String(index + 1),
      rawPayload: { secret: record.id },
      payloadHash: String(index + 1).repeat(64),
    })),
    warnings: [],
  });
  normalizeMappedRecords(connection.db, {
    normalizationRunId,
    importRunId,
    normalizedAt,
    schemaVersion,
    records: records.map((record, index) => ({
      sourceTable: record.sourceTable,
      sourceRecordId: String(index + 1),
      id: record.id,
      slug: record.slug,
      nameKo: `이름 ${String(index + 1)}`,
    })),
  });
  return normalizationRunId;
}

describe("review dashboard repository", () => {
  it("returns only aggregate run and accepted-baseline status", () => {
    const connection = createConnection();
    createRun(connection, "2026-07-15T01:00:00.000Z");
    const acceptedRunId = createRun(connection, "2026-07-15T02:00:00.000Z");
    acceptNormalizationRun(connection.db, {
      normalizationRunId: acceptedRunId,
      acceptedAt: "2026-07-15T03:00:00.000Z",
      expectedBaselineNormalizationRunId: null,
      backup: {
        reference: "NAS-20260715T025000Z",
        createdAt: "2026-07-15T02:50:00.000Z",
        sha256: "a".repeat(64),
      },
    });

    const dashboard = getReviewDashboard(connection.db);

    expect(dashboard.normalizationRuns).toHaveLength(2);
    expect(dashboard.normalizationRuns[0]).toMatchObject({
      normalizedAt: "2026-07-15T02:00:00.000Z",
      isCurrentBaseline: true,
      categoryCounts: { character: 1, weapon: 1, sigil: 1, skill: 1 },
      reviewStateCounts: { staged: 0, reviewed: 4, published: 0 },
    });
    expect(dashboard.currentBaseline).toMatchObject({
      acceptedAt: "2026-07-15T03:00:00.000Z",
      backup: { reference: "NAS-20260715T025000Z", sha256: "a".repeat(64) },
    });
    expect(JSON.stringify(dashboard)).not.toContain("private/");
    expect(JSON.stringify(dashboard)).not.toContain("secret");
    expect(JSON.stringify(dashboard)).not.toContain(acceptedRunId);
  });

  it("keeps the current baseline aligned with the supported publication schema", () => {
    const connection = createConnection();
    const versionOneRunId = createRun(connection, "2026-07-15T01:00:00.000Z");
    acceptNormalizationRun(connection.db, {
      normalizationRunId: versionOneRunId,
      acceptedAt: "2026-07-15T02:00:00.000Z",
      expectedBaselineNormalizationRunId: null,
      backup: {
        reference: "NAS-V1",
        createdAt: "2026-07-15T01:50:00.000Z",
        sha256: "a".repeat(64),
      },
    });
    const versionTwoRunId = createRun(connection, "2026-07-15T03:00:00.000Z", 2);
    acceptNormalizationRun(connection.db, {
      normalizationRunId: versionTwoRunId,
      acceptedAt: "2026-07-15T04:00:00.000Z",
      expectedBaselineNormalizationRunId: null,
      backup: {
        reference: "NAS-V2",
        createdAt: "2026-07-15T03:50:00.000Z",
        sha256: "b".repeat(64),
      },
    });

    expect(getReviewDashboard(connection.db).currentBaseline).toMatchObject({
      schemaVersion: 1,
      acceptedAt: "2026-07-15T02:00:00.000Z",
      backup: { reference: "NAS-V1" },
    });
  });

  it("reports the current publication revision and category counts", () => {
    const connection = createConnection();
    const normalizationRunId = createRun(connection, "2026-07-15T02:00:00.000Z");
    acceptNormalizationRun(connection.db, {
      normalizationRunId,
      acceptedAt: "2026-07-15T03:00:00.000Z",
      expectedBaselineNormalizationRunId: null,
      backup: {
        reference: "NAS-20260715T025000Z",
        createdAt: "2026-07-15T02:50:00.000Z",
        sha256: "a".repeat(64),
      },
    });
    const publicationId = randomUUID();
    connection.sqlite
      .prepare(
        `INSERT INTO public_snapshot_publications (
          id, normalization_run_id, schema_version, published_at, snapshot_generated_at,
          content_revision, source_revision, output_sha256, record_count,
          previous_content_revision, backup_reference, backup_created_at, backup_sha256
        ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, 4, NULL, ?, ?, ?)`,
      )
      .run(
        publicationId,
        normalizationRunId,
        "2026-07-15T04:00:00.000Z",
        "2026-07-15T03:30:00.000Z",
        "b".repeat(64),
        "c".repeat(64),
        "d".repeat(64),
        "NAS-20260715T035000Z",
        "2026-07-15T03:50:00.000Z",
        "e".repeat(64),
      );
    connection.sqlite
      .prepare(
        "INSERT INTO current_public_snapshot_publications (schema_version, publication_id, content_revision, published_at) VALUES (1, ?, ?, ?)",
      )
      .run(publicationId, "b".repeat(64), "2026-07-15T04:00:00.000Z");

    expect(getReviewDashboard(connection.db).currentPublication).toEqual({
      schemaVersion: 1,
      publishedAt: "2026-07-15T04:00:00.000Z",
      contentRevision: "b".repeat(64),
      recordCount: 4,
      categoryCounts: { character: 1, weapon: 1, sigil: 1, skill: 1 },
    });
  });
});
