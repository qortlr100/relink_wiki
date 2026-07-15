CREATE TABLE normalization_acceptances (
  normalization_run_id TEXT PRIMARY KEY NOT NULL
    REFERENCES normalization_runs(id),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  accepted_at TEXT NOT NULL,
  previous_baseline_normalization_run_id TEXT
    REFERENCES normalization_runs(id),
  backup_reference TEXT NOT NULL,
  backup_created_at TEXT NOT NULL,
  backup_sha256 TEXT NOT NULL CHECK (
    length(backup_sha256) = 64 AND
    backup_sha256 NOT GLOB '*[^0-9a-f]*'
  )
);

CREATE INDEX normalization_acceptances_schema_version_index
  ON normalization_acceptances (schema_version, accepted_at);

CREATE TABLE accepted_normalization_baselines (
  schema_version INTEGER PRIMARY KEY NOT NULL CHECK (schema_version > 0),
  normalization_run_id TEXT NOT NULL UNIQUE
    REFERENCES normalization_runs(id),
  accepted_at TEXT NOT NULL,
  backup_reference TEXT NOT NULL,
  backup_created_at TEXT NOT NULL,
  backup_sha256 TEXT NOT NULL CHECK (
    length(backup_sha256) = 64 AND
    backup_sha256 NOT GLOB '*[^0-9a-f]*'
  )
);
