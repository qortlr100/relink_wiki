import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptFullyReviewedNormalizationRun,
  acceptNormalizationRun,
  applyMigrations,
  getNormalizationReviewWorkspace,
  importStagingRecords,
  normalizeMappedRecords,
  openDatabase,
  saveNormalizationRecordReviewDecision,
} from "./index";

const openConnections: ReturnType<typeof openDatabase>[] = [];
const firstBackup = {
  reference: "NAS-20260717T010000Z",
  createdAt: "2026-07-17T01:00:00.000Z",
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

function createRun(
  connection: ReturnType<typeof openDatabase>,
  normalizedAt: string,
  records: {
    sourceTable: "chara" | "weapon" | "gem" | "ability";
    sourceRecordId: string;
    id: string;
    slug: string;
    nameKo: string;
  }[],
) {
  const importRunId = randomUUID();
  importStagingRecords(connection.db, {
    importRunId,
    inputFingerprint: randomUUID().replaceAll("-", "").padEnd(64, "0"),
    extractorVersion: "2.0.0",
    importedAt: normalizedAt,
    schemaVersion: 1,
    records: records.map((record, index) => ({
      sourceTable: record.sourceTable,
      sourceFileId: `system/table/${record.sourceTable}.tbl`,
      sourceRecordId: record.sourceRecordId,
      rawPayload: { fixture: record.nameKo },
      payloadHash: String(index + 1).repeat(64),
    })),
    warnings: [],
  });
  return normalizeMappedRecords(connection.db, {
    normalizationRunId: randomUUID(),
    importRunId,
    normalizedAt,
    schemaVersion: 1,
    records,
  });
}

function setupComparison(connection: ReturnType<typeof openDatabase>) {
  const baseline = createRun(connection, "2026-07-17T01:10:00.000Z", [
    {
      sourceTable: "chara",
      sourceRecordId: "source-character-1",
      id: "character-1",
      slug: "gran",
      nameKo: "그랑",
    },
    {
      sourceTable: "weapon",
      sourceRecordId: "source-weapon-1",
      id: "weapon-1",
      slug: "sword",
      nameKo: "검",
    },
    {
      sourceTable: "gem",
      sourceRecordId: "source-sigil-1",
      id: "sigil-1",
      slug: "attack",
      nameKo: "공격",
    },
  ]);
  acceptNormalizationRun(connection.db, {
    normalizationRunId: baseline.normalizationRunId,
    acceptedAt: "2026-07-17T01:20:00.000Z",
    expectedBaselineNormalizationRunId: null,
    backup: firstBackup,
  });
  const candidate = createRun(connection, "2026-07-17T02:10:00.000Z", [
    {
      sourceTable: "chara",
      sourceRecordId: "source-character-1",
      id: "character-1",
      slug: "gran",
      nameKo: "그랑 (주인공)",
    },
    {
      sourceTable: "gem",
      sourceRecordId: "source-sigil-1",
      id: "sigil-1",
      slug: "attack",
      nameKo: "공격",
    },
    {
      sourceTable: "ability",
      sourceRecordId: "source-skill-1",
      id: "skill-1",
      slug: "reginleiv",
      nameKo: "레긴레이브",
    },
  ]);
  return { baseline, candidate };
}

function readyWorkspace(connection: ReturnType<typeof openDatabase>) {
  const workspace = getNormalizationReviewWorkspace(connection.db);
  expect(workspace.status).toBe("ready");
  if (workspace.status !== "ready") {
    throw new Error("Expected a ready review workspace.");
  }
  return workspace;
}

describe("normalization record review workflow", () => {
  it("returns only public comparison values and tracks per-record decisions", () => {
    const connection = createConnection();
    const { baseline, candidate } = setupComparison(connection);
    const workspace = readyWorkspace(connection);

    expect(workspace.summary).toEqual({ added: 1, changed: 1, removed: 1, unchanged: 1 });
    expect(workspace.decisionSummary).toEqual({ pending: 3, approved: 0, rejected: 0 });
    expect(JSON.stringify(workspace)).not.toContain(baseline.normalizationRunId);
    expect(JSON.stringify(workspace)).not.toContain(candidate.normalizationRunId);
    expect(JSON.stringify(workspace)).not.toContain("source-character-1");

    const changed = workspace.records.find((record) => record.status === "changed");
    if (!changed) {
      throw new Error("Expected a changed record.");
    }
    const updated = saveNormalizationRecordReviewDecision(connection.db, {
      comparisonFingerprint: workspace.comparisonFingerprint,
      recordIndex: changed.recordIndex,
      decision: "approved",
      note: "표시명 변경 확인",
      decidedAt: "2026-07-17T02:20:00.000Z",
    });

    expect(updated).toMatchObject({
      status: "ready",
      decisionSummary: { pending: 2, approved: 1, rejected: 0 },
    });
  });

  it("blocks acceptance until all changed records are approved", () => {
    const connection = createConnection();
    setupComparison(connection);
    let workspace = readyWorkspace(connection);
    const [first, ...remaining] = workspace.records;
    if (!first) {
      throw new Error("Expected actionable records.");
    }
    const rejectedWorkspace = saveNormalizationRecordReviewDecision(connection.db, {
      comparisonFingerprint: workspace.comparisonFingerprint,
      recordIndex: first.recordIndex,
      decision: "rejected",
      note: "수정 후 다시 정규화",
      decidedAt: "2026-07-17T02:20:00.000Z",
    });
    if (rejectedWorkspace.status !== "ready") {
      throw new Error("Expected the rejected decision to keep the workspace ready.");
    }
    workspace = rejectedWorkspace;
    for (const record of remaining) {
      const nextWorkspace = saveNormalizationRecordReviewDecision(connection.db, {
        comparisonFingerprint: workspace.comparisonFingerprint,
        recordIndex: record.recordIndex,
        decision: "approved",
        note: null,
        decidedAt: "2026-07-17T02:21:00.000Z",
      });
      if (nextWorkspace.status !== "ready") {
        throw new Error("Expected the approved decision to keep the workspace ready.");
      }
      workspace = nextWorkspace;
    }

    expect(() =>
      acceptFullyReviewedNormalizationRun(connection.db, {
        comparisonFingerprint: workspace.comparisonFingerprint,
        acceptedAt: "2026-07-17T02:40:00.000Z",
        backup: {
          reference: "NAS-20260717T023000Z",
          createdAt: "2026-07-17T02:30:00.000Z",
          sha256: "b".repeat(64),
        },
      }),
    ).toThrow(expect.objectContaining({ code: "NORMALIZATION_RECORD_REVIEW_REJECTED" }));

    const approvedWorkspace = saveNormalizationRecordReviewDecision(connection.db, {
      comparisonFingerprint: workspace.comparisonFingerprint,
      recordIndex: first.recordIndex,
      decision: "approved",
      note: "재검토 완료",
      decidedAt: "2026-07-17T02:35:00.000Z",
    });
    if (approvedWorkspace.status !== "ready") {
      throw new Error("Expected the final decision to keep the workspace ready.");
    }
    workspace = approvedWorkspace;
    const result = acceptFullyReviewedNormalizationRun(connection.db, {
      comparisonFingerprint: workspace.comparisonFingerprint,
      acceptedAt: "2026-07-17T02:40:00.000Z",
      backup: {
        reference: "NAS-20260717T023000Z",
        createdAt: "2026-07-17T02:30:00.000Z",
        sha256: "b".repeat(64),
      },
    });

    expect(result).toMatchObject({ reused: false, reviewedRecordCount: 3 });
    expect(getNormalizationReviewWorkspace(connection.db)).toEqual({
      status: "empty",
      message: "검수할 최신 staged normalization 후보가 없습니다.",
    });
  });

  it("rejects a decision from a stale comparison after a newer candidate arrives", () => {
    const connection = createConnection();
    setupComparison(connection);
    const workspace = readyWorkspace(connection);
    createRun(connection, "2026-07-17T03:10:00.000Z", [
      {
        sourceTable: "chara",
        sourceRecordId: "source-character-1",
        id: "character-1",
        slug: "gran",
        nameKo: "그랑 최신",
      },
    ]);

    expect(() =>
      saveNormalizationRecordReviewDecision(connection.db, {
        comparisonFingerprint: workspace.comparisonFingerprint,
        recordIndex: workspace.records[0]?.recordIndex ?? 0,
        decision: "approved",
        note: null,
        decidedAt: "2026-07-17T03:20:00.000Z",
      }),
    ).toThrow(expect.objectContaining({ code: "NORMALIZATION_RECORD_REVIEW_COMPARISON_STALE" }));
  });
});
