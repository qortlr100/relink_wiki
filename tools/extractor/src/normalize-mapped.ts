import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  applyMigrations,
  normalizationMappingRecordsSchema,
  normalizeMappedRecords,
  openDatabase,
  type NormalizationResult,
} from "@relink-wiki/database";
import { z } from "zod";

export const normalizationSchemaVersion = 1;

const mappedNormalizationConfigSchema = z.object({
  targetDatabasePath: z.string().min(1),
  mappingPath: z.string().min(1),
  schemaVersion: z.literal(normalizationSchemaVersion),
});

const normalizationMappingFileSchema = z.object({
  importRunId: z.uuid(),
  schemaVersion: z.literal(normalizationSchemaVersion),
  records: normalizationMappingRecordsSchema,
});

export type MappedNormalizationConfig = z.infer<typeof mappedNormalizationConfigSchema>;

export class NormalizationMappingError extends Error {
  readonly code = "NORMALIZATION_MAPPING_INVALID";

  constructor(detail?: string) {
    super(
      detail
        ? `정규화 매핑 파일을 검증할 수 없습니다: ${detail}`
        : "정규화 매핑 파일을 읽거나 검증할 수 없습니다.",
    );
    this.name = "NormalizationMappingError";
  }
}

export function readMappedNormalizationConfig(
  environment: NodeJS.ProcessEnv,
): MappedNormalizationConfig {
  return mappedNormalizationConfigSchema.parse({
    targetDatabasePath: environment.RELINK_DATABASE_PATH,
    mappingPath: environment.RELINK_NORMALIZATION_MAPPING_PATH,
    schemaVersion: normalizationSchemaVersion,
  });
}

function readMappingFile(mappingPath: string) {
  let mappingText: string;
  let mappingInput: unknown;

  try {
    mappingText = readFileSync(mappingPath, "utf8");
  } catch {
    throw new NormalizationMappingError();
  }

  try {
    mappingInput = JSON.parse(mappingText);
  } catch {
    throw new NormalizationMappingError("JSON 문법이 올바르지 않습니다.");
  }

  const result = normalizationMappingFileSchema.safeParse(mappingInput);
  if (!result.success) {
    const issueLimit = 5;
    const issueDetails = result.error.issues.slice(0, issueLimit).map((issue) => {
      const fieldPath = issue.path.map(String).join(".");
      return fieldPath.length > 0 ? `${fieldPath}: ${issue.message}` : issue.message;
    });
    const remainingIssueCount = result.error.issues.length - issueDetails.length;
    if (remainingIssueCount > 0) {
      issueDetails.push(`외 ${String(remainingIssueCount)}개 오류`);
    }
    throw new NormalizationMappingError(issueDetails.join("; "));
  }

  return result.data;
}

export function normalizeMappedDatabase(input: unknown): NormalizationResult {
  const config = mappedNormalizationConfigSchema.parse(input);
  const mapping = readMappingFile(config.mappingPath);
  const target = openDatabase({ path: config.targetDatabasePath });

  try {
    applyMigrations(target.sqlite);
    return normalizeMappedRecords(target.db, {
      normalizationRunId: randomUUID(),
      importRunId: mapping.importRunId,
      normalizedAt: new Date().toISOString(),
      schemaVersion: mapping.schemaVersion,
      records: mapping.records,
    });
  } finally {
    target.sqlite.close();
  }
}
