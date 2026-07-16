import { encode } from "@msgpack/msgpack";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateMappingCandidate, MappingCandidateError } from "./generate-mapping-candidate";

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

function createFixture(options: { duplicateCharacterIdentifier?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "relink-mapping-candidate-"));
  temporaryRoots.push(root);
  const privateDirectory = join(root, "private");
  const koreanMessageDirectoryPath = join(privateDirectory, "ko");
  mkdirSync(koreanMessageDirectoryPath, { recursive: true });
  const candidateDatabasePath = join(privateDirectory, "candidate.sqlite");
  const targetDatabasePath = join(privateDirectory, "relink.sqlite");
  const mappingOutputPath = join(privateDirectory, "normalization-mapping.v1.json");
  const source = new Database(candidateDatabasePath);

  source.exec(`
    CREATE TABLE chara (CharId TEXT, CharaName TEXT);
    CREATE TABLE weapon (Key TEXT, Name TEXT);
    CREATE TABLE gem (Key TEXT, Name TEXT);
    CREATE TABLE ability (Key TEXT, Unk5 TEXT);
    INSERT INTO chara VALUES
      ('PL0000', 'TXT_PL0000'),
      (NULL, NULL),
      ('PL9999', 'UNRESOLVED_CHARACTER')
      ${options.duplicateCharacterIdentifier ? ", ('PL0000', 'TXT_PL0001')" : ""};
    INSERT INTO weapon VALUES
      ('WEP_001', 'TXT_WEP_001'),
      ('WEP_002', 'UNRESOLVED_WEAPON'),
      ('WEP_003', '');
    INSERT INTO gem VALUES ('GEM_001', 'TXT_GEM_001');
    INSERT INTO ability VALUES
      ('ABILITY_001', 'TXT_ABILITY_001'),
      ('ABILITY_002', ' TXT_ABILITY_001 ');
  `);
  source.close();

  writeMessage(join(koreanMessageDirectoryPath, "text_chara.msg"), [
    ["TXT_PL0000", "그랑"],
    ...(options.duplicateCharacterIdentifier ? [["TXT_PL0001", "지타"] as [string, string]] : []),
  ]);
  writeMessage(join(koreanMessageDirectoryPath, "text.msg"), [
    ["TXT_WEP_001", "검"],
    ["TXT_GEM_001", "공격력"],
    ["TXT_ABILITY_001", "레긴레이브"],
  ]);

  return {
    candidateDatabasePath,
    targetDatabasePath,
    koreanMessageDirectoryPath,
    mappingOutputPath,
    extractorVersion: "2.0.0" as const,
    schemaVersion: 1 as const,
  };
}

describe("generateMappingCandidate", () => {
  it("writes a private mapping candidate from matched canonical localization rows", () => {
    const config = createFixture();

    const result = generateMappingCandidate(config);
    const mapping = JSON.parse(readFileSync(config.mappingOutputPath, "utf8")) as {
      importRunId: string;
      schemaVersion: number;
      records: unknown[];
    };

    expect(result).toMatchObject({ reusedImport: false, recordCount: 4 });
    expect(result.categories.character).toMatchObject({
      sourceRowCount: 3,
      generatedRecordCount: 1,
      ignoredRowCount: 1,
      unresolvedRowCount: 1,
    });
    expect(result.categories.weapon).toMatchObject({
      sourceRowCount: 3,
      generatedRecordCount: 1,
      ignoredRowCount: 1,
      unresolvedRowCount: 1,
    });
    expect(result.categories.skill).toMatchObject({
      sourceRowCount: 2,
      matchedRowCount: 2,
      nonCanonicalKeyRowCount: 1,
      generatedRecordCount: 1,
    });
    expect(mapping).toEqual({
      importRunId: result.importRunId,
      schemaVersion: 1,
      records: [
        {
          sourceTable: "chara",
          sourceRecordId: "1",
          id: "character-pl0000",
          slug: "character-pl0000",
          nameKo: "그랑",
        },
        {
          sourceTable: "weapon",
          sourceRecordId: "1",
          id: "weapon-wep-001",
          slug: "weapon-wep-001",
          nameKo: "검",
        },
        {
          sourceTable: "gem",
          sourceRecordId: "1",
          id: "sigil-gem-001",
          slug: "sigil-gem-001",
          nameKo: "공격력",
        },
        {
          sourceTable: "ability",
          sourceRecordId: "1",
          id: "skill-ability-001",
          slug: "skill-ability-001",
          nameKo: "레긴레이브",
        },
      ],
    });
    expect(JSON.stringify(mapping)).not.toContain("UNRESOLVED");
  });

  it("never overwrites an existing private mapping file", () => {
    const config = createFixture();
    writeFileSync(config.mappingOutputPath, "operator-reviewed");

    expect(() => generateMappingCandidate(config)).toThrow(MappingCandidateError);
    expect(readFileSync(config.mappingOutputPath, "utf8")).toBe("operator-reviewed");
    expect(() => readFileSync(config.targetDatabasePath)).toThrow();
    try {
      generateMappingCandidate(config);
    } catch (error) {
      expect(error).toMatchObject({ code: "MAPPING_CANDIDATE_OUTPUT_EXISTS" });
      expect(String(error)).not.toContain(config.mappingOutputPath);
    }
  });

  it("rejects duplicate public identifiers without writing private values", () => {
    const config = createFixture({ duplicateCharacterIdentifier: true });

    expect(() => generateMappingCandidate(config)).toThrow(MappingCandidateError);
    try {
      generateMappingCandidate(config);
    } catch (error) {
      expect(error).toMatchObject({ code: "MAPPING_CANDIDATE_SOURCE_INVALID" });
      expect(String(error)).not.toContain("PL0000");
      expect(String(error)).not.toContain(config.mappingOutputPath);
    }
  });
});
