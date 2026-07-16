# Public snapshot publication history

The database package finalizes a verified public snapshot candidate only after the publisher writer has committed and re-read the version 1 JSON file. Finalization records immutable publication evidence, advances the current publication pointer for the schema version, and changes every record in the accepted normalization baseline from `reviewed` to `published` in one SQLite transaction.

## Required evidence

The caller provides a stable publication UUID, the complete validated snapshot, the writer result for the fixed `public-snapshot.v1.json` filename, a path-free NAS backup receipt, the publication timestamp, and the content revision observed as current during preview. The output content revision must match the snapshot, and both the snapshot and backup must predate finalization.

Before writing the database, the repository verifies that:

- the current publication content revision still matches the caller's observation;
- the snapshot source revision identifies the current accepted normalization baseline;
- the snapshot content revision and all allowlisted records exactly match that baseline;
- every selected private record is still `reviewed`;
- the writer receipt contains a valid SHA-256 digest without an output path.

Errors use stable codes and do not include normalization run IDs, backup references, record identifiers, local paths, or private values.

## Transaction and recovery

The immutable history row, schema-version current pointer, and complete `reviewed` to `published` transition commit together. If any condition fails, none of those database changes persist.

The JSON writer necessarily commits before this SQLite transaction, so the two resources cannot share one atomic commit. A candidate that was written but not finalized is not a deployed release. The caller must retain the publication UUID, snapshot, and writer receipt and retry the exact finalization request. Exact retries are reported as reused after a successful commit; reusing the UUID with different evidence is rejected.

This contract does not deploy Sites, copy a candidate into the wiki source tree, expose publication controls publicly, or implement rollback. The mining admin must later present the preview or diff before invoking the writer and finalizer explicitly.
