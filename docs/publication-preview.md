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

`writePublicSnapshot` accepts a complete `publicSnapshotSchema` value rather than private database rows. The caller must provide a path-free NAS backup receipt completed no later than the write time and the content revision observed during preview. A `null` expected revision permits only the first distinct write; an existing different file or a mismatched revision aborts the operation so a stale preview cannot replace newer output. A byte-identical file is reused before the current-revision gate so an exact request can recover after the writer committed but its response was lost.

The output directory must already exist as an absolute, non-symlinked directory controlled by the local operator. The writer uses the fixed filename `public-snapshot.v1.json`, holds an exclusive sibling lock, writes and flushes a uniquely named sibling temporary file, then renames it over the target. It reads the result again, validates the complete JSON contract, compares the exact bytes and returns a SHA-256 file digest. Byte-identical retries are safe and reported as reused. Errors expose stable codes and Korean messages without returning the output path or backup reference.

This API can be tested with temporary directories on any supported development platform. The first use against the canonical Windows output location and NAS backup still requires local operator verification.

## Local preview command

With `RELINK_DATABASE_PATH` set in the private shell environment, run `pnpm preview:public` from the repository root. The command opens the existing SQLite database read-only, creates the same validated allowlist preview, and writes `data/exports/public-snapshot-preview.v1.json`. That directory is Git-ignored, and the command reports only the public revision, category counts and output digest without echoing the database path or private baseline identifiers.

The local preview file is not the publication candidate consumed by the writer. Generating it does not require a new backup receipt, replace `apps/wiki/public/data/public-snapshot.v1.json`, change review state, record publication history or deploy the wiki.

## Explicit local publication command

The local `pnpm publish:public` command connects the writer and database finalizer without adding a write control to the mining admin. It requires both `RELINK_DATABASE_PATH` and `RELINK_PUBLICATION_REQUEST_PATH` to identify existing absolute, non-symlinked private files. The request file is private operator input and must never be committed.

The strict version 1 request shape is:

```json
{
  "confirmation": "PUBLISH_REVIEWED_PUBLIC_SNAPSHOT_V1",
  "publicationId": "00000000-0000-4000-8000-000000000000",
  "reviewedSnapshotPath": "C:\\path\\to\\private\\public-snapshot-preview.v1.json",
  "reviewedSnapshotSha256": "64 lowercase hex characters",
  "reviewedContentRevision": "64 lowercase hex characters",
  "outputDirectory": "C:\\path\\to\\private\\publication-candidate",
  "writtenAt": "2026-07-16T15:00:00.000Z",
  "publishedAt": "2026-07-16T15:01:00.000Z",
  "backup": {
    "reference": "NAS-YYYYMMDDTHHMMSSZ",
    "createdAt": "2026-07-16T14:55:00.000Z",
    "sha256": "64 lowercase hex characters"
  },
  "expectedCurrentContentRevision": null
}
```

The command validates the exact reviewed file bytes and public content revision, requires backup evidence completed after the current baseline acceptance and before the candidate write, writes the fixed `public-snapshot.v1.json`, then finalizes the same evidence in SQLite. Its success output contains only public revisions, category counts, output digest, record count and reuse flags. It omits paths, internal run/publication IDs and backup references.

The request deliberately fixes its UUID, timestamps, backup evidence and reviewed file digest. Re-running the exact request reuses both a byte-identical candidate and an already recorded publication, which covers a lost response between either durable step. A written but unfinalized candidate is not deployed.

## Local admin integration boundary

The mining admin publication form requires the operator to type `PUBLISH_REVIEWED_PUBLIC_SNAPSHOT_V1`, then invokes the same `runPublicSnapshotPublicationCommand` using server-only `RELINK_DATABASE_PATH` and `RELINK_PUBLICATION_REQUEST_PATH`. The browser never receives either path, the private request contents, publication/run IDs, or backup reference. All reviewed-file, digest, content-revision, backup-freshness, writer and database retry gates remain owned by the existing command.

The form writes only the verified candidate and publication history. It does not replace `apps/wiki/public/data/public-snapshot.v1.json`, commit generated data, create a Sites checkpoint, widen access or implement rollback. On 2026-07-16, a separately approved operation copied the verified schema version 1 publication candidate into the checked-in snapshot; Sites checkpoint creation and access changes remain separate. See [`publication-history.md`](publication-history.md) and [`sites-deployment.md`](sites-deployment.md).
