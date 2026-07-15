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

export const normalizationRuns = sqliteTable(
  "normalization_runs",
  {
    id: text("id").primaryKey(),
    inputFingerprint: text("input_fingerprint").notNull(),
    importRunId: text("import_run_id")
      .notNull()
      .references(() => importRuns.id),
    normalizedAt: text("normalized_at").notNull(),
    schemaVersion: integer("schema_version").notNull(),
  },
  (table) => [
    uniqueIndex("normalization_runs_input_fingerprint_unique").on(table.inputFingerprint),
  ],
);

export const normalizedRecords = sqliteTable(
  "normalized_records",
  {
    normalizationRunId: text("normalization_run_id")
      .notNull()
      .references(() => normalizationRuns.id, { onDelete: "cascade" }),
    category: text("category", {
      enum: ["character", "weapon", "sigil", "skill"],
    }).notNull(),
    id: text("id").notNull(),
    slug: text("slug").notNull(),
    nameKo: text("name_ko").notNull(),
    reviewState: text("review_state", { enum: ["staged", "reviewed", "published"] }).notNull(),
    sourceTable: text("source_table", {
      enum: ["chara", "weapon", "gem", "ability"],
    }).notNull(),
    sourceFileId: text("source_file_id").notNull(),
    sourceRecordId: text("source_record_id").notNull(),
    extractorVersion: text("extractor_version").notNull(),
    importRunId: text("import_run_id")
      .notNull()
      .references(() => importRuns.id),
    importedAt: text("imported_at").notNull(),
    schemaVersion: integer("schema_version").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.normalizationRunId, table.category, table.sourceRecordId],
    }),
    uniqueIndex("normalized_records_id_unique").on(
      table.normalizationRunId,
      table.category,
      table.id,
    ),
    uniqueIndex("normalized_records_slug_unique").on(
      table.normalizationRunId,
      table.category,
      table.slug,
    ),
    index("normalized_records_import_run_index").on(table.importRunId),
  ],
);

export const normalizationAcceptances = sqliteTable(
  "normalization_acceptances",
  {
    normalizationRunId: text("normalization_run_id")
      .primaryKey()
      .references(() => normalizationRuns.id),
    schemaVersion: integer("schema_version").notNull(),
    acceptedAt: text("accepted_at").notNull(),
    previousBaselineNormalizationRunId: text("previous_baseline_normalization_run_id").references(
      () => normalizationRuns.id,
    ),
    backupReference: text("backup_reference").notNull(),
    backupCreatedAt: text("backup_created_at").notNull(),
    backupSha256: text("backup_sha256").notNull(),
  },
  (table) => [
    index("normalization_acceptances_schema_version_index").on(
      table.schemaVersion,
      table.acceptedAt,
    ),
  ],
);

export const acceptedNormalizationBaselines = sqliteTable("accepted_normalization_baselines", {
  schemaVersion: integer("schema_version").primaryKey(),
  normalizationRunId: text("normalization_run_id")
    .notNull()
    .unique()
    .references(() => normalizationRuns.id),
  acceptedAt: text("accepted_at").notNull(),
  backupReference: text("backup_reference").notNull(),
  backupCreatedAt: text("backup_created_at").notNull(),
  backupSha256: text("backup_sha256").notNull(),
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
