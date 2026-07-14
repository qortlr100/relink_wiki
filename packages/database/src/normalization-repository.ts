import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { normalizedRecordSchema, recordIdSchema } from "@relink-wiki/domain";
import { z } from "zod";
import type { openDatabase } from "./index";
import { importRuns, normalizationRuns, normalizedRecords, stagingRecords } from "./schema";
import { stagingSourceTableSchema } from "./staging-import-repository";

const sourceCategory = {
  chara: "character",
  weapon: "weapon",
  gem: "sigil",
  ability: "skill",
} as const;

export const normalizationMappingRecordSchema = z.object({
  sourceTable: stagingSourceTableSchema,
  sourceRecordId: z.string().min(1),
  id: recordIdSchema,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  nameKo: z.string().trim().min(1),
});

export const normalizationMappingRecordsSchema = z
  .array(normalizationMappingRecordSchema)
  .min(1)
  .superRefine((records, context) => {
    const sourceKeys = new Set<string>();
    const idKeys = new Set<string>();
    const slugKeys = new Set<string>();

    records.forEach((record, index) => {
      const category = sourceCategory[record.sourceTable];
      const keys = [
        [sourceKeys, `${record.sourceTable}:${record.sourceRecordId}`, "원본 레코드"],
        [idKeys, `${category}:${record.id}`, "정규화 ID"],
        [slugKeys, `${category}:${record.slug}`, "slug"],
      ] as const;

      for (const [seen, key, label] of keys) {
        if (seen.has(key)) {
          context.addIssue({
            code: "custom",
            path: [index],
            message: `${label} 매핑이 중복되었습니다.`,
          });
        }
        seen.add(key);
      }
    });
  });

export const mappedNormalizationSchema = z.object({
  normalizationRunId: z.uuid(),
  importRunId: z.uuid(),
  normalizedAt: z.iso.datetime(),
  schemaVersion: z.int().positive(),
  records: normalizationMappingRecordsSchema,
});

export type MappedNormalization = z.infer<typeof mappedNormalizationSchema>;
type RelinkDatabase = ReturnType<typeof openDatabase>["db"];

export type NormalizationErrorCode =
  "NORMALIZATION_INPUT_INVALID" | "IMPORT_RUN_NOT_FOUND" | "STAGING_RECORD_NOT_FOUND";

export class NormalizationError extends Error {
  constructor(
    readonly code: NormalizationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "NormalizationError";
  }
}

