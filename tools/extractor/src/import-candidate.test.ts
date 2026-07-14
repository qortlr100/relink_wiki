import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { CandidateImportError, importCandidateDatabase } from "./import-candidate";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function createFixture(options: { omitAbility?: boolean; abilityWithoutRowId?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "relink-import-"));
  temporaryRoots.push(root);
  const privateDirectory = join(root, "private");
  mkdirSync(privateDirectory);
  const candidateDatabasePath = join(privateDirectory, "candidate.sqlite");
  const targetDatabasePath = join(privateDirectory, "relink.sqlite");
  const source = new Database(candidateDatabasePath);

  source.exec(`
    CREATE TABLE chara (CharacterId INTEGER, InternalName TEXT);
    CREATE TABLE weapon (WeaponId INTEGER, OwnerId INTEGER);
    CREATE TABLE gem (GemId INTEGER, Category INTEGER);
    ${
      options.omitAbility
        ? ""
        : options.abilityWithoutRowId
          ? "CREATE TABLE ability (AbilityId INTEGER PRIMARY KEY, CharacterId INTEGER) WITHOUT ROWID;"
          : "CREATE TABLE ability (AbilityId INTEGER, CharacterId INTEGER);"
    }
    INSERT INTO chara VALUES (10, 'pl0000');
    INSERT INTO weapon VALUES (20, 10);
    INSERT INTO gem VALUES (30, 2);
    ${options.omitAbility ? "" : "INSERT INTO ability VALUES (40, 10);"}
  `);
  source.close();

  return {
    candidateDatabasePath,
    targetDatabasePath,
    extractorVersion: "2.0.0" as const,
    schemaVersion: 1 as const,
  };
}

describe("importCandidateDatabase", () => {
  it("imports the four allowlisted source tables and preserves the skill warning", () => {
    const config = createFixture();

    const firstResult = importCandidateDatabase(config);
    const secondResult = importCandidateDatabase(config);
    const target = new Database(config.targetDatabasePath, { readonly: true });
    const tableCounts = target
      .prepare("SELECT source_table, count(*) AS count FROM staging_records GROUP BY source_table")
      .all();
    const warnings = target.prepare("SELECT code, source_file_id FROM import_warnings").all();
    target.close();

    expect(firstResult).toMatchObject({ reused: false, recordCount: 4, warningCount: 1 });
    expect(secondResult).toMatchObject({
      importRunId: firstResult.importRunId,
      reused: true,
      recordCount: 4,
      warningCount: 1,
    });
    expect(tableCounts).toEqual([
      { source_table: "ability", count: 1 },
      { source_table: "chara", count: 1 },
      { source_table: "gem", count: 1 },
      { source_table: "weapon", count: 1 },
    ]);
    expect(warnings).toEqual([
      { code: "SKILL_TABLE_INCOMPATIBLE", source_file_id: "system/table/skill.tbl" },
    ]);
  });

  it("fails with a stable error without exposing the private path", () => {
    const config = createFixture({ omitAbility: true });

    expect(() => importCandidateDatabase(config)).toThrow(CandidateImportError);
    try {
      importCandidateDatabase(config);
    } catch (error) {
      expect(error).toMatchObject({ code: "CANDIDATE_TABLE_MISSING" });
      expect(String(error)).not.toContain(config.candidateDatabasePath);
    }
  });

  it("rejects using the candidate database as the writable target before changing it", () => {
    const config = createFixture();
    const conflictingConfig = {
      ...config,
      targetDatabasePath: config.candidateDatabasePath,
    };

    expect(() => importCandidateDatabase(conflictingConfig)).toThrow(CandidateImportError);
    try {
      importCandidateDatabase(conflictingConfig);
    } catch (error) {
      expect(error).toMatchObject({ code: "CANDIDATE_TARGET_PATH_CONFLICT" });
    }

    const candidate = new Database(config.candidateDatabasePath, { readonly: true });
    const internalTables = candidate
      .prepare("SELECT name FROM sqlite_master WHERE name LIKE '_relink_%'")
      .all();
    candidate.close();
    expect(internalTables).toEqual([]);
  });

  it("maps an unsupported source table structure to a stable error", () => {
    const config = createFixture({ abilityWithoutRowId: true });

    expect(() => importCandidateDatabase(config)).toThrow(CandidateImportError);
    try {
      importCandidateDatabase(config);
    } catch (error) {
      expect(error).toMatchObject({ code: "CANDIDATE_TABLE_INVALID" });
      expect(String(error)).not.toContain("no such column");
    }
  });
});
