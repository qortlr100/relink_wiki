# Public snapshot preview

## Scope

The publisher package builds a deterministic version 1 public snapshot preview from the current accepted normalization baseline. The preview is an in-memory value only. It does not write or replace a JSON file, mutate review state, record a publication event, commit generated data, or deploy the public wiki.

## Source gate

`createPublicSnapshotPreview` requires a positive supported schema version and an ISO timestamp. The database repository resolves the current accepted baseline for that schema version and refuses to continue when:

- no accepted baseline exists;
- the baseline contains no records;
- a record no longer has the `reviewed` state;
- a record schema or public candidate field is invalid;
- records disagree on the pinned extractor version.

Acceptance already requires verified NAS backup evidence. The preview reads that acceptance boundary but does not return its backup receipt or create another backup.

## Public allowlist

Only `id`, `slug` and `nameKo` are copied into the four public collections. The output review state is the public literal `published`; this describes the candidate snapshot and does not change the private database row. Source paths, source record IDs, import IDs, normalization run IDs, backup metadata and raw payloads are excluded.

The internal baseline identity is hashed into a 64-character `sourceRevision`. `contentRevision` is a SHA-256 digest of the deterministically sorted public collections. The manifest also includes the fixed extractor name, its accepted version and record counts that the domain schema checks against each collection.

## Current integration boundary

The mining admin does not call this API yet. A later explicit publication flow must show the preview or its diff, create and verify the publication backup, write the generated snapshot atomically, record publication history, and then offer deployment. The repository's sample snapshot remains UI fixture data rather than a generated release.
