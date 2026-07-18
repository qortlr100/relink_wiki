import { readFileSync } from "node:fs";
import { normalizationMappingRecordsSchema } from "@relink-wiki/database";
import Database from "better-sqlite3";
import { z } from "zod";

const relationshipValidationConfigSchema = z.object({
  candidateDatabasePath: z.string().min(1),
  mappingPath: z.string().min(1),
});

const relationshipMappingSchema = z.object({
  schemaVersion: z.literal(1),
  records: normalizationMappingRecordsSchema,
});

const sourceRecordIdSchema = z.union([z.number().int(), z.bigint()]);
const characterSourceRowSchema = z.object({
  sourceRecordId: sourceRecordIdSchema,
  sourceIdentifier: z.union([z.string(), z.null()]),
});
const relationshipSourceRowSchema = z.object({
  sourceRecordId: sourceRecordIdSchema,
  targetIdentifier: z.union([z.string(), z.null()]),
});

const relationshipContracts = [
  {
    key: "weaponCharacter",
    sourceTable: "weapon",
    targetColumn: "CharaId",
    sourceCategory: "weapon",
  },
  {
    key: "skillCharacter",
    sourceTable: "ability",
    targetColumn: "ReqCharaId1",
    sourceCategory: "skill",
  },
] as const;

export type RelationshipValidationConfig = z.infer<typeof relationshipValidationConfigSchema>;

export interface RelationshipCoverage {
  sourceCategory: "weapon" | "skill";
  targetCategory: "character";
  mappedSourceCount: number;
  resolvedReferenceCount: number;
  missingReferenceCount: number;
  unmappedTargetReferenceCount: number;
  unknownTargetReferenceCount: number;
  uniqueResolvedTargetCount: number;
  uniqueUnmappedTargetCount: number;
}

export interface RelationshipValidationResult {
  relationships: Record<(typeof relationshipContracts)[number]["key"], RelationshipCoverage>;
  readyForPublicRelationships: boolean;
}

export type RelationshipValidationErrorCode =
  "RELATIONSHIP_CANDIDATE_INVALID" | "RELATIONSHIP_MAPPING_INVALID" | "RELATIONSHIP_TABLE_INVALID";

export class RelationshipValidationError extends Error {
  constructor(
    readonly code: RelationshipValidationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RelationshipValidationError";
  }
}

export function readRelationshipValidationConfig(
  environment: NodeJS.ProcessEnv,
): RelationshipValidationConfig {
  return relationshipValidationConfigSchema.parse({
    candidateDatabasePath: environment.RELINK_CANDIDATE_DATABASE_PATH,
    mappingPath: environment.RELINK_NORMALIZATION_MAPPING_PATH,
  });
}

function readRelationshipMapping(mappingPath: string) {
  let mappingInput: unknown;

  try {
    mappingInput = JSON.parse(readFileSync(mappingPath, "utf8"));
  } catch {
    throw new RelationshipValidationError(
      "RELATIONSHIP_MAPPING_INVALID",
      "관계 검증용 mapping 파일을 읽을 수 없습니다.",
    );
  }

  const result = relationshipMappingSchema.safeParse(mappingInput);
  if (!result.success) {
    throw new RelationshipValidationError(
      "RELATIONSHIP_MAPPING_INVALID",
      "관계 검증용 mapping 파일 구조가 올바르지 않습니다.",
    );
  }
  return result.data;
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
    throw new RelationshipValidationError(
      "RELATIONSHIP_CANDIDATE_INVALID",
      "관계 후보 SQLite 데이터베이스를 읽기 전용으로 열 수 없습니다.",
    );
  }
}

function readCharacterRows(sqlite: Database.Database) {
  let rows: unknown[];
  try {
    rows = sqlite
      .prepare('SELECT rowid AS sourceRecordId, "CharId" AS sourceIdentifier FROM "chara"')
      .all();
  } catch {
    throw new RelationshipValidationError(
      "RELATIONSHIP_TABLE_INVALID",
      "후보 테이블 chara에서 관계 대상을 읽을 수 없습니다.",
    );
  }

  return rows.map((row) => {
    const result = characterSourceRowSchema.safeParse(row);
    if (!result.success) {
      throw new RelationshipValidationError(
        "RELATIONSHIP_TABLE_INVALID",
        "후보 테이블 chara에 지원하지 않는 관계 대상이 있습니다.",
      );
    }
    return result.data;
  });
}

function readRelationshipRows(
  sqlite: Database.Database,
  contract: (typeof relationshipContracts)[number],
) {
  let rows: unknown[];
  try {
    rows = sqlite
      .prepare(
        `SELECT rowid AS sourceRecordId, "${contract.targetColumn}" AS targetIdentifier FROM "${contract.sourceTable}"`,
      )
      .all();
  } catch {
    throw new RelationshipValidationError(
      "RELATIONSHIP_TABLE_INVALID",
      `후보 테이블 ${contract.sourceTable}에서 관계 입력을 읽을 수 없습니다.`,
    );
  }

  return rows.map((row) => {
    const result = relationshipSourceRowSchema.safeParse(row);
    if (!result.success) {
      throw new RelationshipValidationError(
        "RELATIONSHIP_TABLE_INVALID",
        `후보 테이블 ${contract.sourceTable}에 지원하지 않는 관계 입력이 있습니다.`,
      );
    }
    return result.data;
  });
}

function sourceKey(sourceTable: string, sourceRecordId: number | bigint): string {
  return `${sourceTable}:${String(sourceRecordId)}`;
}

