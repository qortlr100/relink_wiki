import { lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decode } from "@msgpack/msgpack";
import { normalizationMappingRecordsSchema } from "@relink-wiki/database";
import Database from "better-sqlite3";
import { z } from "zod";
import { toPublicToken } from "./generate-mapping-candidate";
import { readMessageCatalog } from "./validate-localization";

const protagonistMappingRevisionConfigSchema = z.object({
  candidateDatabasePath: z.string().min(1),
  koreanMessageDirectoryPath: z.string().min(1),
  mappingPath: z.string().min(1),
  mappingRevisionOutputPath: z.string().min(1),
});

const mappingFileSchema = z.object({
  importRunId: z.uuid(),
  schemaVersion: z.literal(1),
  records: normalizationMappingRecordsSchema,
});

const integerSchema = z.union([z.number().int(), z.bigint()]);
const protagonistSourceRowSchema = z.object({
  sourceRecordId: integerSchema,
  sourceIdentifier: z.union([z.string(), z.null()]),
  messageKey: z.union([z.string(), z.null()]),
  isNpc: z.union([integerSchema, z.null()]),
  maxLevel: z.union([integerSchema, z.null()]),
  gender: z.union([integerSchema, z.null()]),
  uiOrder: z.union([integerSchema, z.null()]),
});

const messageDocumentSchema = z.object({
  rows_: z.array(
    z.object({
      column_: z.object({
        id_hash_: z.string().min(1),
        subid_hash_: z.string(),
        text_: z.string(),
      }),
    }),
  ),
});

const approvedContextNameKo = "주인공";
const approvedNamesByGender = new Map([
  [1, "주인공 (남성)"],
  [2, "주인공 (여성)"],
]);

export interface ProtagonistMappingRevisionResult {
  recordCount: number;
  addedRecordCount: 2;
  verifiedContextCount: 6;
}

export type ProtagonistMappingRevisionErrorCode =
  | "PROTAGONIST_MAPPING_INPUT_INVALID"
  | "PROTAGONIST_MAPPING_EVIDENCE_INVALID"
  | "PROTAGONIST_MAPPING_OUTPUT_INVALID"
  | "PROTAGONIST_MAPPING_OUTPUT_EXISTS";

export class ProtagonistMappingRevisionError extends Error {
  constructor(
    readonly code: ProtagonistMappingRevisionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProtagonistMappingRevisionError";
  }
}

export function readProtagonistMappingRevisionConfig(environment: NodeJS.ProcessEnv) {
  return protagonistMappingRevisionConfigSchema.parse({
    candidateDatabasePath: environment.RELINK_CANDIDATE_DATABASE_PATH,
    koreanMessageDirectoryPath: environment.RELINK_KOREAN_MESSAGE_DIRECTORY_PATH,
    mappingPath: environment.RELINK_NORMALIZATION_MAPPING_PATH,
    mappingRevisionOutputPath: environment.RELINK_NORMALIZATION_MAPPING_REVISION_PATH,
  });
}

function readMapping(path: string) {
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new ProtagonistMappingRevisionError(
      "PROTAGONIST_MAPPING_INPUT_INVALID",
      "기존 private mapping을 읽을 수 없습니다.",
    );
  }

  const result = mappingFileSchema.safeParse(input);
  if (!result.success) {
    throw new ProtagonistMappingRevisionError(
      "PROTAGONIST_MAPPING_INPUT_INVALID",
      "기존 private mapping 구조가 올바르지 않습니다.",
    );
  }
  return result.data;
}

function readMessageRows(path: string) {
  let decoded: unknown;
  try {
    decoded = decode(readFileSync(path));
  } catch {
    throw new ProtagonistMappingRevisionError(
      "PROTAGONIST_MAPPING_EVIDENCE_INVALID",
      "주인공 한국어 문맥 근거를 읽을 수 없습니다.",
    );
  }

  const result = messageDocumentSchema.safeParse(decoded);
  if (!result.success) {
    throw new ProtagonistMappingRevisionError(
      "PROTAGONIST_MAPPING_EVIDENCE_INVALID",
      "주인공 한국어 문맥 근거 구조가 올바르지 않습니다.",
    );
  }
  return result.data.rows_.map((row) => row.column_);
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
    throw new ProtagonistMappingRevisionError(
      "PROTAGONIST_MAPPING_INPUT_INVALID",
      "주인공 mapping 후보 SQLite를 읽기 전용으로 열 수 없습니다.",
    );
  }
}

