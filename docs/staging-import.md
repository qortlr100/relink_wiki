# Candidate SQLite staging import

## Scope

The staging importer is the first increment of roadmap stage 03. It accepts a private SQLite database produced by the pinned GBFRDataTools `tbl-to-sqlite` command and copies only these allowlisted source tables into the local Relink Wiki database:

| Source file                | Candidate table | Staging category |
| -------------------------- | --------------- | ---------------- |
| `system/table/chara.tbl`   | `chara`         | character        |
| `system/table/weapon.tbl`  | `weapon`        | weapon           |
| `system/table/gem.tbl`     | `gem`           | sigil            |
| `system/table/ability.tbl` | `ability`       | skill candidate  |

The importer does not normalize records, infer Korean display names, publish snapshots, or read any table outside this allowlist. Unknown source columns remain only in the private `staging_records.payload_json` value.

## Database contract

`packages/database/migrations/0000_initial.sql` creates the initial local schema:

- `import_runs` stores the import ID, SHA-256 input fingerprint, extractor version, import timestamp, and staging schema version;
- `staging_records` stores the source table, source file identifier, source row identifier, private JSON payload, and payload hash;
- `import_warnings` stores stable warning codes separately from source rows;
- normalized `characters` remains isolated from private staging data.

Every staging row obtains its provenance through `import_run_id`. The migration runner stores a checksum for each applied migration and fails with `DATABASE_MIGRATION_CHANGED` if an applied SQL file is edited later.

The input fingerprint covers the extractor version, staging schema version, canonical source rows, and warnings. Re-running byte-equivalent logical input reuses the original import run and does not insert duplicate staging records. A changed candidate database creates a new import run.

GBFRDataTools `2.0.0` cannot convert `system/table/skill.tbl`. Every import therefore records an `SKILL_TABLE_INCOMPATIBLE` warning while using `ability` only as the current skill candidate table. This warning must remain visible until a compatible parser or an explicit mapping decision replaces it.

## Run

Configure private machine-specific values without committing them:

```dotenv
GBFR_DATA_TOOLS_VERSION=2.0.0
RELINK_CANDIDATE_DATABASE_PATH=C:\\path\\to\\private\\candidate-tables.sqlite
RELINK_DATABASE_PATH=C:\\path\\to\\private\\relink.sqlite
```

Then run:

```bash
pnpm --filter @relink-wiki/extractor import:candidate
```

The command opens the candidate database in read-only/query-only mode, applies pending target migrations, and performs the staging import in one database transaction. Its JSON result contains only stable codes, counts, the import run ID, and whether an existing run was reused. It never prints either private database path.

The candidate and target settings must resolve to different files. The importer rejects matching normalized paths, symbolic-link targets, and existing hard links before it opens the writable target. Concurrent imports wait briefly for the SQLite write lock, and the unique input fingerprint is claimed with an atomic conflict-safe insert.

## Failure contract

- `CANDIDATE_DATABASE_INVALID`: the candidate SQLite file cannot be opened read-only;
- `CANDIDATE_TARGET_PATH_CONFLICT`: the candidate and writable target resolve to the same file;
- `CANDIDATE_TABLE_MISSING`: one of the four allowlisted tables is absent;
- `CANDIDATE_TABLE_INVALID`: an allowlisted table does not support the expected row-based read contract;
- `CANDIDATE_ROW_INVALID`: a row contains a value that cannot be represented by the private scalar JSON contract;
- `DATABASE_MIGRATION_CHANGED`: an already-applied migration file no longer matches its stored checksum.

Configuration validation failures use `EXTRACTOR_CONFIG_INVALID`. None of these errors includes a local path or source payload.