export function validateRelationships(input: unknown): RelationshipValidationResult {
  const config = relationshipValidationConfigSchema.parse(input);
  const mapping = readRelationshipMapping(config.mappingPath);
  const mappedSources = new Map(
    mapping.records.map((record) => [`${record.sourceTable}:${record.sourceRecordId}`, record.id]),
  );
  const sqlite = openCandidateDatabase(config.candidateDatabasePath);

  try {
    const allCharacterIdentifiers = new Set<string>();
    const publicCharacterByIdentifier = new Map<string, string>();
    const characterRows = readCharacterRows(sqlite);
    const characterSourceRowIds = new Set(characterRows.map((row) => String(row.sourceRecordId)));
    const mappedCharacterRowIds = mapping.records
      .filter((record) => record.sourceTable === "chara")
      .map((record) => record.sourceRecordId);
    if (
      mappedCharacterRowIds.some((sourceRecordId) => !characterSourceRowIds.has(sourceRecordId))
    ) {
      throw new RelationshipValidationError(
        "RELATIONSHIP_MAPPING_INVALID",
        "관계 mapping이 후보 테이블 chara와 일치하지 않습니다.",
      );
    }

    for (const row of characterRows) {
      const publicIdentifier = mappedSources.get(sourceKey("chara", row.sourceRecordId));
      if (row.sourceIdentifier === null || row.sourceIdentifier.length === 0) {
        if (publicIdentifier) {
          throw new RelationshipValidationError(
            "RELATIONSHIP_MAPPING_INVALID",
            "공개 캐릭터 mapping에 관계 식별자가 없습니다.",
          );
        }
        continue;
      }
      if (row.sourceIdentifier !== row.sourceIdentifier.trim()) {
        throw new RelationshipValidationError(
          "RELATIONSHIP_TABLE_INVALID",
          "후보 테이블 chara에 비정규 관계 식별자가 있습니다.",
        );
      }
      if (allCharacterIdentifiers.has(row.sourceIdentifier)) {
        throw new RelationshipValidationError(
          "RELATIONSHIP_TABLE_INVALID",
          "후보 테이블 chara의 관계 식별자가 중복되었습니다.",
        );
      }
      allCharacterIdentifiers.add(row.sourceIdentifier);
      if (publicIdentifier) {
        publicCharacterByIdentifier.set(row.sourceIdentifier, publicIdentifier);
      }
    }

    const relationshipEntries = relationshipContracts.map((contract) => {
      const rows = readRelationshipRows(sqlite, contract);
      const sourceRowIds = new Set(rows.map((row) => String(row.sourceRecordId)));
      const expectedMappedRowIds = mapping.records
        .filter((record) => record.sourceTable === contract.sourceTable)
        .map((record) => record.sourceRecordId);
      if (expectedMappedRowIds.some((sourceRecordId) => !sourceRowIds.has(sourceRecordId))) {
        throw new RelationshipValidationError(
          "RELATIONSHIP_MAPPING_INVALID",
          `관계 mapping이 후보 테이블 ${contract.sourceTable}과 일치하지 않습니다.`,
        );
      }

      const coverage: RelationshipCoverage = {
        sourceCategory: contract.sourceCategory,
        targetCategory: "character",
        mappedSourceCount: 0,
        resolvedReferenceCount: 0,
        missingReferenceCount: 0,
        unmappedTargetReferenceCount: 0,
        unknownTargetReferenceCount: 0,
        uniqueResolvedTargetCount: 0,
        uniqueUnmappedTargetCount: 0,
      };
      const resolvedTargets = new Set<string>();
      const unmappedTargets = new Set<string>();

      for (const row of rows) {
        if (!mappedSources.has(sourceKey(contract.sourceTable, row.sourceRecordId))) {
          continue;
        }
        coverage.mappedSourceCount += 1;
        if (row.targetIdentifier === null || row.targetIdentifier.length === 0) {
          coverage.missingReferenceCount += 1;
          continue;
        }
        if (row.targetIdentifier !== row.targetIdentifier.trim()) {
          throw new RelationshipValidationError(
            "RELATIONSHIP_TABLE_INVALID",
            `후보 테이블 ${contract.sourceTable}에 비정규 관계 식별자가 있습니다.`,
          );
        }
        const publicTarget = publicCharacterByIdentifier.get(row.targetIdentifier);
        if (publicTarget) {
          coverage.resolvedReferenceCount += 1;
          resolvedTargets.add(publicTarget);
        } else if (allCharacterIdentifiers.has(row.targetIdentifier)) {
          coverage.unmappedTargetReferenceCount += 1;
          unmappedTargets.add(row.targetIdentifier);
        } else {
          coverage.unknownTargetReferenceCount += 1;
        }
      }

      coverage.uniqueResolvedTargetCount = resolvedTargets.size;
      coverage.uniqueUnmappedTargetCount = unmappedTargets.size;
      return [contract.key, coverage] as const;
    });
    const relationships = Object.fromEntries(
      relationshipEntries,
    ) as RelationshipValidationResult["relationships"];
    const readyForPublicRelationships = Object.values(relationships).every(
      (coverage) =>
        coverage.mappedSourceCount > 0 &&
        coverage.missingReferenceCount === 0 &&
        coverage.unmappedTargetReferenceCount === 0 &&
        coverage.unknownTargetReferenceCount === 0,
    );

    return { relationships, readyForPublicRelationships };
  } finally {
    sqlite.close();
  }
}
