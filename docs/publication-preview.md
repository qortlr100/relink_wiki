# Public snapshot preview and candidate write

## Scope

The publisher package builds a deterministic version 1 public snapshot preview from the current accepted normalization baseline. Preview generation is an in-memory operation. A separate explicit writer can persist that validated value as a JSON candidate after its own backup and concurrency gates. Neither operation mutates review state, records a publication event, commits generated data, or deploys the public wiki.

## Source gate

`createPublicSnapshotPreview` requires a positive supported schema version and an ISO timestamp no earlier than the baseline acceptance. The database repository resolves the current accepted baseline for that schema version and refuses to continue when:

- no accepted baseline exists;
- the baseline contains no records;
- a record no longer has the `reviewed` state;
- a record schema or public candidate field is invalid;
- records disagree on the pinned extractor version.

Review-state drift aborts the whole preview rather than silently omitting records and producing a partial snapshot. The publisher maps repository failures to its own `PUBLIC_SNAPSHOT_PREVIEW_SOURCE_INVALID` contract while retaining only the safe repository reason code and category-level invalid counts, not record IDs or private values. Final manifest validation uses a separate output-error code and safe schema issue paths so implementation regressions remain diagnosable.

Acceptance already requires verified NAS backup evidence. The preview reads that acceptance boundary but does not return its backup receipt or create another backup.

## Public allowlist

Only `id`, `slug` and `nameKo` are copied into the four public collections. The output review state is the public literal `published`; this describes the candidate snapshot and does not change the private database row. Source paths, source record IDs, import IDs, normalization run IDs, backup metadata and raw payloads are excluded.

The internal baseline identity is hashed into a 64-character `sourceRevision`. `contentRevision` is a SHA-256 digest of the deterministically sorted public collections. The manifest also includes the fixed extractor name, its accepted version and record counts that the domain schema checks against each collection.

## Candidate file write

`writePublicSnapshot` accepts a complete `publicSnapshotSchema` value rather than private database rows. The caller must provide a path-free NAS backup receipt completed no later than the write time and the content revision observed during preview. A `null` expected revision permits only the first write; an existing file or a mismatched revision aborts the operation so a stale preview cannot replace newer output.

The output directory must already exist as an absolute, non-symlinked directory controlled by the local operator. The writer uses the fixed filename `public-snapshot.v1.json`, holds an exclusive sibling lock, writes and flushes a uniquely named sibling temporary file, then renames it over the target. It reads the result again, validates the complete JSON contract, compares the exact bytes and returns a SHA-256 file digest. Byte-identical retries are safe and reported as reused. Errors expose stable codes and Korean messages without returning the output path or backup reference.

This API can be tested with temporary directories on any supported development platform. The first use against the canonical Windows output location and NAS backup still requires local operator verification.

## Current integration boundary

The mining admin does not call these APIs yet. A later publication transaction must show the preview or its diff, invoke the candidate writer, record publication history, change the accepted records to `published` only after the file commit, and then offer deployment. The repository's sample snapshot remains UI fixture data rather than a generated release.
