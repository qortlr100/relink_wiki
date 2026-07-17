import { and, eq } from "drizzle-orm";
import {
  acceptedNormalizationBaselineSchema,
  backupReceiptSchema,
  normalizationAcceptanceSchema,
  type AcceptedNormalizationBaseline,
  type NormalizationAcceptance,
} from "@relink-wiki/domain";
import { z } from "zod";
import type { openDatabase } from "./index";
import {
  acceptedNormalizationBaselines,
  normalizationAcceptances,
  normalizationRuns,
  normalizedRecords,
} from "./schema";

const acceptNormalizationRunInputSchema = z
  .object({
    normalizationRunId: z.uuid(),
    acceptedAt: z.iso.datetime(),
    expectedBaselineNormalizationRunId: z.uuid().nullable(),
    backup: backupReceiptSchema,
  })
  .strict()
  .refine((input) => Date.parse(input.backup.createdAt) <= Date.parse(input.acceptedAt), {
    path: ["backup", "createdAt"],
    message: "백업은 승인 이전에 완료되어야 합니다.",
  });

const schemaVersionInputSchema = z.int().positive();
type RelinkDatabase = ReturnType<typeof openDatabase>["db"];
type RelinkTransaction = Parameters<Parameters<RelinkDatabase["transaction"]>[0]>[0];
type RelinkDatabaseExecutor = RelinkDatabase | RelinkTransaction;

export type NormalizationReviewErrorCode =
  | "NORMALIZATION_REVIEW_INPUT_INVALID"
  | "NORMALIZATION_RUN_NOT_FOUND"
  | "NORMALIZATION_BASELINE_CHANGED"
  | "NORMALIZATION_RUN_ALREADY_ACCEPTED";

export class NormalizationReviewError extends Error {
  constructor(
    readonly code: NormalizationReviewErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "NormalizationReviewError";
  }
}

export interface AcceptNormalizationRunResult {
  acceptance: NormalizationAcceptance;
  reused: boolean;
  reviewedRecordCount: number;
}

function toAcceptance(row: typeof normalizationAcceptances.$inferSelect): NormalizationAcceptance {
  return normalizationAcceptanceSchema.parse({
    normalizationRunId: row.normalizationRunId,
    schemaVersion: row.schemaVersion,
    acceptedAt: row.acceptedAt,
    previousBaselineNormalizationRunId: row.previousBaselineNormalizationRunId,
    backup: {
      reference: row.backupReference,
      createdAt: row.backupCreatedAt,
      sha256: row.backupSha256,
    },
  });
}

function toBaseline(
  row: typeof acceptedNormalizationBaselines.$inferSelect,
): AcceptedNormalizationBaseline {
  return acceptedNormalizationBaselineSchema.parse({
    normalizationRunId: row.normalizationRunId,
    schemaVersion: row.schemaVersion,
    acceptedAt: row.acceptedAt,
    backup: {
      reference: row.backupReference,
      createdAt: row.backupCreatedAt,
      sha256: row.backupSha256,
    },
  });
}

export function getAcceptedNormalizationBaseline(
  db: RelinkDatabaseExecutor,
  schemaVersion: unknown,
): AcceptedNormalizationBaseline | null {
  const validation = schemaVersionInputSchema.safeParse(schemaVersion);
  if (!validation.success) {
    throw new NormalizationReviewError(
      "NORMALIZATION_REVIEW_INPUT_INVALID",
      "조회할 정규화 스키마 버전이 올바르지 않습니다.",
    );
  }
  const baseline = db
    .select()
    .from(acceptedNormalizationBaselines)
    .where(eq(acceptedNormalizationBaselines.schemaVersion, validation.data))
    .get();
  return baseline ? toBaseline(baseline) : null;
}