function readCharacterRows(sqlite: Database.Database) {
  let rows: unknown[];
  try {
    rows = sqlite
      .prepare(
        'SELECT rowid AS sourceRecordId, "CharId" AS sourceIdentifier, "CharaName" AS messageKey, "IsNPC" AS isNpc, "MaxLevelMaybe" AS maxLevel, "Gender" AS gender, "UIOrder" AS uiOrder FROM "chara" ORDER BY rowid',
      )
      .all();
  } catch {
    throw new ProtagonistMappingRevisionError(
      "PROTAGONIST_MAPPING_INPUT_INVALID",
      "후보 테이블 chara가 주인공 mapping 계약과 일치하지 않습니다.",
    );
  }

  return rows.map((row) => {
    const result = protagonistSourceRowSchema.safeParse(row);
    if (!result.success) {
      throw new ProtagonistMappingRevisionError(
        "PROTAGONIST_MAPPING_INPUT_INVALID",
        "후보 테이블 chara에 지원하지 않는 주인공 mapping 입력이 있습니다.",
      );
    }
    return result.data;
  });
}

function numberValue(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function assertOutputAvailable(path: string): void {
  try {
    if (!statSync(dirname(path)).isDirectory()) {
      throw new Error("not-directory");
    }
  } catch {
    throw new ProtagonistMappingRevisionError(
      "PROTAGONIST_MAPPING_OUTPUT_INVALID",
      "private mapping 개정본 출력 디렉터리를 사용할 수 없습니다.",
    );
  }

  try {
    lstatSync(path);
    throw new ProtagonistMappingRevisionError(
      "PROTAGONIST_MAPPING_OUTPUT_EXISTS",
      "기존 private mapping 개정본을 덮어쓰지 않았습니다.",
    );
  } catch (error) {
    if (error instanceof ProtagonistMappingRevisionError) {
      throw error;
    }
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw new ProtagonistMappingRevisionError(
        "PROTAGONIST_MAPPING_OUTPUT_INVALID",
        "private mapping 개정본 출력 경로를 확인할 수 없습니다.",
      );
    }
  }
}

