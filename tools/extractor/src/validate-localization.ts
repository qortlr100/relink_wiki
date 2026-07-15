import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decode } from "@msgpack/msgpack";
import Database from "better-sqlite3";
import { z } from "zod";

const localizationValidationConfigSchema = z.object({
  candidateDatabasePath: z.string().min(1),
  koreanMessageDirectoryPath: z.string().min(1),
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

const sourceMessageKeySchema = z.object({
  messageKey: z.union([z.string(), z.null()]),
});

export const localizationJoinContracts = [
  {
    category: "character",
    sourceTable: "chara",
    sourceIdentifierColumn: "CharId",
    sourceColumn: "CharaName",
    messageFile: "text_chara.msg",
  },
  {
    category: "weapon",
    sourceTable: "weapon",
    sourceIdentifierColumn: "Key",
    sourceColumn: "Name",
    messageFile: "text.msg",
  },
  {
    category: "sigil",
    sourceTable: "gem",
    sourceIdentifierColumn: "Key",
    sourceColumn: "Name",
    messageFile: "text.msg",
  },
  {
    category: "skill",
    sourceTable: "ability",
    sourceIdentifierColumn: "Key",
    sourceColumn: "Unk5",
    messageFile: "text.msg",
  },
] as const;

export type LocalizationValidationConfig = z.infer<typeof localizationValidationConfigSchema>;

export interface LocalizationCategoryResult {
  sourceRowCount: number;
  eligibleRowCount: number;
  matchedRowCount: number;
  ignoredRowCount: number;
  nonCanonicalKeyRowCount: number;
  unresolvedRowCount: number;
  unresolvedKeyCount: number;
}

export interface LocalizationValidationResult {
  categories: Record<
    (typeof localizationJoinContracts)[number]["category"],
    LocalizationCategoryResult
  >;
  readyForAutomaticNormalization: boolean;
}

export type LocalizationValidationErrorCode =
  "LOCALIZATION_CANDIDATE_INVALID" | "LOCALIZATION_MESSAGE_INVALID" | "LOCALIZATION_TABLE_INVALID";

export class LocalizationValidationError extends Error {
  constructor(
    readonly code: LocalizationValidationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LocalizationValidationError";
  }
}

export function readLocalizationValidationConfig(
  environment: NodeJS.ProcessEnv,
): LocalizationValidationConfig {
  return localizationValidationConfigSchema.parse({
    candidateDatabasePath: environment.RELINK_CANDIDATE_DATABASE_PATH,
    koreanMessageDirectoryPath: environment.RELINK_KOREAN_MESSAGE_DIRECTORY_PATH,
  });
}

export function readMessageCatalog(messagePath: string): Map<string, string> {
  let decodedMessage: unknown;

  try {
    decodedMessage = decode(readFileSync(messagePath));
  } catch {
    throw new LocalizationValidationError(
      "LOCALIZATION_MESSAGE_INVALID",
      "한국어 메시지 파일을 읽거나 디코딩할 수 없습니다.",
    );
  }

  const parsedMessage = messageDocumentSchema.safeParse(decodedMessage);
  if (!parsedMessage.success) {
    throw new LocalizationValidationError(
      "LOCALIZATION_MESSAGE_INVALID",
      "한국어 메시지 파일 구조가 지원하는 계약과 일치하지 않습니다.",
    );
  }

  const catalog = new Map<string, string>();
  for (const row of parsedMessage.data.rows_) {
    if (row.column_.subid_hash_.length > 0) {
      continue;
    }
    if (catalog.has(row.column_.id_hash_)) {
      throw new LocalizationValidationError(
        "LOCALIZATION_MESSAGE_INVALID",
        "한국어 메시지 파일에 중복 식별자가 있습니다.",
      );
    }
    catalog.set(row.column_.id_hash_, row.column_.text_);
  }
  return catalog;
}

function openCandidateDatabase(path: string): Database.Database {
  let sqlite: Database.Database | undefined;

  try {
    sqlite = new Database(path, { fileMustExist: true, readonly: true });
    sqlite.pragma("query_only = ON");
    return sqlite;
  } catch {
    sqlite?.close();
    throw new LocalizationValidationError(
      "LOCALIZATION_CANDIDATE_INVALID",
      "후보 SQLite 데이터베이스를 읽기 전용으로 열 수 없습니다.",
    );
  }
}

function readMessageKeys(
  sqlite: Database.Database,
  contract: (typeof localizationJoinContracts)[number],
): (string | null)[] {
  let rows: unknown[];

  try {
    rows = sqlite
      .prepare(
        `SELECT "${contract.sourceColumn}" AS messageKey FROM "${contract.sourceTable}" ORDER BY rowid`,
      )
      .all();
  } catch {
    throw new LocalizationValidationError(
      "LOCALIZATION_TABLE_INVALID",
      `후보 테이블 ${contract.sourceTable}의 메시지 키를 읽을 수 없습니다.`,
    );
  }

  return rows.map((row) => {
    const parsedRow = sourceMessageKeySchema.safeParse(row);
    if (!parsedRow.success) {
      throw new LocalizationValidationError(
        "LOCALIZATION_TABLE_INVALID",
        `후보 테이블 ${contract.sourceTable}에 지원하지 않는 메시지 키가 있습니다.`,
      );
    }
    return parsedRow.data.messageKey;
  });
}

export function validateLocalizationJoins(input: unknown): LocalizationValidationResult {
  const config = localizationValidationConfigSchema.parse(input);
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
    const categoryEntries = localizationJoinContracts.map((contract) => {
      const messageKeys = readMessageKeys(sqlite, contract);
      const eligibleKeys = messageKeys.flatMap((messageKey) => {
        if (messageKey === null) {
          return [];
        }

        const lookupKey = messageKey.trim();
        return lookupKey.length > 0 ? [{ messageKey, lookupKey }] : [];
      });
      const catalog = catalogs.get(contract.messageFile);
      if (!catalog) {
        throw new LocalizationValidationError(
          "LOCALIZATION_MESSAGE_INVALID",
          "필수 한국어 메시지 카탈로그를 찾을 수 없습니다.",
        );
      }
      const unresolvedKeys = eligibleKeys.filter(({ lookupKey }) => {
        const localizedText = catalog.get(lookupKey);
        return localizedText === undefined || localizedText.trim().length === 0;
      });

      return [
        contract.category,
        {
          sourceRowCount: messageKeys.length,
          eligibleRowCount: eligibleKeys.length,
          matchedRowCount: eligibleKeys.length - unresolvedKeys.length,
          ignoredRowCount: messageKeys.length - eligibleKeys.length,
          nonCanonicalKeyRowCount: eligibleKeys.filter(
            ({ messageKey, lookupKey }) => messageKey !== lookupKey,
          ).length,
          unresolvedRowCount: unresolvedKeys.length,
          unresolvedKeyCount: new Set(unresolvedKeys.map(({ lookupKey }) => lookupKey)).size,
        },
      ] as const;
    });
    const categories = Object.fromEntries(
      categoryEntries,
    ) as LocalizationValidationResult["categories"];

    return {
      categories,
      readyForAutomaticNormalization: Object.values(categories).every(
        (category) =>
          category.sourceRowCount > 0 &&
          category.unresolvedRowCount === 0 &&
          category.ignoredRowCount === 0 &&
          category.nonCanonicalKeyRowCount === 0,
      ),
    };
  } finally {
    sqlite.close();
  }
}