export function acceptNormalizationRun(
  db: RelinkDatabaseExecutor,
  input: unknown,
): AcceptNormalizationRunResult {
  const validation = acceptNormalizationRunInputSchema.safeParse(input);
  if (!validation.success) {
    throw new NormalizationReviewError(
      "NORMALIZATION_REVIEW_INPUT_INVALID",
      "정규화 승인 입력 또는 백업 증빙이 올바르지 않습니다.",
    );
  }
  const candidate = validation.data;

  return db.transaction((transaction) => {
    const run = transaction
      .select({ id: normalizationRuns.id, schemaVersion: normalizationRuns.schemaVersion })
      .from(normalizationRuns)
      .where(eq(normalizationRuns.id, candidate.normalizationRunId))
      .get();
    if (!run) {
      throw new NormalizationReviewError(
        "NORMALIZATION_RUN_NOT_FOUND",
        "승인할 비공개 정규화 실행을 찾을 수 없습니다.",
      );
    }

    const existingAcceptance = transaction
      .select()
      .from(normalizationAcceptances)
      .where(eq(normalizationAcceptances.normalizationRunId, run.id))
      .get();
    if (existingAcceptance) {
      const acceptance = toAcceptance(existingAcceptance);
      const isSameRequest =
        acceptance.acceptedAt === candidate.acceptedAt &&
        acceptance.previousBaselineNormalizationRunId ===
          candidate.expectedBaselineNormalizationRunId &&
        acceptance.backup.reference === candidate.backup.reference &&
        acceptance.backup.createdAt === candidate.backup.createdAt &&
        acceptance.backup.sha256 === candidate.backup.sha256;
      if (!isSameRequest) {
        throw new NormalizationReviewError(
          "NORMALIZATION_RUN_ALREADY_ACCEPTED",
          "정규화 실행에 이미 다른 승인 기록이 있습니다.",
        );
      }
      const reviewedRecordCount = transaction
        .select({ id: normalizedRecords.id })
        .from(normalizedRecords)
        .where(
          and(
            eq(normalizedRecords.normalizationRunId, run.id),
            eq(normalizedRecords.reviewState, "reviewed"),
          ),
        )
        .all().length;
      return { acceptance, reused: true, reviewedRecordCount };
    }

    const currentBaseline = transaction
      .select({ normalizationRunId: acceptedNormalizationBaselines.normalizationRunId })
      .from(acceptedNormalizationBaselines)
      .where(eq(acceptedNormalizationBaselines.schemaVersion, run.schemaVersion))
      .get();
    if (
      (currentBaseline?.normalizationRunId ?? null) !== candidate.expectedBaselineNormalizationRunId
    ) {
      throw new NormalizationReviewError(
        "NORMALIZATION_BASELINE_CHANGED",
        "검수 중 정규화 baseline이 변경되었습니다. 최신 비교 결과를 다시 확인하세요.",
      );
    }

    const acceptance = normalizationAcceptanceSchema.parse({
      normalizationRunId: run.id,
      schemaVersion: run.schemaVersion,
      acceptedAt: candidate.acceptedAt,
      previousBaselineNormalizationRunId: currentBaseline?.normalizationRunId ?? null,
      backup: candidate.backup,
    });
    transaction
      .insert(normalizationAcceptances)
      .values({
        normalizationRunId: acceptance.normalizationRunId,
        schemaVersion: acceptance.schemaVersion,
        acceptedAt: acceptance.acceptedAt,
        previousBaselineNormalizationRunId: acceptance.previousBaselineNormalizationRunId,
        backupReference: acceptance.backup.reference,
        backupCreatedAt: acceptance.backup.createdAt,
        backupSha256: acceptance.backup.sha256,
      })
      .run();
    transaction
      .insert(acceptedNormalizationBaselines)
      .values({
        schemaVersion: acceptance.schemaVersion,
        normalizationRunId: acceptance.normalizationRunId,
        acceptedAt: acceptance.acceptedAt,
        backupReference: acceptance.backup.reference,
        backupCreatedAt: acceptance.backup.createdAt,
        backupSha256: acceptance.backup.sha256,
      })
      .onConflictDoUpdate({
        target: acceptedNormalizationBaselines.schemaVersion,
        set: {
          normalizationRunId: acceptance.normalizationRunId,
          acceptedAt: acceptance.acceptedAt,
          backupReference: acceptance.backup.reference,
          backupCreatedAt: acceptance.backup.createdAt,
          backupSha256: acceptance.backup.sha256,
        },
      })
      .run();
    const update = transaction
      .update(normalizedRecords)
      .set({ reviewState: "reviewed" })
      .where(eq(normalizedRecords.normalizationRunId, acceptance.normalizationRunId))
      .run();

    return {
      acceptance,
      reused: false,
      reviewedRecordCount: update.changes,
    };
  });
}
