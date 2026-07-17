# Local review and publication console

The mining admin exposes a status dashboard and explicit review operations for the private SQLite database selected by `RELINK_DATABASE_PATH`. The development command remains bound to `127.0.0.1:3100`; the dashboard is not imported by the public wiki and does not add an external listener.

## Read boundary

Page rendering opens an existing database with SQLite `readonly`, `fileMustExist`, and `query_only` settings. It never creates a missing database or applies migrations. A record decision or baseline approval server action uses a separate `fileMustExist` writable opener only after validating its FormData, so an incorrect path cannot create an empty SQLite file. The connection closes before redirecting to a safe result notice. The database repository returns only:

- normalization timestamps and schema versions;
- category and review-state counts;
- whether a run is the current accepted baseline;
- baseline acceptance time and path-free NAS backup reference, creation time, and SHA-256;
- current publication time, content revision, total count, and category counts;
- latest staged-candidate diff status, allowlisted before/after values and decision state.

Category and review-state totals are grouped inside SQLite rather than loading private records into application memory. For a current publication, the live category total must still equal the immutable publication record count; a mismatch fails as an invalid-database state instead of displaying inconsistent audit data.

The dashboard's current baseline, preview, and publication panels are all scoped to the publisher's supported schema version 1. A baseline accepted for another schema version may appear in the normalization run history, but it does not replace the version 1 publication boundary. The application may call the existing publisher preview in memory when the current version 1 baseline remains fully `reviewed`. It displays only the deterministic allowlist content revision and per-category counts. After the same baseline has been finalized as `published`, the panel shows the current recorded publication revision and counts instead.

Run UUIDs, publication UUIDs, import identifiers, source file identifiers, source record identifiers, filesystem paths, raw staging payloads, private provenance, and database exception details are not included in the dashboard model. The record-review model adds only public candidate `id`, `slug`, and `nameKo` values, category/status, decision metadata, a list position, and an opaque comparison fingerprint.

## Record review

The review workspace compares the current schema version 1 accepted baseline with the newest other run that still has `staged` records. A first baseline is represented as an all-added comparison. The full summary includes `unchanged`, but only `added`, `changed`, and `removed` records require decisions.

Each decision form posts the comparison fingerprint and a required decimal array position rather than an internal run or source identifier. Empty or non-decimal positions are rejected instead of being coerced to record zero. An immediate SQLite transaction rebuilds the complete current comparison, rejects stale fingerprints and resolves the private record key before persisting `approved` or `rejected`, an optional 500-character note, and the decision time. A newer staged candidate or changed baseline invalidates an older screen, and another connection cannot replace that candidate between the freshness check and decision write.

Decision, acceptance, and publication forms also post the current review filter and page as navigation-only values. Server redirects allowlist those values and return to the same filtered page when it still exists; invalid or inherited keys fall back to the unfiltered first page.

The acceptance form is rendered only after pending and rejected counts both reach zero. It requires path-free NAS backup evidence and exact confirmation `ACCEPT_FULLY_REVIEWED_NORMALIZATION_V1`. An immediate SQLite transaction rebuilds the comparison and decision summary before the nested acceptance write, so another connection cannot change a decision between the gate and the expected-baseline/state transition.

## Publication action

The publication form is a UI entry point to the existing strict private request command. It requires exact confirmation `PUBLISH_REVIEWED_PUBLIC_SNAPSHOT_V1`; server-only environment variables resolve the database and request paths. The existing command revalidates the reviewed snapshot bytes/content revision, new backup evidence, output directory, current publication revision, writer receipt, accepted baseline and review states.

Success means only that the verified candidate file and SQLite publication history are complete. The action does not copy a checked-in snapshot, run Git, deploy Sites, change public access or roll back a release.

## Error states

The page uses separate Korean guidance for:

- `DATABASE_PATH_UNSET`: `RELINK_DATABASE_PATH` is empty;
- `DATABASE_NOT_FOUND`: SQLite cannot open the configured existing file;
- `DATABASE_INVALID`: the file is damaged, has an incompatible/missing schema, or otherwise cannot satisfy the dashboard query.

These states do not echo the configured path or the underlying SQLite error. Restart the local admin after correcting the environment or database file.

## Current limits

The app does not run GBFRDataTools, generate or verify NAS backups, edit normalized values, create mapping files, replace the checked-in public snapshot, control deployment, or perform rollback. The operator must prepare reviewed mapping/snapshot and backup evidence through their existing private workflows. Database migration remains explicit and must be performed after the required NAS backup; the app reports a safe unavailable state when the record-review tables are missing.

## Visual and click verification

The implemented console was manually verified on 2026-07-17 against both the current private database and a disposable 37-change fixture. The current database rendered its accepted baseline and publication summary without a staged candidate, and the browser text contained no filesystem path or database filename.

The disposable fixture covered an approval with a persisted note, a transition from approval to rejection, category/diff/decision filtering, the second page of a 30-record page, an invalid acceptance confirmation, and the successful acceptance transition after every actionable record was approved. The publication button was also confirmed to stop at the missing private-request environment gate; no snapshot output or publication history was created during QA.

Desktop and `390 × 844` mobile layouts had no horizontal overflow. The record before/after values collapsed from two columns to one on mobile while both decision buttons remained visible. Browser warning/error logs, the development error overlay, and the server error log were empty during the completed pass.
