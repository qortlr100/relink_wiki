import { lstatSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizationMappingRecordsSchema } from "@relink-wiki/database";
import Database from "better-sqlite3";
import { z } from "zod";
import { pinnedExtractorVersion } from "./config";
import { importCandidateDatabase, stagingSchemaVersion } from "./import-candidate";
import {
  localizationJoinContracts,
  readMessageCatalog,
  type LocalizationCategoryResult,
} from "./validate-localization";

const mappingCandidateConfigSchema = z.object({
  candidateDatabasePath: z.string().min(1),
  targetDatabasePath: z.string().min(1),
  koreanMessageDirectoryPath: z.string().min(1),
  mappingOutputPath: z.string().min(1),
  extractorVersion: z.literal(pinnedExtractorVersion),
  schemaVersion: z.literal(stagingSchemaVersion),
});

const sourceMappingRowSchema = z.object({
  sourceRecordId: z.union([z.number().int(), z.bigint()]),
  sourceIdentifier: z.union([z.string(), z.null()]),
  messageKey: z.union([z.string(), z.null()]),
});

type MappingCategory = (typeof localizationJoinContracts)[number]["category"];

export interface MappingCandidateCategoryResult extends LocalizationCategoryResult {
  generatedRecordCount: number;
}

export interface MappingCandidateResult {
  importRunId: string;
  reusedImport: boolean;
  recordCount: number;
  categories: Record<MappingCategory, MappingCandidateCategoryResult>;
}

export type MappingCandidateErrorCode =
  | "MAPPING_CANDIDATE_SOURCE_INVALID"
  | "MAPPING_CANDIDATE_OUTPUT_INVALID"
  | "MAPPING_CANDIDATE_OUTPUT_EXISTS";

export class MappingCandidateError extends Error {
  constructor(
    readonly code: MappingCandidateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MappingCandidateError";
  }
}

export function readMappingCandidateConfig(environment: NodeJS.ProcessEnv) {
  return mappingCandidateConfigSchema.parse({
    candidateDatabasePath: environment.RELINK_CANDIDATE_DATABASE_PATH,
    targetDatabasePath: environment.RELINK_DATABASE_PATH,
    koreanMessageDirectoryPath: environment.RELINK_KOREAN_MESSAGE_DIRECTORY_PATH,
    mappingOutputPath: environment.RELINK_NORMALIZATION_MAPPING_PATH,
    extractorVersion: environment.GBFR_DATA_TOOLS_VERSION,
    schemaVersion: stagingSchemaVersion,
  });
}

function openCandidateDatabase(path: string): Database.Database {
  let sqlite: Database.Database | undefined;

  try {
    sqlite = new Database(path, { fileMustExist: true, readonly: true });
    sqlite.defaultSafeIntegers(true);
    sqlite.pragma("query_only = ON");
    return sqlite;
  } catch {
    sqlite?.close();
    throw new MappingCandidateError(
      "MAPPING_CANDIDATE_SOURCE_INVALID",
      "mapping 후보용 SQLite 데이터베이스를 읽을 수 없습니다.",
    );
  }
}

function readSourceRows(
  sqlite: Database.Database,
  contract: (typeof localizationJoinContracts)[number],
) {
  let rows: unknown[];

  try {
    rows = sqlite
      .prepare(
        `SELECT rowid AS sourceRecordId, "${contract.sourceIdentifierColumn}" AS sourceIdentifier, "${contract.sourceColumn}" AS messageKey FROM "${contract.sourceTable}" ORDER BY rowid`,
      )
      .all();
  } catch {
    throw new MappingCandidateError(
      "MAPPING_CANDIDATE_SOURCE_INVALID",
      `후보 테이블 ${contract.sourceTable}에서 mapping 입력을 읽을 수 없습니다.`,
    );
  }

  return rows.map((row) => {
    const parsedRow = sourceMappingRowSchema.safeParse(row);
    if (!parsedRow.success) {
      throw new MappingCandidateError(
        "MAPPING_CANDIDATE_SOURCE_INVALID",
        `후보 테이블 ${contract.sourceTable}에 지원하지 않는 mapping 입력이 있습니다.`,
      );
    }
    return parsedRow.data;
  });
}

function toPublicToken(sourceIdentifier: string): string {
  return sourceIdentifier
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assertMappingOutputAvailable(outputPath: string): void {
  try {
    if (!statSync(dirname(outputPath)).isDirectory()) {
      throw new Error("not-directory");
    }
  } catch {
    throw new MappingCandidateError(
      "MAPPING_CANDIDATE_OUTPUT_INVALID",
      "mapping 후보 출력 디렉터리를 사용할 수 없습니다.",
    );
  }

  try {
    lstatSync(outputPath);
    throw new MappingCandidateError(
      "MAPPING_CANDIDATE_OUTPUT_EXISTS",
      "기존 mapping 파일을 덮어쓰지 않았습니다.",
    );
  } catch (error) {
    if (error instanceof MappingCandidateError) {
      throw error;
    }
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw new MappingCandidateError(
        "MAPPING_CANDIDATE_OUTPUT_INVALID",
        "mapping 후보 출력 경로를 확인할 수 없습니다.",
      );
    }
  }
}