function writeRevision(path: string, mapping: unknown): void {
  try {
    writeFileSync(path, `${JSON.stringify(mapping, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
      throw new ProtagonistMappingRevisionError(
        "PROTAGONIST_MAPPING_OUTPUT_EXISTS",
        "기존 private mapping 개정본을 덮어쓰지 않았습니다.",
      );
    }
    throw new ProtagonistMappingRevisionError(
      "PROTAGONIST_MAPPING_OUTPUT_INVALID",
      "private mapping 개정본을 쓸 수 없습니다.",
    );
  }
}

export function reviseProtagonistMapping(input: unknown): ProtagonistMappingRevisionResult {
  const config = protagonistMappingRevisionConfigSchema.parse(input);
  assertOutputAvailable(config.mappingRevisionOutputPath);
  const mapping = readMapping(config.mappingPath);
  const characterMessagePath = join(config.koreanMessageDirectoryPath, "text_chara.msg");
  const canonicalCatalog = readMessageCatalog(characterMessagePath);
  const messageRows = readMessageRows(characterMessagePath);
  const sqlite = openCandidateDatabase(config.candidateDatabasePath);

  try {
    const characterRows = readCharacterRows(sqlite);
    const unresolvedRows = characterRows.filter((row) => {
      if (row.messageKey === null || row.messageKey.trim().length === 0) {
        return false;
      }
      const canonicalText = canonicalCatalog.get(row.messageKey);
      return canonicalText === undefined || canonicalText.trim().length === 0;
    });
    const mappedSourceKeys = new Set(
      mapping.records.map((record) => `${record.sourceTable}:${record.sourceRecordId}`),
    );
    const genders = unresolvedRows
      .map((row) => (row.gender === null ? Number.NaN : numberValue(row.gender)))
      .sort();
    const sharedMessageKeys = new Set(unresolvedRows.map((row) => row.messageKey));
    const uiOrders = new Set(unresolvedRows.map((row) => String(row.uiOrder)));

    const evidenceValid =
      unresolvedRows.length === 2 &&
      sharedMessageKeys.size === 1 &&
      unresolvedRows.every(
        (row) =>
          row.sourceIdentifier !== null &&
          row.sourceIdentifier === row.sourceIdentifier.trim() &&
          row.messageKey !== null &&
          row.messageKey === row.messageKey.trim() &&
          row.isNpc !== null &&
          numberValue(row.isNpc) === 0 &&
          row.maxLevel !== null &&
          numberValue(row.maxLevel) > 0 &&
          row.gender !== null &&
          row.uiOrder !== null &&
          !mappedSourceKeys.has(`chara:${String(row.sourceRecordId)}`),
      ) &&
      genders.length === 2 &&
      genders[0] === 1 &&
      genders[1] === 2 &&
      uiOrders.size === 2;
    if (!evidenceValid) {
      throw new ProtagonistMappingRevisionError(
        "PROTAGONIST_MAPPING_EVIDENCE_INVALID",
        "주인공 mapping 정책의 구조화된 재검증 조건이 일치하지 않습니다.",
      );
    }

    const sharedMessageKey = unresolvedRows[0]?.messageKey;
    if (!sharedMessageKey || canonicalCatalog.get(sharedMessageKey)?.trim() !== "") {
      throw new ProtagonistMappingRevisionError(
        "PROTAGONIST_MAPPING_EVIDENCE_INVALID",
        "주인공 mapping 정책의 빈 기본 이름 조건이 일치하지 않습니다.",
      );
    }
    const contextRows = messageRows.filter(
      (row) =>
        row.id_hash_ === sharedMessageKey &&
        row.subid_hash_.length > 0 &&
        row.text_.trim().length > 0,
    );
    if (
      contextRows.length !== 6 ||
      contextRows.some((row) => row.text_.trim() !== approvedContextNameKo)
    ) {
      throw new ProtagonistMappingRevisionError(
        "PROTAGONIST_MAPPING_EVIDENCE_INVALID",
        "주인공 mapping 정책의 한국어 문맥 재검증 조건이 일치하지 않습니다.",
      );
    }

    const additions = unresolvedRows.map((row) => {
      if (row.sourceIdentifier === null || row.gender === null) {
        throw new ProtagonistMappingRevisionError(
          "PROTAGONIST_MAPPING_EVIDENCE_INVALID",
          "주인공 mapping 정책의 공개 식별자 조건이 일치하지 않습니다.",
        );
      }
      const gender = numberValue(row.gender);
      const nameKo = approvedNamesByGender.get(gender);
      const publicToken = toPublicToken(row.sourceIdentifier);
      if (!nameKo || publicToken.length === 0) {
        throw new ProtagonistMappingRevisionError(
          "PROTAGONIST_MAPPING_EVIDENCE_INVALID",
          "주인공 mapping 정책의 공개 식별자 조건이 일치하지 않습니다.",
        );
      }
      const publicIdentifier = `character-${publicToken}`;
      return {
        sourceTable: "chara" as const,
        sourceRecordId: String(row.sourceRecordId),
        id: publicIdentifier,
        slug: publicIdentifier,
        nameKo,
      };
    });
    const revisedRecords = normalizationMappingRecordsSchema.safeParse([
      ...mapping.records,
      ...additions,
    ]);
    if (!revisedRecords.success) {
      throw new ProtagonistMappingRevisionError(
        "PROTAGONIST_MAPPING_EVIDENCE_INVALID",
        "주인공 mapping 개정본의 식별자 계약이 올바르지 않습니다.",
      );
    }

    writeRevision(config.mappingRevisionOutputPath, {
      importRunId: mapping.importRunId,
      schemaVersion: mapping.schemaVersion,
      records: revisedRecords.data,
    });
    return {
      recordCount: revisedRecords.data.length,
      addedRecordCount: 2,
      verifiedContextCount: 6,
    };
  } finally {
    sqlite.close();
  }
}
