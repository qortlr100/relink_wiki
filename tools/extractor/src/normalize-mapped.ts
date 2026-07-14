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

  constructor() {
    super("정규화 매핑 파일을 읽거나 검증할 수 없습니다.");
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
  try {
    return normalizationMappingFileSchema.parse(JSON.parse(readFileSync(mappingPath, "utf8")));
  } catch {
    throw new NormalizationMappingError();
  }
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
