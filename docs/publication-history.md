# Public snapshot publication history

The database package finalizes a verified public snapshot candidate only after the publisher writer has committed and re-read the version 1 JSON file. Finalization records immutable publication evidence, advances the current publication pointer for the schema version, and changes every record in the accepted normalization baseline from `reviewed` to `published` in one SQLite transaction.

## Required evidence

The local publication command loads these values from the strict private request described in [`publication-preview.md`](publication-preview.md). It provides a stable publication UUID, the exact reviewed and validated snapshot, the writer result for the fixed `public-snapshot.v1.json` filename, a path-free NAS backup receipt, the publication timestamp, and the content revision observed as current during preview. The output content revision must match the snapshot, and both the snapshot and backup must predate finalization.

Before writing the database, the repository verifies that:

- the current publication content revision still matches the caller's observation;
- the snapshot source revision identifies the current accepted normalization baseline;
- the snapshot content revision and all allowlisted records exactly match that baseline;
- every selected private record is still `reviewed`;
- the writer receipt contains a valid SHA-256 digest without an output path.

Errors use stable codes and do not include normalization run IDs, backup references, record identifiers, local paths, or private values.

## Transaction and recovery

The immutable history row, schema-version current pointer, and complete `reviewed` to `published` transition commit together. If any condition fails, none of those database changes persist.

The JSON writer necessarily commits before this SQLite transaction, so the two resources cannot share one atomic commit. A candidate that was written but not finalized is not a deployed release. The operator retains the request file and reviewed snapshot, then reruns the exact `pnpm publish:public` command. The byte-identical writer result and exact finalization are reported as reused after their respective commits; reusing the UUID with different evidence is rejected.

This contract does not deploy Sites, copy a candidate into the wiki source tree, expose publication controls publicly, or implement rollback. The localhost-only mining admin now delegates its explicit publication action to this same private request command, so the reviewed-file, backup and concurrency gates remain authoritative. Record decisions and baseline acceptance are separate gated local writes.
