import { asc, eq } from "drizzle-orm";
import {
  normalizationDiffSchema,
  type NormalizationDiff,
  type NormalizedRecordDiff,
} from "@relink-wiki/domain";
import { z } from "zod";
import type { openDatabase } from "./index";
import { normalizationRuns, normalizedRecords } from "./schema";

const normalizationDiffInputSchema = z.object({
  baselineNormalizationRunId: z.uuid(),
  candidateNormalizationRunId: z.uuid(),
});

type RelinkDatabase = ReturnType<typeof openDatabase>["db"];
type RelinkTransaction = Parameters<Parameters<RelinkDatabase["transaction"]>[0]>[0];
type RelinkDatabaseExecutor = RelinkDatabase | RelinkTransaction;
type DiffRecordValue = NonNullable<NormalizedRecordDiff["baseline"]>;

export type NormalizationDiffErrorCode =
  | "NORMALIZATION_DIFF_INPUT_INVALID"
  | "NORMALIZATION_RUN_NOT_FOUND"
  | "NORMALIZATION_DIFF_SCHEMA_MISMATCH";

export class NormalizationDiffError extends Error {
  constructor(
    readonly code: NormalizationDiffErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "NormalizationDiffError";
  }
}

interface ComparableRecord extends DiffRecordValue {
  category: NormalizedRecordDiff["category"];
  sourceRecordId: string;
}

function recordKey(record: Pick<ComparableRecord, "category" | "sourceRecordId">): string {
  return `${record.category}:${record.sourceRecordId}`;
}

function readRun(db: RelinkDatabaseExecutor, normalizationRunId: string) {
  return db
    .select({ id: normalizationRuns.id, schemaVersion: normalizationRuns.schemaVersion })
    .from(normalizationRuns)
    .where(eq(normalizationRuns.id, normalizationRunId))
    .get();
}

function readRecords(db: RelinkDatabaseExecutor, normalizationRunId: string): ComparableRecord[] {
  return db
    .select({
      category: normalizedRecords.category,
      sourceRecordId: normalizedRecords.sourceRecordId,
      id: normalizedRecords.id,
      slug: normalizedRecords.slug,
      nameKo: normalizedRecords.nameKo,
    })
    .from(normalizedRecords)
    .where(eq(normalizedRecords.normalizationRunId, normalizationRunId))
    .orderBy(asc(normalizedRecords.category), asc(normalizedRecords.sourceRecordId))
    .all();
}

function publicValue(record: ComparableRecord): DiffRecordValue {
  return { id: record.id, slug: record.slug, nameKo: record.nameKo };
}

function compareRecordValues(
  baseline: ComparableRecord,
  candidate: ComparableRecord,
): NormalizedRecordDiff {
  const changedFields = (["id", "slug", "nameKo"] as const).filter(
    (field) => baseline[field] !== candidate[field],
  );
  return {
    category: candidate.category,
    sourceRecordId: candidate.sourceRecordId,
    status: changedFields.length === 0 ? "unchanged" : "changed",
    changedFields,
    baseline: publicValue(baseline),
    candidate: publicValue(candidate),
  };
}

export function compareNormalizationRuns(
  db: RelinkDatabaseExecutor,
  input: unknown,
): NormalizationDiff {
  const validation = normalizationDiffInputSchema.safeParse(input);
  if (!validation.success) {
    throw new NormalizationDiffError(
      "NORMALIZATION_DIFF_INPUT_INVALID",
      "비교할 정규화 실행 입력이 올바르지 않습니다.",
    );
  }
  const { baselineNormalizationRunId, candidateNormalizationRunId } = validation.data;
  const baselineRun = readRun(db, baselineNormalizationRunId);
  const candidateRun = readRun(db, candidateNormalizationRunId);

  if (!baselineRun || !candidateRun) {
    throw new NormalizationDiffError(
      "NORMALIZATION_RUN_NOT_FOUND",
      "비교할 비공개 정규화 실행을 찾을 수 없습니다.",
    );
  }
  if (baselineRun.schemaVersion !== candidateRun.schemaVersion) {
    throw new NormalizationDiffError(
      "NORMALIZATION_DIFF_SCHEMA_MISMATCH",
      "스키마 버전이 다른 정규화 실행은 비교할 수 없습니다.",
    );
  }

  const baselineRecords = readRecords(db, baselineNormalizationRunId);
  const candidateRecords = readRecords(db, candidateNormalizationRunId);
  const baselineByKey = new Map(baselineRecords.map((record) => [recordKey(record), record]));
  const candidateByKey = new Map(candidateRecords.map((record) => [recordKey(record), record]));
  const keys = [...new Set([...baselineByKey.keys(), ...candidateByKey.keys()])].sort();
  const records = keys.map((key): NormalizedRecordDiff => {
    const baseline = baselineByKey.get(key);
    const candidate = candidateByKey.get(key);

    if (!baseline && candidate) {
      return {
        category: candidate.category,
        sourceRecordId: candidate.sourceRecordId,
        status: "added",
        changedFields: [],
        baseline: null,
        candidate: publicValue(candidate),
      };
    }
    if (baseline && !candidate) {
      return {
        category: baseline.category,
        sourceRecordId: baseline.sourceRecordId,
        status: "removed",
        changedFields: [],
        baseline: publicValue(baseline),
        candidate: null,
      };
    }
    if (!baseline || !candidate) {
      throw new Error("Normalization diff key did not resolve to a record.");
    }
    return compareRecordValues(baseline, candidate);
  });
  const summary = { added: 0, changed: 0, removed: 0, unchanged: 0 };
  for (const record of records) {
    summary[record.status] += 1;
  }

  return normalizationDiffSchema.parse({
    baselineNormalizationRunId,
    candidateNormalizationRunId,
    schemaVersion: baselineRun.schemaVersion,
    summary,
    records,
  });
}
