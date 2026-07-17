# Normalization acceptance

## Scope

The database package can explicitly accept a private normalization run as the current baseline for its normalization schema version. Acceptance is an atomic local operation: it records an immutable acceptance event, moves the schema-version baseline pointer, and changes every record in the accepted run from `staged` to `reviewed`.

Acceptance does not publish data, create a public snapshot, change a record to `published`, or expose the private database through the public wiki. The mining admin now adds a per-record review gate before calling this acceptance contract.

## Backup gate

`acceptNormalizationRun` requires a backup receipt before it writes. The receipt contains:

- an opaque path-free reference suitable for matching a local NAS backup record;
- the backup completion timestamp, which must not be later than the acceptance timestamp;
- the lowercase SHA-256 digest of the backup.

The database stores the receipt but does not create or upload the backup. The caller must create and verify the Windows SQLite backup on NAS first. A filesystem path is deliberately rejected so machine-specific or private locations are not persisted in review metadata.

## Baseline concurrency

The caller supplies `expectedBaselineNormalizationRunId` from the diff it reviewed. It is `null` for the first baseline of a schema version. If the stored baseline no longer matches, the operation fails with `NORMALIZATION_BASELINE_CHANGED` and writes nothing. The operator must compare against the new baseline before retrying.

Each normalization schema version has an independent current baseline. Replacing a pointer never deletes the previous normalization run or acceptance event. Repeating the exact original acceptance request is idempotent; a different acceptance request for the same run is rejected.

## Read contract

`getAcceptedNormalizationBaseline` returns the current accepted run and backup receipt for one positive schema version, or `null` when no baseline exists. It does not return normalized records or private provenance.

## Failure contract

- `NORMALIZATION_REVIEW_INPUT_INVALID`: the run ID, timestamp, expected baseline, schema version, or backup receipt is invalid;
- `NORMALIZATION_RUN_NOT_FOUND`: the private normalization run does not exist;
- `NORMALIZATION_BASELINE_CHANGED`: the expected baseline is stale;
- `NORMALIZATION_RUN_ALREADY_ACCEPTED`: the run has a different immutable acceptance event.

Error messages do not include normalization run IDs, paths, Korean names, source payloads, or backup references.

## Record decision gate and local admin integration

Migration `0004_record_review_decisions` adds one immutable comparison identity and updateable decisions for its actionable records. Each decision stores the private category/source key, diff status, `approved` or `rejected`, an optional 500-character operator note, and the decision timestamp. The browser model excludes source keys and run IDs.

Every decision request must present the opaque comparison fingerprint currently derived from the baseline, candidate, and complete deterministic diff. A newer staged candidate or changed baseline makes the old request stale. The same fingerprint also gates run acceptance.

The mining admin enables the run-level approval form only when every `added`, `changed`, and `removed` record is `approved`; any pending or rejected record blocks the write. The operator must then enter a path-free NAS backup reference, completion time, lowercase SHA-256, and exact confirmation `ACCEPT_FULLY_REVIEWED_NORMALIZATION_V1`. The server resolves the internal run IDs again and calls `acceptNormalizationRun` with the observed baseline. Publication remains a separate operation.
