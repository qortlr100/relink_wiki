import { encode } from "@msgpack/msgpack";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ProtagonistMappingRevisionError,
  reviseProtagonistMapping,
} from "./revise-protagonist-mapping";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function writeCharacterMessages(path: string, contextName = "주인공"): void {
  writeFileSync(
    path,
    encode({
      rows_: [
        {
          column_: { id_hash_: "TXT_KNOWN", subid_hash_: "", text_: "그랑" },
        },
        {
          column_: { id_hash_: "TXT_PROTAGONIST", subid_hash_: "", text_: "" },
        },
        ...Array.from({ length: 6 }, (_, index) => ({
          column_: {
            id_hash_: "TXT_PROTAGONIST",
            subid_hash_: `context-${String(index + 1)}`,
            text_: contextName,
          },
        })),
      ],
    }),
  );
}

function createFixture(options: { contextName?: string; secondGender?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), "relink-protagonist-mapping-"));
  temporaryRoots.push(root);
  const koreanMessageDirectoryPath = join(root, "ko");
  mkdirSync(koreanMessageDirectoryPath);
  const candidateDatabasePath = join(root, "candidate.sqlite");
  const mappingPath = join(root, "mapping.json");
  const mappingRevisionOutputPath = join(root, "mapping.protagonists.json");
  const secondGender = String(options.secondGender ?? 2);
  const sqlite = new Database(candidateDatabasePath);
  sqlite.exec(`
    CREATE TABLE chara (
      CharId TEXT,
      CharaName TEXT,
      IsNPC INTEGER,
      MaxLevelMaybe INTEGER,
      Gender INTEGER,
      UIOrder INTEGER
    );
    INSERT INTO chara VALUES
      ('PL_KNOWN', 'TXT_KNOWN', 0, 100, 1, 1),
      (NULL, NULL, NULL, NULL, NULL, NULL),
      ('PL_PROTAGONIST_M', 'TXT_PROTAGONIST', 0, 100, 1, 2),
      ('PL_PROTAGONIST_F', 'TXT_PROTAGONIST', 0, 100, ${secondGender}, 3);
  `);
  sqlite.close();
  writeCharacterMessages(join(koreanMessageDirectoryPath, "text_chara.msg"), options.contextName);
  writeFileSync(
    mappingPath,
    JSON.stringify({
      importRunId: "00000000-0000-4000-8000-000000000000",
      schemaVersion: 1,
      records: [
        {
          sourceTable: "chara",
          sourceRecordId: "1",
          id: "character-pl-known",
          slug: "character-pl-known",
          nameKo: "그랑",
        },
      ],
    }),
  );
  return {
    candidateDatabasePath,
    koreanMessageDirectoryPath,
    mappingPath,
    mappingRevisionOutputPath,
  };
}

describe("reviseProtagonistMapping", () => {
  it("writes a new mapping revision after validating the narrow protagonist policy", () => {
    const config = createFixture();

    const result = reviseProtagonistMapping(config);
    const mapping = JSON.parse(readFileSync(config.mappingRevisionOutputPath, "utf8")) as {
      records: { id: string; nameKo: string }[];
    };

    expect(result).toEqual({
      recordCount: 3,
      addedRecordCount: 2,
      verifiedContextCount: 6,
    });
    expect(mapping.records.slice(1)).toEqual([
      {
        id: "character-pl-protagonist-m",
        slug: "character-pl-protagonist-m",
        nameKo: "주인공 (남성)",
        sourceRecordId: "3",
        sourceTable: "chara",
      },
      {
        id: "character-pl-protagonist-f",
        slug: "character-pl-protagonist-f",
        nameKo: "주인공 (여성)",
        sourceRecordId: "4",
        sourceTable: "chara",
      },
    ]);
  });

  it("does not overwrite an existing mapping revision", () => {
    const config = createFixture();
    writeFileSync(config.mappingRevisionOutputPath, "operator-reviewed");

    expect(() => reviseProtagonistMapping(config)).toThrow(ProtagonistMappingRevisionError);
    expect(readFileSync(config.mappingRevisionOutputPath, "utf8")).toBe("operator-reviewed");
  });

  it.each([
    ["changed Korean context", { contextName: "다른 이름" }, "PL_PROTAGONIST_M"],
    ["changed gender evidence", { secondGender: 1 }, "PL_PROTAGONIST_F"],
  ])("rejects %s without exposing private identifiers", (_label, options, privateIdentifier) => {
    const config = createFixture(options);

    expect(() => reviseProtagonistMapping(config)).toThrow(ProtagonistMappingRevisionError);
    expect(() => readFileSync(config.mappingRevisionOutputPath)).toThrow();
    try {
      reviseProtagonistMapping(config);
    } catch (error) {
      expect(error).toMatchObject({ code: "PROTAGONIST_MAPPING_EVIDENCE_INVALID" });
      expect(String(error)).not.toContain(privateIdentifier);
      expect(String(error)).not.toContain(config.candidateDatabasePath);
    }
  });
});
