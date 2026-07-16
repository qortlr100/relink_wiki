CREATE TABLE import_runs (
  id TEXT PRIMARY KEY NOT NULL,
  input_fingerprint TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0)
);

CREATE UNIQUE INDEX import_runs_input_fingerprint_unique
  ON import_runs (input_fingerprint);

CREATE TABLE staging_records (
  import_run_id TEXT NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL CHECK (source_table IN ('chara', 'weapon', 'gem', 'ability')),
  source_file_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_hash TEXT NOT NULL,
  PRIMARY KEY (import_run_id, source_table, source_record_id)
);

CREATE INDEX staging_records_source_table_index
  ON staging_records (source_table);

CREATE TABLE import_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  import_run_id TEXT NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  source_file_id TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE UNIQUE INDEX import_warnings_run_code_source_unique
  ON import_warnings (import_run_id, code, source_file_id);

CREATE TABLE characters (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  name_ko TEXT NOT NULL,
  review_state TEXT NOT NULL CHECK (review_state IN ('staged', 'reviewed', 'published')),
  source_file_id TEXT NOT NULL,
  import_run_id TEXT NOT NULL REFERENCES import_runs(id)
);

CREATE UNIQUE INDEX characters_slug_unique ON characters (slug);

