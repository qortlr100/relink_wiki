import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

const migrations = [
  {
    id: "0000_initial",
    path: fileURLToPath(new URL("../migrations/0000_initial.sql", import.meta.url)),
  },
  {
    id: "0001_normalized_records",
    path: fileURLToPath(new URL("../migrations/0001_normalized_records.sql", import.meta.url)),
  },
  {
    id: "0002_normalization_acceptance",
    path: fileURLToPath(
      new URL("../migrations/0002_normalization_acceptance.sql", import.meta.url),
    ),
  },
  {
    id: "0003_publication_history",
    path: fileURLToPath(new URL("../migrations/0003_publication_history.sql", import.meta.url)),
  },
  {
    id: "0004_record_review_decisions",
    path: fileURLToPath(new URL("../migrations/0004_record_review_decisions.sql", import.meta.url)),
  },
] as const;

export class DatabaseMigrationError extends Error {
  readonly code = "DATABASE_MIGRATION_CHANGED";

  constructor() {
    super("이미 적용된 데이터베이스 마이그레이션 파일이 변경되었습니다.");
    this.name = "DatabaseMigrationError";
  }
}

export function applyMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _relink_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const findMigration = sqlite.prepare<[string], { checksum: string }>(
    "SELECT checksum FROM _relink_migrations WHERE id = ?",
  );
  const recordMigration = sqlite.prepare(
    "INSERT INTO _relink_migrations (id, checksum, applied_at) VALUES (?, ?, ?)",
  );

  for (const migration of migrations) {
    const sql = readFileSync(migration.path, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");

    sqlite
      .transaction(() => {
        const applied = findMigration.get(migration.id);

        if (applied) {
          if (applied.checksum !== checksum) {
            throw new DatabaseMigrationError();
          }
          return;
        }

        sqlite.exec(sql);
        recordMigration.run(migration.id, checksum, new Date().toISOString());
      })
      .immediate();
  }
}
