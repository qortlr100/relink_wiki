import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptNormalizationRun,
  applyMigrations,
  importStagingRecords,
  normalizeMappedRecords,
  openDatabase,
} from "@relink-wiki/database";
import { createPublicSnapshotPreview } from "./index";
import { runPublicSnapshotPublicationCommand } from "./publication-command";

const temporaryDirectories: string[] = [];
const importRunId = "11111111-1111-4111-8111-111111111111";
const normalizationRunId = "22222222-2222-4222-8222-222222222222";
const publicationId = "33333333-3333-4333-8333-333333333333";

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createAcceptedBaseline(databasePath: string) {
  const connection = openDatabase({ path: databasePath });
  applyMigrations(connection.sqlite);
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
      sha256: "b".repeat(64),
    },
  });
  const snapshot = createPublicSnapshotPreview(connection.db, {
    schemaVersion: 1,
    generatedAt: "2026-07-15T03:00:00.000Z",
  });
  connection.sqlite.close();
  return snapshot;
}

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), "relink-publication-command-"));
  temporaryDirectories.push(directory);
  const databasePath = join(directory, "relink.sqlite");
  const reviewedSnapshotPath = join(directory, "public-snapshot-preview.v1.json");
  const outputDirectory = join(directory, "candidate");
  const requestPath = join(directory, "publication-request.v1.json");
  mkdirSync(outputDirectory);

  const snapshot = createAcceptedBaseline(databasePath);
  const serializedSnapshot = `${JSON.stringify(snapshot, null, 2)}\n`;
  writeFileSync(reviewedSnapshotPath, serializedSnapshot, "utf8");
  const request = {
    confirmation: "PUBLISH_REVIEWED_PUBLIC_SNAPSHOT_V1",
    publicationId,
    reviewedSnapshotPath,
    reviewedSnapshotSha256: sha256(serializedSnapshot),
    reviewedContentRevision: snapshot.contentRevision,
    outputDirectory,
    writtenAt: "2026-07-15T04:00:00.000Z",
    publishedAt: "2026-07-15T04:10:00.000Z",
    backup: {
      reference: "NAS-20260715T033000Z",
      createdAt: "2026-07-15T03:30:00.000Z",
      sha256: "c".repeat(64),
    },
    expectedCurrentContentRevision: null,
  };
  writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");
  return { databasePath, reviewedSnapshotPath, outputDirectory, requestPath, request, snapshot };
}

describe("public snapshot publication command", () => {
  it("publishes an explicitly confirmed reviewed snapshot without returning private paths", () => {
    const fixture = createFixture();

    const result = runPublicSnapshotPublicationCommand({
      databasePath: fixture.databasePath,
      requestPath: fixture.requestPath,
    });

    expect(result).toMatchObject({
      code: "PUBLIC_SNAPSHOT_PUBLICATION_COMPLETED",
      contentRevision: fixture.snapshot.contentRevision,
      publishedRecordCount: 4,
      snapshotReused: false,
      publicationReused: false,
    });
    expect(JSON.stringify(result)).not.toContain(fixture.databasePath);
    expect(JSON.stringify(result)).not.toContain(fixture.reviewedSnapshotPath);
    expect(JSON.stringify(result)).not.toContain(fixture.request.backup.reference);
    expect(
      JSON.parse(readFileSync(join(fixture.outputDirectory, "public-snapshot.v1.json"), "utf8")),
    ).toEqual(fixture.snapshot);

    const verification = openDatabase({ path: fixture.databasePath });
    expect(
      verification.sqlite.prepare("SELECT DISTINCT review_state FROM normalized_records").all(),
    ).toEqual([{ review_state: "published" }]);
    verification.sqlite.close();
  });

  it("reuses the exact request after both candidate write and database finalization", () => {
    const fixture = createFixture();
    const input = { databasePath: fixture.databasePath, requestPath: fixture.requestPath };

    runPublicSnapshotPublicationCommand(input);

    expect(runPublicSnapshotPublicationCommand(input)).toMatchObject({
      snapshotReused: true,
      publicationReused: true,
      publishedRecordCount: 4,
    });
  });

  it("refuses a snapshot changed after review before writing a candidate", () => {
    const fixture = createFixture();
    const changedSnapshot = { ...fixture.snapshot, generatedAt: "2026-07-15T03:00:01.000Z" };
    writeFileSync(
      fixture.reviewedSnapshotPath,
      `${JSON.stringify(changedSnapshot, null, 2)}\n`,
      "utf8",
    );

    expect(() =>
      runPublicSnapshotPublicationCommand({
        databasePath: fixture.databasePath,
        requestPath: fixture.requestPath,
      }),
    ).toThrow(expect.objectContaining({ code: "PUBLIC_SNAPSHOT_PUBLICATION_SNAPSHOT_CHANGED" }));
    expect(existsSync(join(fixture.outputDirectory, "public-snapshot.v1.json"))).toBe(false);
  });

  it("requires a backup completed after the accepted baseline", () => {
    const fixture = createFixture();
    const staleRequest = {
      ...fixture.request,
      backup: {
        ...fixture.request.backup,
        createdAt: "2026-07-15T01:59:59.000Z",
      },
    };
    writeFileSync(fixture.requestPath, `${JSON.stringify(staleRequest, null, 2)}\n`, "utf8");

    expect(() =>
      runPublicSnapshotPublicationCommand({
        databasePath: fixture.databasePath,
        requestPath: fixture.requestPath,
      }),
    ).toThrow(expect.objectContaining({ code: "PUBLIC_SNAPSHOT_PUBLICATION_BACKUP_STALE" }));
    expect(existsSync(join(fixture.outputDirectory, "public-snapshot.v1.json"))).toBe(false);
  });

  it("requires the literal publication confirmation token", () => {
    const fixture = createFixture();
    writeFileSync(
      fixture.requestPath,
      `${JSON.stringify({ ...fixture.request, confirmation: "preview-only" }, null, 2)}\n`,
      "utf8",
    );

    expect(() =>
      runPublicSnapshotPublicationCommand({
        databasePath: fixture.databasePath,
        requestPath: fixture.requestPath,
      }),
    ).toThrow(expect.objectContaining({ code: "PUBLIC_SNAPSHOT_PUBLICATION_REQUEST_INVALID" }));
  });
});
