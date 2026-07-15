import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptNormalizationRun,
  applyMigrations,
  getAcceptedNormalizationBaseline,
  importStagingRecords,
  normalizeMappedRecords,
  openDatabase,
} from "./index";

const openConnections: ReturnType<typeof openDatabase>[] = [];
const firstBackup = {
  reference: "NAS-20260715T020000Z",
  createdAt: "2026-07-15T02:00:00.000Z",
  sha256: "a".repeat(64),
};

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

function createNormalizationRun(
  connection: ReturnType<typeof openDatabase>,
  schemaVersion: number,
  nameKo: string,
) {
  const importRunId = randomUUID();
  importStagingRecords(connection.db, {
    importRunId,
    inputFingerprint: randomUUID().replaceAll("-", "").padEnd(64, "0"),
    extractorVersion: "2.0.0",
    importedAt: "2026-07-15T00:00:00.000Z",
    schemaVersion: 1,
    records: [
      {
        sourceTable: "chara",
        sourceFileId: "system/table/chara.tbl",
        sourceRecordId: "1",
        rawPayload: { fixture: nameKo },
        payloadHash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
      },
    ],
    warnings: [],
  });
  return normalizeMappedRecords(connection.db, {
    normalizationRunId: randomUUID(),
    importRunId,
    normalizedAt: "2026-07-15T01:00:00.000Z",
    schemaVersion,
    records: [
      {
        sourceTable: "chara",
        sourceRecordId: "1",
        id: "character-1",
        slug: "gran",
        nameKo,
      },
    ],
  });
}

