import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations, openDatabase } from "@relink-wiki/database";
import { loadDashboard } from "./dashboard-data";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryPath(fileName: string): string {
  const directory = mkdtempSync(join(tmpdir(), "relink-admin-dashboard-"));
  temporaryDirectories.push(directory);
  return join(directory, fileName);
}

describe("dashboard data loader", () => {
  it("returns safe guidance when the database path is unset", () => {
    expect(loadDashboard("")).toEqual({
      kind: "error",
      code: "DATABASE_PATH_UNSET",
      title: "로컬 데이터베이스가 설정되지 않았습니다",
      message: "RELINK_DATABASE_PATH를 설정한 뒤 관리 앱을 다시 시작하세요.",
    });
  });

  it("distinguishes a missing database without returning its path", () => {
    const databasePath = temporaryPath("missing.sqlite");
    const state = loadDashboard(databasePath);

    expect(state).toMatchObject({ kind: "error", code: "DATABASE_NOT_FOUND" });
    expect(JSON.stringify(state)).not.toContain(databasePath);
  });

  it("returns a safe invalid-database error for a damaged file", () => {
    const databasePath = temporaryPath("damaged.sqlite");
    writeFileSync(databasePath, "not a sqlite database", "utf8");
    const state = loadDashboard(databasePath);

    expect(state).toMatchObject({ kind: "error", code: "DATABASE_INVALID" });
    expect(JSON.stringify(state)).not.toContain(databasePath);
    expect(JSON.stringify(state)).not.toContain("not a sqlite database");
  });

  it("opens a migrated database in read-only mode", () => {
    const databasePath = temporaryPath("ready.sqlite");
    const writable = openDatabase({ path: databasePath });
    applyMigrations(writable.sqlite);
    writable.sqlite.close();

    expect(loadDashboard(databasePath)).toEqual({
      kind: "ready",
      dashboard: { normalizationRuns: [], currentBaseline: null, currentPublication: null },
      preview: { status: "unavailable", message: "승인된 baseline이 아직 없습니다." },
    });
  });
});
