import { createHash } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import {
  backupReceiptSchema,
  normalizedDiffFieldSchema,
  normalizedDiffStatusSchema,
  normalizedDiffRecordValueSchema,
  normalizedRecordDiffSchema,
  recordReviewDecisionSchema,
  type NormalizedRecordDiff,
} from "@relink-wiki/domain";
import { z } from "zod";
import type { openDatabase } from "./index";
import { compareNormalizationRuns } from "./normalization-diff-repository";
import {
  acceptNormalizationRun,
  type AcceptNormalizationRunResult,
} from "./normalization-review-repository";
import {
  acceptedNormalizationBaselines,
  normalizationRecordReviewDecisions,
  normalizationReviewComparisons,
  normalizationRuns,
  normalizedRecords,
} from "./schema";

const fingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const decisionNoteSchema = z.string().trim().max(500).nullable();
const saveDecisionInputSchema = z
  .object({
    comparisonFingerprint: fingerprintSchema,
    recordIndex: z.int().nonnegative(),
    decision: recordReviewDecisionSchema,
    note: decisionNoteSchema,
    decidedAt: z.iso.datetime(),
  })
  .strict();
const acceptReviewedRunInputSchema = z
  .object({
    comparisonFingerprint: fingerprintSchema,
    acceptedAt: z.iso.datetime(),
    backup: backupReceiptSchema,
  })
  .strict();
const actionableStatusSchema = normalizedDiffStatusSchema.exclude(["unchanged"]);
const comparisonDiffSchema = z
  .object({
    schemaVersion: z.int().positive(),
    summary: z.object({
      added: z.int().nonnegative(),
      changed: z.int().nonnegative(),
      removed: z.int().nonnegative(),
      unchanged: z.int().nonnegative(),
    }),
    records: z.array(normalizedRecordDiffSchema),
  })
  .superRefine((diff, context) => {
    for (const status of normalizedDiffStatusSchema.options) {
      const actualCount = diff.records.filter((record) => record.status === status).length;
      if (diff.summary[status] !== actualCount) {
        context.addIssue({
          code: "custom",
          path: ["summary", status],
          message: "요약 건수가 레코드 비교 결과와 일치하지 않습니다.",
        });
      }
    }
  });
const reviewWorkspaceRecordSchema = z.object({
  recordIndex: z.int().nonnegative(),
  category: z.enum(["character", "weapon", "sigil", "skill"]),
  status: actionableStatusSchema,
  changedFields: z.array(normalizedDiffFieldSchema),
  baseline: normalizedDiffRecordValueSchema.nullable(),
  candidate: normalizedDiffRecordValueSchema.nullable(),
  decision: recordReviewDecisionSchema.nullable(),
  note: decisionNoteSchema,
  decidedAt: z.iso.datetime().nullable(),
});
const reviewWorkspaceSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("empty"),
    message: z.string().min(1),
  }),
  z.object({
    status: z.literal("ready"),
    comparisonFingerprint: fingerprintSchema,
    schemaVersion: z.int().positive(),
    candidateNormalizedAt: z.iso.datetime(),
    hasBaseline: z.boolean(),
    summary: z.object({
      added: z.int().nonnegative(),
      changed: z.int().nonnegative(),
      removed: z.int().nonnegative(),
      unchanged: z.int().nonnegative(),
    }),
    decisionSummary: z.object({
      pending: z.int().nonnegative(),
      approved: z.int().nonnegative(),
      rejected: z.int().nonnegative(),
    }),
    canAccept: z.boolean(),
    records: z.array(reviewWorkspaceRecordSchema),
  }),
]);

type RelinkDatabase = ReturnType<typeof openDatabase>["db"];
type RelinkTransaction = Parameters<Parameters<RelinkDatabase["transaction"]>[0]>[0];
type RelinkDatabaseExecutor = RelinkDatabase | RelinkTransaction;
type ActionableStatus = z.infer<typeof actionableStatusSchema>;
type ComparisonDiff = z.infer<typeof comparisonDiffSchema>;
export type NormalizationReviewWorkspace = z.infer<typeof reviewWorkspaceSchema>;

