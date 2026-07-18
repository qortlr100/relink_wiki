import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RelationshipValidationError, validateRelationships } from "./validate-relationships";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function mappingRecord(sourceTable: "chara" | "weapon" | "ability", sourceRecordId: string) {
  const category =
    sourceTable === "chara" ? "character" : sourceTable === "weapon" ? "weapon" : "skill";
  const id = `${category}-${sourceRecordId}`;
  return { sourceTable, sourceRecordId, id, slug: id, nameKo: `${category} ${sourceRecordId}` };
}

function createFixture(options: { fullyResolved?: boolean; omitAbility?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "relink-relationships-"));
  temporaryRoots.push(root);
  const candidateDatabasePath = join(root, "candidate.sqlite");
  const mappingPath = join(root, "mapping.json");
  const sqlite = new Database(candidateDatabasePath);
  sqlite.exec(`
    CREATE TABLE chara (CharId TEXT);
    CREATE TABLE weapon (CharaId TEXT);
    ${options.omitAbility ? "" : "CREATE TABLE ability (ReqCharaId1 TEXT);"}
    INSERT INTO chara VALUES ('CHAR_PUBLIC'), ('CHAR_PRIVATE');
    INSERT INTO weapon VALUES ('CHAR_PUBLIC'), ('CHAR_PRIVATE'), ('CHAR_UNKNOWN'), (NULL);
    ${options.omitAbility ? "" : "INSERT INTO ability VALUES ('CHAR_PUBLIC'), ('CHAR_PRIVATE');"}
  `);
  sqlite.close();

  const records = [
    mappingRecord("chara", "1"),
    ...(options.fullyResolved ? [mappingRecord("chara", "2")] : []),
    mappingRecord("weapon", "1"),
    mappingRecord("weapon", "2"),
    ...(options.fullyResolved ? [] : [mappingRecord("weapon", "3"), mappingRecord("weapon", "4")]),
    ...(!options.omitAbility ? [mappingRecord("ability", "1"), mappingRecord("ability", "2")] : []),
  ];
  writeFileSync(mappingPath, JSON.stringify({ schemaVersion: 1, records }));
  return { candidateDatabasePath, mappingPath };
}

describe("validateRelationships", () => {
  it("reports only aggregate public relationship readiness", () => {
    const result = validateRelationships(createFixture());

    expect(result).toEqual({
      relationships: {
        weaponCharacter: {
          sourceCategory: "weapon",
          targetCategory: "character",
          mappedSourceCount: 4,
          resolvedReferenceCount: 1,
          missingReferenceCount: 1,
          unmappedTargetReferenceCount: 1,
          unknownTargetReferenceCount: 1,
          uniqueResolvedTargetCount: 1,
          uniqueUnmappedTargetCount: 1,
        },
        skillCharacter: {
          sourceCategory: "skill",
          targetCategory: "character",
          mappedSourceCount: 2,
          resolvedReferenceCount: 1,
          missingReferenceCount: 0,
          unmappedTargetReferenceCount: 1,
          unknownTargetReferenceCount: 0,
          uniqueResolvedTargetCount: 1,
          uniqueUnmappedTargetCount: 1,
        },
      },
      readyForPublicRelationships: false,
    });
    expect(JSON.stringify(result)).not.toContain("CHAR_");
  });

  it("reports readiness when every mapped source resolves to a public character", () => {
    const result = validateRelationships(createFixture({ fullyResolved: true }));

    expect(result.readyForPublicRelationships).toBe(true);
    expect(result.relationships.weaponCharacter).toMatchObject({
      mappedSourceCount: 2,
      resolvedReferenceCount: 2,
      unmappedTargetReferenceCount: 0,
      unknownTargetReferenceCount: 0,
    });
    expect(result.relationships.skillCharacter).toMatchObject({
      mappedSourceCount: 2,
      resolvedReferenceCount: 2,
    });
  });

  it("rejects a missing relationship table without exposing the database path", () => {
    const config = createFixture({ omitAbility: true });

    expect(() => validateRelationships(config)).toThrow(RelationshipValidationError);
    try {
      validateRelationships(config);
    } catch (error) {
      expect(error).toMatchObject({ code: "RELATIONSHIP_TABLE_INVALID" });
      expect(String(error)).not.toContain(config.candidateDatabasePath);
    }
  });

  it("rejects an invalid mapping without exposing its path or values", () => {
    const config = createFixture();
    writeFileSync(config.mappingPath, JSON.stringify({ schemaVersion: 1, records: [] }));

    expect(() => validateRelationships(config)).toThrow(RelationshipValidationError);
    try {
      validateRelationships(config);
    } catch (error) {
      expect(error).toMatchObject({ code: "RELATIONSHIP_MAPPING_INVALID" });
      expect(String(error)).not.toContain(config.mappingPath);
    }
  });

  it("rejects a mapping that points to a missing character row", () => {
    const config = createFixture();
    const records = [
      mappingRecord("chara", "99"),
      mappingRecord("weapon", "1"),
      mappingRecord("ability", "1"),
    ];
    writeFileSync(config.mappingPath, JSON.stringify({ schemaVersion: 1, records }));

    expect(() => validateRelationships(config)).toThrow(RelationshipValidationError);
    try {
      validateRelationships(config);
    } catch (error) {
      expect(error).toMatchObject({ code: "RELATIONSHIP_MAPPING_INVALID" });
      expect(String(error)).not.toContain("99");
    }
  });
});
