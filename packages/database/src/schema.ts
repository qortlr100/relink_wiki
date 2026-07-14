import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const importRuns = sqliteTable(
  "import_runs",
  {
    id: text("id").primaryKey(),
    inputFingerprint: text("input_fingerprint").notNull(),
    extractorVersion: text("extractor_version").notNull(),
    importedAt: text("imported_at").notNull(),
    schemaVersion: integer("schema_version").notNull(),
  },
  (table) => [uniqueIndex("import_runs_input_fingerprint_unique").on(table.inputFingerprint)],
);

export const stagingRecords = sqliteTable(
  "staging_records",
  {
    importRunId: text("import_run_id")
      .notNull()
      .references(() => importRuns.id, { onDelete: "cascade" }),
    sourceTable: text("source_table", {
      enum: ["chara", "weapon", "gem", "ability"],
    }).notNull(),
    sourceFileId: text("source_file_id").notNull(),
    sourceRecordId: text("source_record_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    payloadHash: text("payload_hash").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.importRunId, table.sourceTable, table.sourceRecordId] }),
    index("staging_records_source_table_index").on(table.sourceTable),
  ],
);

export const importWarnings = sqliteTable(
  "import_warnings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    importRunId: text("import_run_id")
      .notNull()
      .references(() => importRuns.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    sourceFileId: text("source_file_id").notNull(),
    message: text("message").notNull(),
  },
  (table) => [
    uniqueIndex("import_warnings_run_code_source_unique").on(
      table.importRunId,
      table.code,
      table.sourceFileId,
    ),
  ],
);

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
