import { eq } from "drizzle-orm";
import { z } from "zod";
import type { openDatabase } from "./index";
import { importRuns, importWarnings, stagingRecords } from "./schema";

export const stagingSourceTableSchema = z.enum(["chara", "weapon", "gem", "ability"]);
const rawFieldSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const privateSourcePayloadSchema = z.record(z.string(), rawFieldSchema);

export const stagingImportSchema = z.object({
  importRunId: z.uuid(),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  extractorVersion: z.string().min(1),
  importedAt: z.iso.datetime(),
  schemaVersion: z.int().positive(),
  records: z.array(
    z.object({
      sourceTable: stagingSourceTableSchema,
      sourceFileId: z.string().min(1),
      sourceRecordId: z.string().min(1),
      rawPayload: privateSourcePayloadSchema,
      payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
  warnings: z.array(
    z.object({
      code: z.string().regex(/^[A-Z0-9_]+$/),
      sourceFileId: z.string().min(1),
      message: z.string().min(1),
    }),
  ),
});

export type StagingImport = z.infer<typeof stagingImportSchema>;
type RelinkDatabase = ReturnType<typeof openDatabase>["db"];

export interface StagingImportResult {
  importRunId: string;
  reused: boolean;
  recordCount: number;
  warningCount: number;
}

export function importStagingRecords(db: RelinkDatabase, input: unknown): StagingImportResult {
  const candidateImport = stagingImportSchema.parse(input);

  return db.transaction((transaction) => {
    const existingRun = transaction
      .select({ id: importRuns.id })
      .from(importRuns)
      .where(eq(importRuns.inputFingerprint, candidateImport.inputFingerprint))
      .get();

    if (existingRun) {
      return {
        importRunId: existingRun.id,
        reused: true,
        recordCount: candidateImport.records.length,
        warningCount: candidateImport.warnings.length,
      };
    }

    transaction
      .insert(importRuns)
      .values({
        id: candidateImport.importRunId,
        inputFingerprint: candidateImport.inputFingerprint,
        extractorVersion: candidateImport.extractorVersion,
        importedAt: candidateImport.importedAt,
        schemaVersion: candidateImport.schemaVersion,
      })
      .run();

    if (candidateImport.records.length > 0) {
      transaction
        .insert(stagingRecords)
        .values(
          candidateImport.records.map((record) => ({
            importRunId: candidateImport.importRunId,
            sourceTable: record.sourceTable,
            sourceFileId: record.sourceFileId,
            sourceRecordId: record.sourceRecordId,
            payloadJson: JSON.stringify(record.rawPayload),
            payloadHash: record.payloadHash,
          })),
        )
        .run();
    }

    if (candidateImport.warnings.length > 0) {
      transaction
        .insert(importWarnings)
        .values(
          candidateImport.warnings.map((warning) => ({
            importRunId: candidateImport.importRunId,
            code: warning.code,
            sourceFileId: warning.sourceFileId,
            message: warning.message,
          })),
        )
        .run();
    }

    return {
      importRunId: candidateImport.importRunId,
      reused: false,
      recordCount: candidateImport.records.length,
      warningCount: candidateImport.warnings.length,
    };
  });
}
