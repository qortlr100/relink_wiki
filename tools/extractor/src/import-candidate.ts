import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import {
  applyMigrations,
  importStagingRecords,
  openDatabase,
  privateSourcePayloadSchema,
  type StagingImport,
  type StagingImportResult,
} from "@relink-wiki/database";
import { z } from "zod";
import { pinnedExtractorVersion } from "./config";

export const stagingSchemaVersion = 1;

const candidateImportConfigSchema = z.object({
  candidateDatabasePath: z.string().min(1),
  targetDatabasePath: z.string().min(1),
  extractorVersion: z.literal(pinnedExtractorVersion),
  schemaVersion: z.literal(stagingSchemaVersion),
});

export type CandidateImportConfig = z.infer<typeof candidateImportConfigSchema>;

const candidateTables = [
  { sourceTable: "chara", sourceFileId: "system/table/chara.tbl" },
  { sourceTable: "weapon", sourceFileId: "system/table/weapon.tbl" },
  { sourceTable: "gem", sourceFileId: "system/table/gem.tbl" },
  { sourceTable: "ability", sourceFileId: "system/table/ability.tbl" },
] as const;

const sourceRowSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

export type CandidateImportErrorCode =
  | "CANDIDATE_DATABASE_INVALID"
  | "CANDIDATE_TARGET_PATH_CONFLICT"
  | "CANDIDATE_TABLE_MISSING"
  | "CANDIDATE_TABLE_INVALID"
  | "CANDIDATE_ROW_INVALID";

export class CandidateImportError extends Error {
  constructor(
    readonly code: CandidateImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CandidateImportError";
  }
}

export function readCandidateImportConfig(environment: NodeJS.ProcessEnv): CandidateImportConfig {
  return candidateImportConfigSchema.parse({
    candidateDatabasePath: environment.RELINK_CANDIDATE_DATABASE_PATH,
    targetDatabasePath: environment.RELINK_DATABASE_PATH,
    extractorVersion: environment.GBFR_DATA_TOOLS_VERSION,
    schemaVersion: stagingSchemaVersion,
  });
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeDatabasePath(databasePath: string): string {
  const resolvedPath = resolve(databasePath);
  let canonicalPath = resolvedPath;

  if (existsSync(resolvedPath)) {
    try {
      canonicalPath = realpathSync.native(resolvedPath);
    } catch {
      canonicalPath = resolvedPath;
    }
  }

  return process.platform === "win32" ? canonicalPath.toLowerCase() : canonicalPath;
}

function pathsReferToSameFile(candidatePath: string, targetPath: string): boolean {
  if (normalizeDatabasePath(candidatePath) === normalizeDatabasePath(targetPath)) {
    return true;
  }

  if (!existsSync(candidatePath) || !existsSync(targetPath)) {
    return false;
  }

  try {
    const candidateStats = statSync(candidatePath);
    const targetStats = statSync(targetPath);
    return candidateStats.dev === targetStats.dev && candidateStats.ino === targetStats.ino;
  } catch {
    return false;
  }
}

function sortPayload(payload: Record<string, string | number | null>) {
  return Object.fromEntries(
    Object.entries(payload).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
}

function readStagingRecords(sqlite: Database.Database): StagingImport["records"] {
  const availableTables = new Set(
    sqlite
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((table) => table.name),
  );

  for (const candidateTable of candidateTables) {
    if (!availableTables.has(candidateTable.sourceTable)) {
      throw new CandidateImportError(
        "CANDIDATE_TABLE_MISSING",
        `필수 후보 테이블 ${candidateTable.sourceTable}을 찾을 수 없습니다.`,
      );
    }
  }

  return candidateTables.flatMap((candidateTable) => {
    let rows: unknown[];

    try {
      rows = sqlite
        .prepare(
          `SELECT rowid AS __relink_source_rowid, * FROM ${candidateTable.sourceTable} ORDER BY rowid`,
        )
        .all();
    } catch {
      throw new CandidateImportError(
        "CANDIDATE_TABLE_INVALID",
        `후보 테이블 ${candidateTable.sourceTable}의 구조를 읽을 수 없습니다.`,
      );
    }

    return rows.map((input) => {
      const parsedRow = sourceRowSchema.safeParse(input);
      if (!parsedRow.success) {
        throw new CandidateImportError(
          "CANDIDATE_ROW_INVALID",
          `후보 테이블 ${candidateTable.sourceTable}에 지원하지 않는 필드 값이 있습니다.`,
        );
      }

      const { __relink_source_rowid: sourceRowId, ...sourcePayload } = parsedRow.data;
      if (typeof sourceRowId !== "number") {
        throw new CandidateImportError(
          "CANDIDATE_ROW_INVALID",
          `후보 테이블 ${candidateTable.sourceTable}의 행 식별자를 읽을 수 없습니다.`,
        );
      }

      const rawPayload = privateSourcePayloadSchema.parse(sortPayload(sourcePayload));
      const serializedPayload = JSON.stringify(rawPayload);

      return {
        sourceTable: candidateTable.sourceTable,
        sourceFileId: candidateTable.sourceFileId,
        sourceRecordId: String(sourceRowId),
        rawPayload,
        payloadHash: hash(serializedPayload),
      };
    });
  });
}

function openCandidateDatabase(path: string): Database.Database {
  try {
    const sqlite = new Database(path, { fileMustExist: true, readonly: true });
    sqlite.pragma("query_only = ON");
    return sqlite;
  } catch {
    throw new CandidateImportError(
      "CANDIDATE_DATABASE_INVALID",
      "후보 SQLite 데이터베이스를 읽기 전용으로 열 수 없습니다.",
    );
  }
}

export function importCandidateDatabase(input: unknown): StagingImportResult {
  const config = candidateImportConfigSchema.parse(input);

  if (pathsReferToSameFile(config.candidateDatabasePath, config.targetDatabasePath)) {
    throw new CandidateImportError(
      "CANDIDATE_TARGET_PATH_CONFLICT",
      "후보 데이터베이스와 대상 데이터베이스는 서로 다른 파일이어야 합니다.",
    );
  }

  const candidateSqlite = openCandidateDatabase(config.candidateDatabasePath);

  try {
    const records = readStagingRecords(candidateSqlite);
    const warnings: StagingImport["warnings"] = [
      {
        code: "SKILL_TABLE_INCOMPATIBLE",
        sourceFileId: "system/table/skill.tbl",
        message: "GBFRDataTools 2.0.0에서 skill.tbl 레이아웃을 변환할 수 없습니다.",
      },
    ];
    const inputFingerprint = hash(
      JSON.stringify({
        extractorVersion: config.extractorVersion,
        schemaVersion: config.schemaVersion,
        records,
        warnings,
      }),
    );
    const target = openDatabase({ path: config.targetDatabasePath });

    try {
      applyMigrations(target.sqlite);
      return importStagingRecords(target.db, {
        importRunId: randomUUID(),
        inputFingerprint,
        extractorVersion: config.extractorVersion,
        importedAt: new Date().toISOString(),
        schemaVersion: config.schemaVersion,
        records,
        warnings,
      });
    } finally {
      target.sqlite.close();
    }
  } finally {
    candidateSqlite.close();
  }
}
