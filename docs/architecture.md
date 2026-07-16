# Architecture

This document describes the architecture that exists in the repository today. Future stages are marked explicitly and are not part of the current runtime.

## Separation of responsibilities

| Area              | Current runtime                     | Current storage                                       | Public             |
| ----------------- | ----------------------------------- | ----------------------------------------------------- | ------------------ |
| Wiki              | Sites-compatible Vinext application | Validated version 1 static JSON snapshot              | Yes                |
| Mining admin      | Vinext application on `127.0.0.1`   | Read-only configured local SQLite aggregates          | No                 |
| Extractor         | Local TypeScript CLI                | Private candidate SQLite and local Relink Wiki SQLite | No                 |
| Source and schema | GitHub                              | Git                                                   | Repository members |

## Data flow

1. The operator uses the pinned external GBFRDataTools release to read the locally installed game archives into a private output location.
2. The extractor CLI imports four allowlisted candidate SQLite tables into private staging records.
3. A read-only validator measures Korean message join coverage. A separate local command can create a non-overwriting private mapping candidate from canonical resolved joins, and only an explicitly reviewed mapping converts selected staging rows into versioned `staged` normalized records.
4. The database package can compare two compatible private normalization runs without writing state, then atomically persist an explicitly accepted baseline after validated NAS backup evidence and an optimistic baseline check. **Not implemented:** the local admin exposes this workflow or records rejection and per-record decisions.
5. The publisher can generate a deterministic, allowlisted public snapshot preview from the accepted baseline and explicitly write it as an atomically replaced, re-verified version 1 JSON candidate after backup and current-revision checks. A separate SQLite transaction verifies that writer receipt against the still-current baseline, records immutable publication history, advances the current-publication pointer and changes the complete baseline to `published`. **Not implemented:** mining-admin publication controls and public snapshot rollback.
6. The public wiki reads only the validated static snapshot bundled with its build. The current file is prototype sample data and is not generated from the local database.
7. The Sites build compiles only `apps/wiki`, packages its Worker and static assets at the repository root, and rejects artifacts containing known admin, database, or local-path markers. A private checkpoint may verify this path with sample data; public access remains a separate release decision.

## Repository policy

Git tracks application source, schemas, migrations, fixtures made specifically for tests, and documentation.

Git does not track original game files, extracted assets, local databases, generated exports, credentials, or machine-specific paths.

## Applications

### Public wiki

The public application currently provides search, category lists, sorting, and record details for the four version 1 collections: characters, weapons, sigils, and skills. Its loader validates the complete snapshot with `publicSnapshotSchema` before rendering. Internal extraction paths, private records, and mining state must never be included in its build.

Quests, enemies, items, and other categories are future scope and require an explicit domain and public snapshot contract before UI routes are added.

### Local mining admin

The admin application binds to `127.0.0.1:3100` in its development command. It opens only the configured `RELINK_DATABASE_PATH` in SQLite read-only mode and renders aggregate normalization runs, the current accepted baseline and path-free backup evidence, review-state/category counts, current publication status, and the allowlisted preview revision/counts. Its page model excludes run identifiers, source paths, raw payloads, normalized record values, and database error details. Extractor execution, record differences, review actions, asset status, publication controls, and rollback are not connected to the app. See [`review-dashboard.md`](review-dashboard.md).

## Publication strategy

The current and initial publication format is a versioned static JSON snapshot. Local SQLite remains the private source of truth, GitHub stores source and schemas only, and Sites is the selected public hosting surface. A hosted database or object storage must not be introduced until measured need justifies it and an accepted architecture decision defines the public boundary.

Sites consumes the repository-root artifact produced from `apps/wiki` only. It does not build or deploy `apps/mining-admin`, and the packaging gate scans every emitted file for private boundary markers before a checkpoint can proceed. See [`sites-deployment.md`](sites-deployment.md).

The version 1 public prototype snapshot exposes four allowlisted collections: `characters`, `weapons`, `sigils`, and `skills`. Each collection contains only its public identifier, slug, Korean display name, and the literal `published` review state. The wiki validates the complete snapshot before rendering it.

The prototype wiki routes each allowlisted collection through `/archive/[category]` and each record through `/archive/[category]/[slug]`. Unknown categories and missing public records render an explicit recovery message. These routes consume only the validated public snapshot and never query local staging or admin storage.

New private normalized records are staged; explicit run acceptance changes only the accepted run's records to `reviewed`. The publisher reads only the accepted baseline through a database repository and constructs public records from an allowlist. It hashes internal source identity into a public-safe revision and never serializes private provenance, backup metadata or internal run identifiers. Its separate candidate writer accepts only the validated public DTO, requires new path-free backup evidence and refuses stale current revisions before atomically replacing and re-reading the fixed version 1 JSON file.

The read-only diff engine pairs records by normalized category and source record ID, then compares only `id`, `slug`, and `nameKo`. It refuses cross-schema comparisons. The separate acceptance repository records immutable acceptance history, requires path-free NAS backup evidence, and advances one current baseline per schema version only when the caller's expected baseline still matches. See [`normalization-diff.md`](normalization-diff.md) and [`normalization-review.md`](normalization-review.md).
