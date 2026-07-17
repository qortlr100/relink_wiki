import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations, openDatabase, openExistingDatabase } from "./index";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryPath(fileName: string): string {
  const directory = mkdtempSync(join(tmpdir(), "relink-database-open-"));
  temporaryDirectories.push(directory);
  return join(directory, fileName);
}

describe("database open modes", () => {
  it("does not create a file when an existing writable database is required", () => {
    const databasePath = temporaryPath("missing.sqlite");

    expect(() => openExistingDatabase({ path: databasePath })).toThrow();
    expect(existsSync(databasePath)).toBe(false);
  });

  it("opens an existing migrated database for writes", () => {
    const databasePath = temporaryPath("existing.sqlite");
    const created = openDatabase({ path: databasePath });
    applyMigrations(created.sqlite);
    created.sqlite.close();

    const existing = openExistingDatabase({ path: databasePath });
    expect(existing.sqlite.pragma("query_only", { simple: true })).toBe(0);
    existing.sqlite.close();
  });
});
