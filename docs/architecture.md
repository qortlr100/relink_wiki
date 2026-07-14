# Architecture

This document describes the architecture that exists in the repository today. Future stages are marked explicitly and are not part of the current runtime.

## Separation of responsibilities

| Area              | Current runtime                     | Current storage                                       | Public             |
| ----------------- | ----------------------------------- | ----------------------------------------------------- | ------------------ |
| Wiki              | Sites-compatible Vinext application | Validated version 1 static JSON snapshot              | Yes                |
| Mining admin      | Vinext application on `127.0.0.1`   | No application data access is connected yet           | No                 |
| Extractor         | Local TypeScript CLI                | Private candidate SQLite and local Relink Wiki SQLite | No                 |
| Source and schema | GitHub                              | Git                                                   | Repository members |

## Data flow

1. The operator uses the pinned external GBFRDataTools release to read the locally installed game archives into a private output location.
2. The extractor CLI imports four allowlisted candidate SQLite tables into private staging records.
3. An explicit private mapping converts selected staging rows into versioned `staged` normalized records.
   A separate read-only validator can measure Korean message join coverage without writing localized text or normalized records.
4. **Not implemented:** the local admin compares versions and records explicit review decisions.
5. **Not implemented:** a publisher generates a reviewed, allowlisted public snapshot with a preview or diff.
6. The public wiki reads only the validated static snapshot bundled with its build. The current file is prototype sample data and is not generated from the local database.

## Repository policy

Git tracks application source, schemas, migrations, fixtures made specifically for tests, and documentation.

Git does not track original game files, extracted assets, local databases, generated exports, credentials, or machine-specific paths.

## Applications

### Public wiki

The public application currently provides search, category lists, sorting, and record details for the four version 1 collections: characters, weapons, sigils, and skills. Its loader validates the complete snapshot with `publicSnapshotSchema` before rendering. Internal extraction paths, private records, and mining state must never be included in its build.

Quests, enemies, items, and other categories are future scope and require an explicit domain and public snapshot contract before UI routes are added.

### Local mining admin

The admin application binds to `127.0.0.1:3100` in its development command and currently renders only a local-only status placeholder. Extractor runs, import errors, record differences, review decisions, asset status, and publication controls are not connected yet. When implemented, publishing must remain an explicit operation with a preview or diff.

## Publication strategy

The current and initial publication format is a versioned static JSON snapshot. Local SQLite remains the private source of truth, GitHub stores source and schemas only, and Sites is the selected public hosting surface. A hosted database or object storage must not be introduced until measured need justifies it and an accepted architecture decision defines the public boundary.

The version 1 public prototype snapshot exposes four allowlisted collections: `characters`, `weapons`, `sigils`, and `skills`. Each collection contains only its public identifier, slug, Korean display name, and the literal `published` review state. The wiki validates the complete snapshot before rendering it.

The prototype wiki routes each allowlisted collection through `/archive/[category]` and each record through `/archive/[category]/[slug]`. Unknown categories and missing public records render an explicit recovery message. These routes consume only the validated public snapshot and never query local staging or admin storage.

The private `normalized_records` table is not a public DTO source yet. It contains staged records and provenance, while review state transitions and publisher generation remain unimplemented. The future publisher must construct public records from an allowlist rather than serialize private database rows directly.