function writeMappingCandidate(outputPath: string, mapping: unknown): void {
  try {
    writeFileSync(outputPath, `${JSON.stringify(mapping, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
      throw new MappingCandidateError(
        "MAPPING_CANDIDATE_OUTPUT_EXISTS",
        "기존 mapping 파일을 덮어쓰지 않았습니다.",
      );
    }
    throw new MappingCandidateError(
      "MAPPING_CANDIDATE_OUTPUT_INVALID",
      "mapping 후보 파일을 쓸 수 없습니다.",
    );
  }
}

export function generateMappingCandidate(input: unknown): MappingCandidateResult {
  const config = mappingCandidateConfigSchema.parse(input);
  assertMappingOutputAvailable(config.mappingOutputPath);
  const imported = importCandidateDatabase({
    candidateDatabasePath: config.candidateDatabasePath,
    targetDatabasePath: config.targetDatabasePath,
    extractorVersion: config.extractorVersion,
    schemaVersion: config.schemaVersion,
  });
  const catalogs = new Map<string, Map<string, string>>();
  for (const messageFile of new Set(
    localizationJoinContracts.map((contract) => contract.messageFile),
  )) {
    catalogs.set(
      messageFile,
      readMessageCatalog(join(config.koreanMessageDirectoryPath, messageFile)),
    );
  }

  const sqlite = openCandidateDatabase(config.candidateDatabasePath);
  try {
    const records: z.infer<typeof normalizationMappingRecordsSchema> = [];
    const categoryEntries = localizationJoinContracts.map((contract) => {
      const sourceRows = readSourceRows(sqlite, contract);
      const catalog = catalogs.get(contract.messageFile);
      if (!catalog) {
        throw new MappingCandidateError(
          "MAPPING_CANDIDATE_SOURCE_INVALID",
          "필수 한국어 메시지 카탈로그를 찾을 수 없습니다.",
        );
      }
      let ignoredRowCount = 0;
      let nonCanonicalKeyRowCount = 0;
      let unresolvedRowCount = 0;
      const unresolvedKeys = new Set<string>();
      let matchedRowCount = 0;
      let generatedRecordCount = 0;

      for (const sourceRow of sourceRows) {
        if (sourceRow.messageKey === null || sourceRow.messageKey.trim().length === 0) {
          ignoredRowCount += 1;
          continue;
        }
        const messageKey = sourceRow.messageKey.trim();
        const isNonCanonicalKey = messageKey !== sourceRow.messageKey;
        nonCanonicalKeyRowCount += isNonCanonicalKey ? 1 : 0;
        const localizedText = catalog.get(messageKey);
        if (localizedText === undefined || localizedText.trim().length === 0) {
          unresolvedRowCount += 1;
          unresolvedKeys.add(messageKey);
          continue;
        }
        matchedRowCount += 1;
        if (isNonCanonicalKey) {
          continue;
        }
        if (
          sourceRow.sourceIdentifier === null ||
          sourceRow.sourceIdentifier.trim().length === 0 ||
          sourceRow.sourceIdentifier !== sourceRow.sourceIdentifier.trim()
        ) {
          throw new MappingCandidateError(
            "MAPPING_CANDIDATE_SOURCE_INVALID",
            `후보 테이블 ${contract.sourceTable}에 안정적인 식별자가 없는 행이 있습니다.`,
          );
        }
        const publicToken = toPublicToken(sourceRow.sourceIdentifier);
        if (publicToken.length === 0) {
          throw new MappingCandidateError(
            "MAPPING_CANDIDATE_SOURCE_INVALID",
            `후보 테이블 ${contract.sourceTable}에 공개 식별자로 변환할 수 없는 행이 있습니다.`,
          );
        }
        const publicIdentifier = `${contract.category}-${publicToken}`;
        records.push({
          sourceTable: contract.sourceTable,
          sourceRecordId: String(sourceRow.sourceRecordId),
          id: publicIdentifier,
          slug: publicIdentifier,
          nameKo: localizedText.trim(),
        });
        generatedRecordCount += 1;
      }

      const eligibleRowCount = sourceRows.length - ignoredRowCount;
      return [
        contract.category,
        {
          sourceRowCount: sourceRows.length,
          eligibleRowCount,
          matchedRowCount,
          ignoredRowCount,
          nonCanonicalKeyRowCount,
          unresolvedRowCount,
          unresolvedKeyCount: unresolvedKeys.size,
          generatedRecordCount,
        },
      ] as const;
    });
    const validatedRecords = normalizationMappingRecordsSchema.safeParse(records);
    if (!validatedRecords.success) {
      throw new MappingCandidateError(
        "MAPPING_CANDIDATE_SOURCE_INVALID",
        "mapping 후보의 공개 식별자 또는 slug가 중복되거나 올바르지 않습니다.",
      );
    }
    const categories = Object.fromEntries(categoryEntries) as MappingCandidateResult["categories"];
    writeMappingCandidate(config.mappingOutputPath, {
      importRunId: imported.importRunId,
      schemaVersion: config.schemaVersion,
      records: validatedRecords.data,
    });

    return {
      importRunId: imported.importRunId,
      reusedImport: imported.reused,
      recordCount: validatedRecords.data.length,
      categories,
    };
  } finally {
    sqlite.close();
  }
}
