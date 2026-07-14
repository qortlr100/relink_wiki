import { encode } from "@msgpack/msgpack";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalizationValidationError, validateLocalizationJoins } from "./validate-localization";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function writeMessage(path: string, entries: [string, string][]): void {
  writeFileSync(
    path,
    encode({
      rows_: entries.map(([messageKey, localizedText]) => ({
        column_: { id_hash_: messageKey, subid_hash_: "", text_: localizedText },
      })),
    }),
  );
}

function createFixture(
  options: { omitAbility?: boolean; invalidMessage?: boolean; resolveWeapon?: boolean } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "relink-localization-"));
  temporaryRoots.push(root);
  const candidateDatabasePath = join(root, "candidate.sqlite");
  const koreanMessageDirectoryPath = join(root, "ko");
  mkdirSync(koreanMessageDirectoryPath);

  const sqlite = new Database(candidateDatabasePath);
  sqlite.exec(`
    CREATE TABLE chara (CharaName TEXT);
    CREATE TABLE weapon (Name TEXT);
    CREATE TABLE gem (Name TEXT);
    ${options.omitAbility ? "" : "CREATE TABLE ability (Unk5 TEXT);"}
    INSERT INTO chara VALUES ('TXT_PL0000'), (NULL);
    INSERT INTO weapon VALUES ('TXT_WEP_NAME_PL0000_01'), ('UNRESOLVED_HASH'), ('');
    INSERT INTO gem VALUES ('TXT_GEEN_000_00');
    ${options.omitAbility ? "" : "INSERT INTO ability VALUES ('TXT_AB_PL0000_01');"}
  `);
  sqlite.close();

  if (options.invalidMessage) {
    writeFileSync(join(koreanMessageDirectoryPath, "text.msg"), "invalid");
  } else {
    writeMessage(join(koreanMessageDirectoryPath, "text.msg"), [
      ["TXT_WEP_NAME_PL0000_01", "무기"],
      ...(options.resolveWeapon ? [["UNRESOLVED_HASH", "미해결 무기"] as [string, string]] : []),
      ["TXT_GEEN_000_00", "진"],
      ["TXT_AB_PL0000_01", "스킬"],
    ]);
  }
  writeFileSync(
    join(koreanMessageDirectoryPath, "text_chara.msg"),
    encode({
      rows_: [
        {
          column_: { id_hash_: "TXT_PL0000", subid_hash_: "", text_: "캐릭터" },
        },
        {
          column_: {
            id_hash_: "TXT_PL0000",
            subid_hash_: "note_entry",
            text_: "다른 문맥",
          },
        },
      ],
    }),
  );

  return { candidateDatabasePath, koreanMessageDirectoryPath };
}

describe("validateLocalizationJoins", () => {
  it("reports coverage without returning private keys or localized text", () => {
    const result = validateLocalizationJoins(createFixture());

    expect(result).toEqual({
      categories: {
        character: {
          sourceRowCount: 2,
          eligibleRowCount: 1,
          matchedRowCount: 1,
          ignoredRowCount: 1,
          unresolvedRowCount: 0,
          unresolvedKeyCount: 0,
        },
        weapon: {
          sourceRowCount: 3,
          eligibleRowCount: 2,
          matchedRowCount: 1,
          ignoredRowCount: 1,
          unresolvedRowCount: 1,
          unresolvedKeyCount: 1,
        },
        sigil: {
          sourceRowCount: 1,
          eligibleRowCount: 1,
          matchedRowCount: 1,
          ignoredRowCount: 0,
          unresolvedRowCount: 0,
          unresolvedKeyCount: 0,
        },
        skill: {
          sourceRowCount: 1,
          eligibleRowCount: 1,
          matchedRowCount: 1,
          ignoredRowCount: 0,
          unresolvedRowCount: 0,
          unresolvedKeyCount: 0,
        },
      },
      readyForAutomaticNormalization: false,
    });
    expect(JSON.stringify(result)).not.toContain("UNRESOLVED_HASH");
    expect(JSON.stringify(result)).not.toContain("캐릭터");
  });

  it("maps invalid message data to a stable error without exposing its path", () => {
    const config = createFixture({ invalidMessage: true });

    expect(() => validateLocalizationJoins(config)).toThrow(LocalizationValidationError);
    try {
      validateLocalizationJoins(config);
    } catch (error) {
      expect(error).toMatchObject({ code: "LOCALIZATION_MESSAGE_INVALID" });
      expect(String(error)).not.toContain(config.koreanMessageDirectoryPath);
    }
  });

  it("does not report automatic normalization readiness while ignored rows remain", () => {
    const result = validateLocalizationJoins(createFixture({ resolveWeapon: true }));

    expect(
      Object.values(result.categories).every((category) => category.unresolvedRowCount === 0),
    ).toBe(true);
    expect(Object.values(result.categories).some((category) => category.ignoredRowCount > 0)).toBe(
      true,
    );
    expect(result.readyForAutomaticNormalization).toBe(false);
  });

  it("maps missing candidate tables to a stable error", () => {
    const config = createFixture({ omitAbility: true });

    expect(() => validateLocalizationJoins(config)).toThrow(LocalizationValidationError);
    try {
      validateLocalizationJoins(config);
    } catch (error) {
      expect(error).toMatchObject({ code: "LOCALIZATION_TABLE_INVALID" });
      expect(String(error)).not.toContain("no such table");
    }
  });
});
