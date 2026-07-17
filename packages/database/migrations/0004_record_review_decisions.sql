CREATE TABLE normalization_review_comparisons (
  fingerprint TEXT PRIMARY KEY NOT NULL CHECK (
    length(fingerprint) = 64 AND
    fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  baseline_normalization_run_id TEXT
    REFERENCES normalization_runs(id),
  candidate_normalization_run_id TEXT NOT NULL
    REFERENCES normalization_runs(id),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  created_at TEXT NOT NULL
);

CREATE TABLE normalization_record_review_decisions (
  comparison_fingerprint TEXT NOT NULL
    REFERENCES normalization_review_comparisons(fingerprint) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('character', 'weapon', 'sigil', 'skill')),
  source_record_id TEXT NOT NULL,
  diff_status TEXT NOT NULL CHECK (diff_status IN ('added', 'changed', 'removed')),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  decided_at TEXT NOT NULL,
  PRIMARY KEY (comparison_fingerprint, category, source_record_id)
);

CREATE INDEX normalization_record_review_decisions_comparison_index
  ON normalization_record_review_decisions (comparison_fingerprint, decision);