export type NormalizationRecordReviewErrorCode =
  | "NORMALIZATION_RECORD_REVIEW_INPUT_INVALID"
  | "NORMALIZATION_RECORD_REVIEW_DATABASE_INVALID"
  | "NORMALIZATION_RECORD_REVIEW_COMPARISON_STALE"
  | "NORMALIZATION_RECORD_REVIEW_RECORD_INVALID"
  | "NORMALIZATION_RECORD_REVIEW_INCOMPLETE"
  | "NORMALIZATION_RECORD_REVIEW_REJECTED";

export class NormalizationRecordReviewError extends Error {
  constructor(
    readonly code: NormalizationRecordReviewErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "NormalizationRecordReviewError";
  }
}

interface SelectedRun {
  id: string;
  normalizedAt: string;
  schemaVersion: number;
}

interface InternalComparison {
  baselineNormalizationRunId: string | null;
  candidate: SelectedRun;
  fingerprint: string;
  diff: ComparisonDiff;
}

function comparisonFingerprint(input: {
  baselineNormalizationRunId: string | null;
  candidateNormalizationRunId: string;
  diff: ComparisonDiff;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function decisionKey(record: Pick<NormalizedRecordDiff, "category" | "sourceRecordId">): string {
  return `${record.category}:${record.sourceRecordId}`;
}

function findCandidate(
  db: RelinkDatabaseExecutor,
  baselineNormalizationRunId: string | null,
): SelectedRun | null {
  const runs = db
    .select({
      id: normalizationRuns.id,
      normalizedAt: normalizationRuns.normalizedAt,
      schemaVersion: normalizationRuns.schemaVersion,
    })
    .from(normalizationRuns)
    .where(eq(normalizationRuns.schemaVersion, 1))
    .orderBy(desc(normalizationRuns.normalizedAt), desc(normalizationRuns.id))
    .all();

  for (const run of runs) {
    if (run.id === baselineNormalizationRunId) {
      continue;
    }
    const stagedRecordCount =
      db
        .select({ recordCount: count() })
        .from(normalizedRecords)
        .where(
          and(
            eq(normalizedRecords.normalizationRunId, run.id),
            eq(normalizedRecords.reviewState, "staged"),
          ),
        )
        .get()?.recordCount ?? 0;
    if (stagedRecordCount > 0) {
      return run;
    }
  }
  return null;
}

function createInitialDiff(db: RelinkDatabaseExecutor, candidate: SelectedRun): ComparisonDiff {
  const records: NormalizedRecordDiff[] = db
    .select({
      category: normalizedRecords.category,
      sourceRecordId: normalizedRecords.sourceRecordId,
      id: normalizedRecords.id,
      slug: normalizedRecords.slug,
      nameKo: normalizedRecords.nameKo,
    })
    .from(normalizedRecords)
    .where(eq(normalizedRecords.normalizationRunId, candidate.id))
    .orderBy(desc(normalizedRecords.category), desc(normalizedRecords.sourceRecordId))
    .all()
    .map((record) => ({
      category: record.category,
      sourceRecordId: record.sourceRecordId,
      status: "added" as const,
      changedFields: [],
      baseline: null,
      candidate: { id: record.id, slug: record.slug, nameKo: record.nameKo },
    }))
    .sort((left, right) => decisionKey(left).localeCompare(decisionKey(right)));

  return comparisonDiffSchema.parse({
    schemaVersion: candidate.schemaVersion,
    summary: { added: records.length, changed: 0, removed: 0, unchanged: 0 },
    records,
  });
}

function buildInternalComparison(db: RelinkDatabaseExecutor): InternalComparison | null {
  const baseline = db
    .select({ normalizationRunId: acceptedNormalizationBaselines.normalizationRunId })
    .from(acceptedNormalizationBaselines)
    .where(eq(acceptedNormalizationBaselines.schemaVersion, 1))
    .get();
  const baselineNormalizationRunId = baseline?.normalizationRunId ?? null;
  const candidate = findCandidate(db, baselineNormalizationRunId);
  if (!candidate) {
    return null;
  }
  const diff = baselineNormalizationRunId
    ? comparisonDiffSchema.parse(
        compareNormalizationRuns(db, {
          baselineNormalizationRunId,
          candidateNormalizationRunId: candidate.id,
        }),
      )
    : createInitialDiff(db, candidate);
  const fingerprint = comparisonFingerprint({
    baselineNormalizationRunId,
    candidateNormalizationRunId: candidate.id,
    diff,
  });
  return { baselineNormalizationRunId, candidate, fingerprint, diff };
}

function requireCurrentComparison(
  db: RelinkDatabaseExecutor,
  fingerprint: string,
): InternalComparison {
  const comparison = buildInternalComparison(db);
  if (comparison?.fingerprint !== fingerprint) {
    throw new NormalizationRecordReviewError(
      "NORMALIZATION_RECORD_REVIEW_COMPARISON_STALE",
      "검수 중 baseline 또는 최신 후보가 변경되었습니다. 비교 화면을 다시 확인하세요.",
    );
  }
  return comparison;
}

function readDecisionRows(db: RelinkDatabaseExecutor, comparison: InternalComparison) {
  const actionableRecords = comparison.diff.records.filter(
    (record): record is NormalizedRecordDiff & { status: ActionableStatus } =>
      record.status !== "unchanged",
  );
  const recordsByKey = new Map(actionableRecords.map((record) => [decisionKey(record), record]));
  const rows = db
    .select()
    .from(normalizationRecordReviewDecisions)
    .where(eq(normalizationRecordReviewDecisions.comparisonFingerprint, comparison.fingerprint))
    .all();
  for (const row of rows) {
    const record = recordsByKey.get(`${row.category}:${row.sourceRecordId}`);
    if (record?.status !== row.diffStatus) {
      throw new NormalizationRecordReviewError(
        "NORMALIZATION_RECORD_REVIEW_DATABASE_INVALID",
        "저장된 레코드 검수 결정이 현재 비교 계약과 일치하지 않습니다.",
      );
    }
  }
  return new Map(rows.map((row) => [`${row.category}:${row.sourceRecordId}`, row]));
}

function toWorkspace(
  db: RelinkDatabaseExecutor,
  comparison: InternalComparison,
): NormalizationReviewWorkspace {
  const decisions = readDecisionRows(db, comparison);
  const records = comparison.diff.records.flatMap((record, recordIndex) => {
    if (record.status === "unchanged") {
      return [];
    }
    const saved = decisions.get(decisionKey(record));
    return [
      {
        recordIndex,
        category: record.category,
        status: record.status,
        changedFields: record.changedFields,
        baseline: record.baseline,
        candidate: record.candidate,
        decision: saved?.decision ?? null,
        note: saved?.note ?? null,
        decidedAt: saved?.decidedAt ?? null,
      },
    ];
  });
  const approved = records.filter((record) => record.decision === "approved").length;
  const rejected = records.filter((record) => record.decision === "rejected").length;
  const pending = records.length - approved - rejected;
  return reviewWorkspaceSchema.parse({
    status: "ready",
    comparisonFingerprint: comparison.fingerprint,
    schemaVersion: comparison.candidate.schemaVersion,
    candidateNormalizedAt: comparison.candidate.normalizedAt,
    hasBaseline: comparison.baselineNormalizationRunId !== null,
    summary: comparison.diff.summary,
    decisionSummary: { pending, approved, rejected },
    canAccept: pending === 0 && rejected === 0,
    records,
  });
}

export function getNormalizationReviewWorkspace(db: RelinkDatabase): NormalizationReviewWorkspace {
  try {
    const comparison = buildInternalComparison(db);
    if (!comparison) {
      return { status: "empty", message: "검수할 최신 staged normalization 후보가 없습니다." };
    }
    return toWorkspace(db, comparison);
  } catch (error) {
    if (error instanceof NormalizationRecordReviewError) {
      throw error;
    }
    throw new NormalizationRecordReviewError(
      "NORMALIZATION_RECORD_REVIEW_DATABASE_INVALID",
      "레코드 검수 비교를 안전하게 읽을 수 없습니다.",
    );
  }
}

export function saveNormalizationRecordReviewDecision(
  db: RelinkDatabase,
  input: unknown,
): NormalizationReviewWorkspace {
  const validation = saveDecisionInputSchema.safeParse(input);
  if (!validation.success) {
    throw new NormalizationRecordReviewError(
      "NORMALIZATION_RECORD_REVIEW_INPUT_INVALID",
      "레코드 검수 결정 입력이 올바르지 않습니다.",
    );
  }
  const candidate = validation.data;
  return db.transaction(
    (transaction) => {
      const comparison = requireCurrentComparison(transaction, candidate.comparisonFingerprint);
      const record = comparison.diff.records[candidate.recordIndex];
      if (!record || record.status === "unchanged") {
        throw new NormalizationRecordReviewError(
          "NORMALIZATION_RECORD_REVIEW_RECORD_INVALID",
          "현재 비교에서 검수할 변경 레코드를 찾을 수 없습니다.",
        );
      }
      const note = candidate.note === "" ? null : candidate.note;

      transaction
        .insert(normalizationReviewComparisons)
        .values({
          fingerprint: comparison.fingerprint,
          baselineNormalizationRunId: comparison.baselineNormalizationRunId,
          candidateNormalizationRunId: comparison.candidate.id,
          schemaVersion: comparison.candidate.schemaVersion,
          createdAt: candidate.decidedAt,
        })
        .onConflictDoNothing()
        .run();
      const storedComparison = transaction
        .select()
        .from(normalizationReviewComparisons)
        .where(eq(normalizationReviewComparisons.fingerprint, comparison.fingerprint))
        .get();
      if (
        storedComparison?.baselineNormalizationRunId !== comparison.baselineNormalizationRunId ||
        storedComparison.candidateNormalizationRunId !== comparison.candidate.id
      ) {
        throw new NormalizationRecordReviewError(
          "NORMALIZATION_RECORD_REVIEW_COMPARISON_STALE",
          "저장된 비교 경계가 현재 검수 대상과 일치하지 않습니다.",
        );
      }
      transaction
        .insert(normalizationRecordReviewDecisions)
        .values({
          comparisonFingerprint: comparison.fingerprint,
          category: record.category,
          sourceRecordId: record.sourceRecordId,
          diffStatus: record.status,
          decision: candidate.decision,
          note,
          decidedAt: candidate.decidedAt,
        })
        .onConflictDoUpdate({
          target: [
            normalizationRecordReviewDecisions.comparisonFingerprint,
            normalizationRecordReviewDecisions.category,
            normalizationRecordReviewDecisions.sourceRecordId,
          ],
          set: { decision: candidate.decision, note, decidedAt: candidate.decidedAt },
        })
        .run();
      return toWorkspace(transaction, comparison);
    },
    { behavior: "immediate" },
  );
}

export function acceptFullyReviewedNormalizationRun(
  db: RelinkDatabase,
  input: unknown,
): AcceptNormalizationRunResult {
  const validation = acceptReviewedRunInputSchema.safeParse(input);
  if (!validation.success) {
    throw new NormalizationRecordReviewError(
      "NORMALIZATION_RECORD_REVIEW_INPUT_INVALID",
      "후보 승인 입력 또는 백업 증빙이 올바르지 않습니다.",
    );
  }
  const candidate = validation.data;
  return db.transaction(
    (transaction) => {
      const comparison = requireCurrentComparison(transaction, candidate.comparisonFingerprint);
      const workspace = toWorkspace(transaction, comparison);
      if (workspace.status !== "ready") {
        throw new NormalizationRecordReviewError(
          "NORMALIZATION_RECORD_REVIEW_COMPARISON_STALE",
          "승인할 최신 비교를 찾을 수 없습니다.",
        );
      }
      if (workspace.decisionSummary.rejected > 0) {
        throw new NormalizationRecordReviewError(
          "NORMALIZATION_RECORD_REVIEW_REJECTED",
          "거절된 변경 레코드가 있어 normalization 후보를 승인할 수 없습니다.",
        );
      }
      if (workspace.decisionSummary.pending > 0) {
        throw new NormalizationRecordReviewError(
          "NORMALIZATION_RECORD_REVIEW_INCOMPLETE",
          "모든 변경 레코드를 검수한 뒤 normalization 후보를 승인하세요.",
        );
      }
      return acceptNormalizationRun(transaction, {
        normalizationRunId: comparison.candidate.id,
        acceptedAt: candidate.acceptedAt,
        expectedBaselineNormalizationRunId: comparison.baselineNormalizationRunId,
        backup: candidate.backup,
      });
    },
    { behavior: "immediate" },
  );
}
