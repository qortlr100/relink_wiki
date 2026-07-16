# Normalization run diff

## Scope

The database package provides a read-only comparison between two private normalization runs. It does not change review state, write comparison results, generate a public snapshot, or publish data. Baseline selection and review-state persistence are deliberately handled by the separate explicit acceptance contract.

Call `compareNormalizationRuns` with a baseline normalization run ID and a candidate normalization run ID. Both inputs are validated UUIDs, and both runs must exist in the same local Relink Wiki database.

## Comparison identity and fields

Records are paired by normalized category and source record ID. This preserves the source-row identity when an operator changes a public ID, slug, or Korean display name between normalization runs.

The comparison classifies every paired or unpaired record as:

- `added`: only the candidate run contains the source row;
- `changed`: both runs contain the source row and at least one public field changed;
- `removed`: only the baseline run contains the source row;
- `unchanged`: both runs contain the same public field values.

Only the allowlisted public candidate fields `id`, `slug`, and `nameKo` participate in change detection. Import timestamps, extractor versions, import run IDs, source paths, review states, and private staging payloads do not create content changes and are not returned in diff record values.

Results are sorted by category and source record ID, include changed-field names for `changed` records, and include a validated count for every status. The complete result is validated with `normalizationDiffSchema` before it leaves the repository function.

## Compatibility boundary

Normalization runs with different schema versions are not compared. A future migration or explicit compatibility adapter must define how their meanings relate before cross-version comparison is allowed.

This API can compare any two compatible private runs, but the supplied baseline ID alone does not prove acceptance. Callers should read the current baseline through the acceptance repository, compare against it, then pass the same observed ID to `acceptNormalizationRun`. See [`normalization-review.md`](normalization-review.md).

## Failure contract

- `NORMALIZATION_DIFF_INPUT_INVALID`: one or both requested run IDs are invalid;
- `NORMALIZATION_RUN_NOT_FOUND`: one or both private normalization runs do not exist;
- `NORMALIZATION_DIFF_SCHEMA_MISMATCH`: the runs use different normalization schema versions.

Errors do not include requested run IDs, private paths, Korean display names, source payloads, or staging values.

## Current integration boundary

The local mining admin is not connected to the comparison or acceptance APIs yet. Its future comparison screen may consume these contracts, but must remain bound to `127.0.0.1`, must not expose private values through the public wiki, and must keep explicit review decisions separate from read-only diff calculation.
