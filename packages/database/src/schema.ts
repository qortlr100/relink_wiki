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

export const normalizationReviewComparisons = sqliteTable("normalization_review_comparisons", {
  fingerprint: text("fingerprint").primaryKey(),
  baselineNormalizationRunId: text("baseline_normalization_run_id").references(
    () => normalizationRuns.id,
  ),
  candidateNormalizationRunId: text("candidate_normalization_run_id")
    .notNull()
    .references(() => normalizationRuns.id),
  schemaVersion: integer("schema_version").notNull(),
  createdAt: text("created_at").notNull(),
});

export const normalizationRecordReviewDecisions = sqliteTable(
  "normalization_record_review_decisions",
  {
    comparisonFingerprint: text("comparison_fingerprint")
      .notNull()
      .references(() => normalizationReviewComparisons.fingerprint, { onDelete: "cascade" }),
    category: text("category", {
      enum: ["character", "weapon", "sigil", "skill"],
    }).notNull(),
    sourceRecordId: text("source_record_id").notNull(),
    diffStatus: text("diff_status", { enum: ["added", "changed", "removed"] }).notNull(),
    decision: text("decision", { enum: ["approved", "rejected"] }).notNull(),
    note: text("note"),
    decidedAt: text("decided_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.comparisonFingerprint, table.category, table.sourceRecordId],
    }),
    index("normalization_record_review_decisions_comparison_index").on(
      table.comparisonFingerprint,
      table.decision,
    ),
  ],
);

export const publicSnapshotPublications = sqliteTable(
  "public_snapshot_publications",
  {
    id: text("id").primaryKey(),
    normalizationRunId: text("normalization_run_id")
      .notNull()
      .references(() => normalizationRuns.id),
    schemaVersion: integer("schema_version").notNull(),
    publishedAt: text("published_at").notNull(),
    snapshotGeneratedAt: text("snapshot_generated_at").notNull(),
    contentRevision: text("content_revision").notNull(),
    sourceRevision: text("source_revision").notNull(),
    outputSha256: text("output_sha256").notNull(),
    recordCount: integer("record_count").notNull(),
    previousContentRevision: text("previous_content_revision"),
    backupReference: text("backup_reference").notNull(),
    backupCreatedAt: text("backup_created_at").notNull(),
    backupSha256: text("backup_sha256").notNull(),
  },
  (table) => [
    index("public_snapshot_publications_schema_version_index").on(
      table.schemaVersion,
      table.publishedAt,
    ),
  ],
);

export const currentPublicSnapshotPublications = sqliteTable(
  "current_public_snapshot_publications",
  {
    schemaVersion: integer("schema_version").primaryKey(),
    publicationId: text("publication_id")
      .notNull()
      .unique()
      .references(() => publicSnapshotPublications.id),
    contentRevision: text("content_revision").notNull(),
    publishedAt: text("published_at").notNull(),
  },
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
