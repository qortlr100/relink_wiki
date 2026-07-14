import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { z } from "zod";
export const databaseConfigSchema = z.object({ path: z.string().min(1) });
export const importRuns = sqliteTable("import_runs", {
  id: text("id").primaryKey(),
  extractorVersion: text("extractor_version").notNull(),
  importedAt: text("imported_at").notNull(),
  schemaVersion: integer("schema_version").notNull(),
});
export const characters = sqliteTable(
  "characters",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    nameKo: text("name_ko").notNull(),
    reviewState: text("review_state", { enum: ["staged", "reviewed", "published"] }).notNull(),
    sourceFileId: text("source_file_id").notNull(),
    importRunId: text("import_run_id")
      .notNull()
      .references(() => importRuns.id),
  },
  (table) => [uniqueIndex("characters_slug_unique").on(table.slug)],
);
export function openDatabase(input: unknown) {
  const config = databaseConfigSchema.parse(input);
  const sqlite = new Database(config.path);
  sqlite.pragma("foreign_keys = ON");
  return { sqlite, db: drizzle(sqlite) };
}