export interface NormalizationResult {
  normalizationRunId: string;
  importRunId: string;
  reused: boolean;
  recordCount: number;
  unmappedRecordCount: number;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeMappedRecords(db: RelinkDatabase, input: unknown): NormalizationResult {
  const validation = mappedNormalizationSchema.safeParse(input);
  if (!validation.success) {
    const issueDetails = validation.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "입력"}: ${issue.message}`)
      .join("; ");
    throw new NormalizationError(
      "NORMALIZATION_INPUT_INVALID",
      `정규화 입력이 올바르지 않습니다: ${issueDetails}`,
    );
  }
  const candidate = validation.data;

  return db.transaction((transaction) => {
    const importRun = transaction
      .select({
        id: importRuns.id,
        extractorVersion: importRuns.extractorVersion,
        importedAt: importRuns.importedAt,
      })
      .from(importRuns)
      .where(eq(importRuns.id, candidate.importRunId))
      .get();

    if (!importRun) {
      throw new NormalizationError(
        "IMPORT_RUN_NOT_FOUND",
        "정규화할 비공개 임포트 실행을 찾을 수 없습니다.",
      );
    }

    const stagedRows = transaction
      .select({
        sourceTable: stagingRecords.sourceTable,
        sourceFileId: stagingRecords.sourceFileId,
        sourceRecordId: stagingRecords.sourceRecordId,
        payloadHash: stagingRecords.payloadHash,
      })
      .from(stagingRecords)
      .where(eq(stagingRecords.importRunId, candidate.importRunId))
      .all();
    const stagedRowsByKey = new Map(
      stagedRows.map((record) => [`${record.sourceTable}:${record.sourceRecordId}`, record]),
    );
    const mappedRows = candidate.records.map((mapping) => {
      const stagedRow = stagedRowsByKey.get(`${mapping.sourceTable}:${mapping.sourceRecordId}`);
      if (!stagedRow) {
        throw new NormalizationError(
          "STAGING_RECORD_NOT_FOUND",
          "매핑에 대응하는 비공개 staging 레코드를 찾을 수 없습니다.",
        );
      }
      return { mapping, stagedRow };
    });
    const canonicalRows = mappedRows
      .map(({ mapping, stagedRow }) => ({ ...mapping, payloadHash: stagedRow.payloadHash }))
      .sort((left, right) => {
        const leftKey = `${left.sourceTable}:${left.sourceRecordId}`;
        const rightKey = `${right.sourceTable}:${right.sourceRecordId}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
    const inputFingerprint = hash(
      JSON.stringify({
        importRunId: candidate.importRunId,
        schemaVersion: candidate.schemaVersion,
        records: canonicalRows,
      }),
    );
    const insertRun = transaction
      .insert(normalizationRuns)
      .values({
        id: candidate.normalizationRunId,
        inputFingerprint,
        importRunId: candidate.importRunId,
        normalizedAt: candidate.normalizedAt,
        schemaVersion: candidate.schemaVersion,
      })
      .onConflictDoNothing({ target: normalizationRuns.inputFingerprint })
      .run();

    if (insertRun.changes === 0) {
      const existingRun = transaction
        .select({ id: normalizationRuns.id })
        .from(normalizationRuns)
        .where(
          and(
            eq(normalizationRuns.inputFingerprint, inputFingerprint),
            eq(normalizationRuns.importRunId, candidate.importRunId),
          ),
        )
        .get();
      if (!existingRun) {
        throw new Error("The conflicting normalization run could not be read.");
      }
      return {
        normalizationRunId: existingRun.id,
        importRunId: candidate.importRunId,
        reused: true,
        recordCount: candidate.records.length,
        unmappedRecordCount: stagedRows.length - candidate.records.length,
      };
    }

    const records = mappedRows.map(({ mapping, stagedRow }) => ({
      sourceTable: mapping.sourceTable,
      record: normalizedRecordSchema.parse({
        category: sourceCategory[mapping.sourceTable],
        id: mapping.id,
        slug: mapping.slug,
        nameKo: mapping.nameKo,
        reviewState: "staged",
        provenance: {
          sourceFileId: stagedRow.sourceFileId,
          sourceRecordId: stagedRow.sourceRecordId,
          extractorVersion: importRun.extractorVersion,
          importRunId: importRun.id,
          importedAt: importRun.importedAt,
          schemaVersion: candidate.schemaVersion,
        },
      }),
    }));

    transaction
      .insert(normalizedRecords)
      .values(
        records.map(({ record, sourceTable }) => ({
          normalizationRunId: candidate.normalizationRunId,
          category: record.category,
          id: record.id,
          slug: record.slug,
          nameKo: record.nameKo,
          reviewState: record.reviewState,
          sourceTable,
          sourceFileId: record.provenance.sourceFileId,
          sourceRecordId: record.provenance.sourceRecordId,
          extractorVersion: record.provenance.extractorVersion,
          importRunId: record.provenance.importRunId,
          importedAt: record.provenance.importedAt,
          schemaVersion: record.provenance.schemaVersion,
        })),
      )
      .run();

    return {
      normalizationRunId: candidate.normalizationRunId,
      importRunId: candidate.importRunId,
      reused: false,
      recordCount: records.length,
      unmappedRecordCount: stagedRows.length - records.length,
    };
  });
}
