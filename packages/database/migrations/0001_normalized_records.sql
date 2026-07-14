CREATE TABLE normalization_runs (
  id TEXT PRIMARY KEY NOT NULL,
  input_fingerprint TEXT NOT NULL,
  import_run_id TEXT NOT NULL REFERENCES import_runs(id),
  normalized_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0)
);

CREATE UNIQUE INDEX normalization_runs_input_fingerprint_unique
  ON normalization_runs (input_fingerprint);

CREATE TABLE normalized_records (
  normalization_run_id TEXT NOT NULL REFERENCES normalization_runs(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('character', 'weapon', 'sigil', 'skill')),
  id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name_ko TEXT NOT NULL,
  review_state TEXT NOT NULL CHECK (review_state IN ('staged', 'reviewed', 'published')),
  source_table TEXT NOT NULL CHECK (source_table IN ('chara', 'weapon', 'gem', 'ability')),
  source_file_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  import_run_id TEXT NOT NULL REFERENCES import_runs(id),
  imported_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  PRIMARY KEY (normalization_run_id, category, source_record_id),
  FOREIGN KEY (import_run_id, source_table, source_record_id)
    REFERENCES staging_records(import_run_id, source_table, source_record_id),
  CHECK (
    (category = 'character' AND source_table = 'chara') OR
    (category = 'weapon' AND source_table = 'weapon') OR
    (category = 'sigil' AND source_table = 'gem') OR
    (category = 'skill' AND source_table = 'ability')
  )
);

CREATE UNIQUE INDEX normalized_records_id_unique
  ON normalized_records (normalization_run_id, category, id);

CREATE UNIQUE INDEX normalized_records_slug_unique
  ON normalized_records (normalization_run_id, category, slug);

CREATE INDEX normalized_records_import_run_index
  ON normalized_records (import_run_id);
