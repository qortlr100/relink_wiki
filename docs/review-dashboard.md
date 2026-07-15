# Local review status dashboard

The mining admin exposes a read-only status dashboard for the private SQLite database selected by `RELINK_DATABASE_PATH`. The development command remains bound to `127.0.0.1:3100`; the dashboard is not imported by the public wiki and does not add an API route or external listener.

## Read boundary

The application opens an existing database with SQLite `readonly`, `fileMustExist`, and `query_only` settings. It never creates a missing database, applies migrations, changes review state, writes a snapshot, or records a publication. The database repository returns only:

- normalization timestamps and schema versions;
- category and review-state counts;
- whether a run is the current accepted baseline;
- baseline acceptance time and path-free NAS backup reference, creation time, and SHA-256;
- current publication time, content revision, total count, and category counts.

The dashboard's current baseline, preview, and publication panels are all scoped to the publisher's supported schema version 1. A baseline accepted for another schema version may appear in the normalization run history, but it does not replace the version 1 publication boundary. The application may call the existing publisher preview in memory when the current version 1 baseline remains fully `reviewed`. It displays only the deterministic allowlist content revision and per-category counts. After the same baseline has been finalized as `published`, the panel shows the current recorded publication revision and counts instead.

Run UUIDs, publication UUIDs, import identifiers, source file identifiers, filesystem paths, names, slugs, raw staging payloads, normalized record values, and database exception details are not included in the dashboard model.

## Error states

The page uses separate Korean guidance for:

- `DATABASE_PATH_UNSET`: `RELINK_DATABASE_PATH` is empty;
- `DATABASE_NOT_FOUND`: SQLite cannot open the configured existing file;
- `DATABASE_INVALID`: the file is damaged, has an incompatible/missing schema, or otherwise cannot satisfy the dashboard query.

These states do not echo the configured path or the underlying SQLite error. Restart the local admin after correcting the environment or database file.

## Current limits

The dashboard is status-only. It does not show record-level diffs, rejection decisions, extractor controls, acceptance buttons, publication buttons, deployment controls, or rollback. Those operations require separate explicit workflows and must preserve the preview/backup/concurrency gates already defined by the database and publisher packages.
