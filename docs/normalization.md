# Explicit mapped normalization

## Scope

The first normalization increment converts explicitly selected private staging rows into versioned normalized records. It supports the four current source/category pairs:

| Source table | Normalized category |
| ------------ | ------------------- |
| `chara`      | `character`         |
| `weapon`     | `weapon`            |
| `gem`        | `sigil`             |
| `ability`    | `skill`             |

This workflow does not infer Korean names from structural fields. The localization message paths and identifier joins have not yet been established with reproducible evidence. Until that investigation is complete, Korean display names must be supplied by an explicit local mapping and remain private and unreviewed.

## Database contract

Migration `0001_normalized_records.sql` adds:

- `normalization_runs`, which records the selected import, normalization schema version, timestamp, and input fingerprint;
- `normalized_records`, which stores the category, identifiers, Korean display name, review state, and complete import provenance.

Every normalized record copies its source file identifier, source row identifier, extractor version, import run ID, import timestamp, and normalization schema version. The database constrains each normalized category to its expected source table.

The existing `characters` table from the initial scaffold is left unchanged for compatibility. The mapped workflow writes only to `normalized_records`; migration of accepted character data requires a later explicit decision because no real normalized records have been reviewed yet.

## Private mapping file

Store the mapping outside Git, preferably under the ignored `data/local/` area or another private directory. Configure its location with `RELINK_NORMALIZATION_MAPPING_PATH`.

```json
{
  "importRunId": "00000000-0000-4000-8000-000000000000",
  "schemaVersion": 1,
  "records": [
    {
      "sourceTable": "chara",
      "sourceRecordId": "1",
      "id": "character-10",
      "slug": "gran",
      "nameKo": "그랑"
    }
  ]
}
```

The mapping file is an untrusted boundary and is fully validated with Zod. Source rows must belong to the selected import. Within one normalization run, source rows, category IDs, and category slugs must be unique. Partial mappings are allowed and the command reports how many staging rows remain unmapped.

## Run

After setting `RELINK_DATABASE_PATH` and `RELINK_NORMALIZATION_MAPPING_PATH` in a private environment, run:

```bash
pnpm --filter @relink-wiki/extractor normalize:mapped
```

The command applies pending migrations and writes the mapped records in one transaction. Every new record starts with the literal `staged` review state. It does not update review decisions, generate a public snapshot, or publish anything.

The idempotency fingerprint covers the selected import, normalization schema version, mapping fields, and source payload hashes. Re-running the same logical input reuses the original normalization run. A changed mapping creates a new versioned run instead of replacing previously normalized records.

## Failure contract

- `NORMALIZATION_MAPPING_INVALID`: the local JSON cannot be read or does not satisfy the mapping schema;
- `IMPORT_RUN_NOT_FOUND`: the selected private import run does not exist;
- `STAGING_RECORD_NOT_FOUND`: a mapping does not refer to a staging row in the selected import;
- `DATABASE_MIGRATION_CHANGED`: an already-applied migration no longer matches its stored checksum;
- `DATABASE_BUSY`: another local database operation held the write lock past the wait timeout;
- `EXTRACTOR_CONFIG_INVALID`: required private environment variables are missing or invalid.

Errors never include the mapping path, database path, or private source payload.