describe("normalization acceptance", () => {
  it("accepts a run with backup evidence and marks its records reviewed", () => {
    const connection = createConnection();
    const run = createNormalizationRun(connection, 1, "그랑");

    const result = acceptNormalizationRun(connection.db, {
      normalizationRunId: run.normalizationRunId,
      acceptedAt: "2026-07-15T02:10:00.000Z",
      expectedBaselineNormalizationRunId: null,
      backup: firstBackup,
    });

    expect(result).toMatchObject({ reused: false, reviewedRecordCount: 1 });
    expect(result.acceptance).toMatchObject({
      normalizationRunId: run.normalizationRunId,
      schemaVersion: 1,
      previousBaselineNormalizationRunId: null,
      backup: firstBackup,
    });
    expect(getAcceptedNormalizationBaseline(connection.db, 1)).toMatchObject({
      normalizationRunId: run.normalizationRunId,
      backup: firstBackup,
    });
    expect(
      connection.sqlite
        .prepare("SELECT review_state FROM normalized_records WHERE normalization_run_id = ?")
        .get(run.normalizationRunId),
    ).toEqual({ review_state: "reviewed" });
  });

  it("replaces a baseline only when the caller observed the current baseline", () => {
    const connection = createConnection();
    const first = createNormalizationRun(connection, 1, "그랑");
    const second = createNormalizationRun(connection, 1, "그랑 (주인공)");
    acceptNormalizationRun(connection.db, {
      normalizationRunId: first.normalizationRunId,
      acceptedAt: "2026-07-15T02:10:00.000Z",
      expectedBaselineNormalizationRunId: null,
      backup: firstBackup,
    });
    const secondBackup = {
      reference: "NAS-20260715T030000Z",
      createdAt: "2026-07-15T03:00:00.000Z",
      sha256: "b".repeat(64),
    };

    const result = acceptNormalizationRun(connection.db, {
      normalizationRunId: second.normalizationRunId,
      acceptedAt: "2026-07-15T03:10:00.000Z",
      expectedBaselineNormalizationRunId: first.normalizationRunId,
      backup: secondBackup,
    });

    expect(result.acceptance.previousBaselineNormalizationRunId).toBe(first.normalizationRunId);
    expect(getAcceptedNormalizationBaseline(connection.db, 1)).toMatchObject({
      normalizationRunId: second.normalizationRunId,
      backup: secondBackup,
    });
    expect(
      connection.sqlite.prepare("SELECT count(*) AS count FROM normalization_acceptances").get(),
    ).toEqual({ count: 2 });
  });

  it("rejects a stale baseline without persisting review changes", () => {
    const connection = createConnection();
    const first = createNormalizationRun(connection, 1, "그랑");
    const second = createNormalizationRun(connection, 1, "지타");
    acceptNormalizationRun(connection.db, {
      normalizationRunId: first.normalizationRunId,
      acceptedAt: "2026-07-15T02:10:00.000Z",
      expectedBaselineNormalizationRunId: null,
      backup: firstBackup,
    });

    expect(() =>
      acceptNormalizationRun(connection.db, {
        normalizationRunId: second.normalizationRunId,
        acceptedAt: "2026-07-15T03:10:00.000Z",
        expectedBaselineNormalizationRunId: null,
        backup: { ...firstBackup, reference: "NAS-20260715T030000Z" },
      }),
    ).toThrow(expect.objectContaining({ code: "NORMALIZATION_BASELINE_CHANGED" }));
    expect(
      connection.sqlite
        .prepare("SELECT review_state FROM normalized_records WHERE normalization_run_id = ?")
        .get(second.normalizationRunId),
    ).toEqual({ review_state: "staged" });
    expect(
      connection.sqlite.prepare("SELECT count(*) AS count FROM normalization_acceptances").get(),
    ).toEqual({ count: 1 });
  });

  it("reuses the exact same acceptance request", () => {
    const connection = createConnection();
    const run = createNormalizationRun(connection, 1, "그랑");
    const input = {
      normalizationRunId: run.normalizationRunId,
      acceptedAt: "2026-07-15T02:10:00.000Z",
      expectedBaselineNormalizationRunId: null,
      backup: firstBackup,
    };

    acceptNormalizationRun(connection.db, input);
    expect(acceptNormalizationRun(connection.db, input)).toMatchObject({
      reused: true,
      reviewedRecordCount: 1,
    });
  });

  it("rejects missing or unsafe backup evidence before writing", () => {
    const connection = createConnection();
    const run = createNormalizationRun(connection, 1, "그랑");

    expect(() =>
      acceptNormalizationRun(connection.db, {
        normalizationRunId: run.normalizationRunId,
        acceptedAt: "2026-07-15T02:10:00.000Z",
        expectedBaselineNormalizationRunId: null,
        backup: { ...firstBackup, reference: "//nas/private/database.sqlite" },
      }),
    ).toThrow(expect.objectContaining({ code: "NORMALIZATION_REVIEW_INPUT_INVALID" }));
    expect(
      connection.sqlite.prepare("SELECT count(*) AS count FROM normalization_acceptances").get(),
    ).toEqual({ count: 0 });
  });

  it("does not expose private identifiers when the run is missing", () => {
    const connection = createConnection();
    const missingRunId = randomUUID();
    const privateBackupReference = "NAS-private-backup-20260715";

    try {
      acceptNormalizationRun(connection.db, {
        normalizationRunId: missingRunId,
        acceptedAt: "2026-07-15T02:10:00.000Z",
        expectedBaselineNormalizationRunId: null,
        backup: { ...firstBackup, reference: privateBackupReference },
      });
      throw new Error("The missing normalization run should have failed.");
    } catch (error) {
      expect(error).toMatchObject({ code: "NORMALIZATION_RUN_NOT_FOUND" });
      expect(String(error)).not.toContain(missingRunId);
      expect(String(error)).not.toContain(privateBackupReference);
    }
  });

  it("keeps independent baselines for different schema versions", () => {
    const connection = createConnection();
    const first = createNormalizationRun(connection, 1, "그랑");
    const second = createNormalizationRun(connection, 2, "그랑");

    acceptNormalizationRun(connection.db, {
      normalizationRunId: first.normalizationRunId,
      acceptedAt: "2026-07-15T02:10:00.000Z",
      expectedBaselineNormalizationRunId: null,
      backup: firstBackup,
    });
    acceptNormalizationRun(connection.db, {
      normalizationRunId: second.normalizationRunId,
      acceptedAt: "2026-07-15T02:20:00.000Z",
      expectedBaselineNormalizationRunId: null,
      backup: { ...firstBackup, reference: "NAS-20260715T021500Z" },
    });

    expect(getAcceptedNormalizationBaseline(connection.db, 1)?.normalizationRunId).toBe(
      first.normalizationRunId,
    );
    expect(getAcceptedNormalizationBaseline(connection.db, 2)?.normalizationRunId).toBe(
      second.normalizationRunId,
    );
  });
});
