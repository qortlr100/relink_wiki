CREATE TABLE public_snapshot_publications (
  id TEXT PRIMARY KEY NOT NULL,
  normalization_run_id TEXT NOT NULL
    REFERENCES normalization_runs(id),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  published_at TEXT NOT NULL,
  snapshot_generated_at TEXT NOT NULL,
  content_revision TEXT NOT NULL CHECK (
    length(content_revision) = 64 AND
    content_revision NOT GLOB '*[^0-9a-f]*'
  ),
  source_revision TEXT NOT NULL CHECK (
    length(source_revision) = 64 AND
    source_revision NOT GLOB '*[^0-9a-f]*'
  ),
  output_sha256 TEXT NOT NULL CHECK (
    length(output_sha256) = 64 AND
    output_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  record_count INTEGER NOT NULL CHECK (record_count > 0),
  previous_content_revision TEXT CHECK (
    previous_content_revision IS NULL OR (
      length(previous_content_revision) = 64 AND
      previous_content_revision NOT GLOB '*[^0-9a-f]*'
    )
  ),
  backup_reference TEXT NOT NULL,
  backup_created_at TEXT NOT NULL,
  backup_sha256 TEXT NOT NULL CHECK (
    length(backup_sha256) = 64 AND
    backup_sha256 NOT GLOB '*[^0-9a-f]*'
  )
);

CREATE INDEX public_snapshot_publications_schema_version_index
  ON public_snapshot_publications (schema_version, published_at);

CREATE TABLE current_public_snapshot_publications (
  schema_version INTEGER PRIMARY KEY NOT NULL CHECK (schema_version > 0),
  publication_id TEXT NOT NULL UNIQUE
    REFERENCES public_snapshot_publications(id),
  content_revision TEXT NOT NULL CHECK (
    length(content_revision) = 64 AND
    content_revision NOT GLOB '*[^0-9a-f]*'
  ),
  published_at TEXT NOT NULL
);
