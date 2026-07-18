# Korean localization join validation

## Scope

The localization validator checks whether the current four candidate tables can resolve a Korean display name from extracted message files. It is read-only: it does not import rows, change review state, write normalized records, or publish data.

The validated joins are:

| Public category | Candidate table | Candidate column | Korean message file |
| --------------- | --------------- | ---------------- | ------------------- |
| Character       | `chara`         | `CharaName`      | `text_chara.msg`    |
| Weapon          | `weapon`        | `Name`           | `text.msg`          |
| Sigil           | `gem`           | `Name`           | `text.msg`          |
| Skill candidate | `ability`       | `Unk5`           | `text.msg`          |

The `.msg` inputs are MessagePack documents. The validator decodes them locally and validates the `rows_[].column_.id_hash_`, `subid_hash_`, and `text_` fields with Zod before using them. Display-name joins use only rows with an empty `subid_hash_`; non-empty sub-identifiers represent other UI contexts and may reuse an identifier with different text. Within that display-name catalog, every identifier must map to exactly one text, so a duplicate identifier invalidates the input even when the current candidate tables do not reference it. Candidate keys are trimmed consistently for coverage lookup, while rows that required trimming are counted as non-canonical and block automatic normalization. The validator reports counts only and never prints message identifiers, localized text, source payloads, or local paths.

The general candidate import preserves arbitrary source columns and therefore accepts string, numeric, bigint, and null SQLite values. Localization validation has a narrower contract: each selected join column must contain a message identifier string or null. Numeric values are not coerced into identifiers or counted as missing localization because that would hide an incompatible candidate-table shape; they fail with `LOCALIZATION_TABLE_INVALID` instead.

## Reproducible extraction

Using the pinned GBFRDataTools release, extract these private files from `data.i` into `RELINK_RAW_OUTPUT_PATH`:

```text
system/table/text/ko/text.msg
system/table/text/ko/text_chara.msg
```

The broader investigation also confirmed `text_tag.msg`, `text_chara_tag.msg`, `text_uskill.msg`, and `text_uskill_tag.msg`, but they are not required for the four display-name joins above. Keep all extracted message files outside Git.

Set the directory containing `text.msg` and `text_chara.msg`:

```dotenv
RELINK_KOREAN_MESSAGE_DIRECTORY_PATH=C:\\path\\to\\private\\raw\\system\\table\\text\\ko
```

Then run:

```bash
pnpm --filter @relink-wiki/extractor localization:validate
```

## Current evidence

The 2026-07-15 validation against the pinned GBFRDataTools `2.0.0` candidate output produced:

| Category  | Source rows | Non-empty keys | Matched rows | Ignored empty-key rows | Non-canonical key rows | Unresolved rows |
| --------- | ----------: | -------------: | -----------: | ---------------------: | ---------------------: | --------------: |
| Character |          41 |             37 |           35 |                      4 |                      0 |               2 |
| Weapon    |         410 |            363 |          361 |                     47 |                      0 |               2 |
| Sigil     |       1,034 |          1,023 |        1,023 |                     11 |                      0 |               0 |
| Skill     |         278 |            262 |          262 |                     16 |                      0 |               0 |

The two unresolved character rows share one context-dependent key whose base display-name text is empty. A separate evidence review established that every non-empty context variant agrees on `주인공` and that the structured character fields distinguish male and female playable variants. [`character-relationship-mapping-policy.md`](character-relationship-mapping-policy.md) defines the narrow reviewed names `주인공 (남성)` and `주인공 (여성)`. The validator intentionally remains strict: context-only text is not promoted into the general canonical display-name catalog, so these rows continue to require explicit private mapping.

The two unmatched weapon rows share one unresolved hash-like key rather than the normal `TXT_WEP_NAME_*` form. Their intended display names and publication meaning are still not established. Because automatic coverage is incomplete, the validator reports only unresolved counts and sets `readyForAutomaticNormalization` to `false`.

Empty or null keys are counted as ignored candidate rows. They are not silently converted into public records. An explicit policy for placeholder and internal rows is required before automatic localized normalization is introduced.

Automatic normalization readiness also requires every category to contain at least one source row. An empty candidate table represents missing coverage rather than a successful zero-error validation.

## Failure contract

- `LOCALIZATION_CANDIDATE_INVALID`: the candidate SQLite file cannot be opened read-only;
- `LOCALIZATION_MESSAGE_INVALID`: a required message file cannot be read, decoded, or validated, or contains duplicate identifiers;
- `LOCALIZATION_TABLE_INVALID`: a required candidate table or message-key column cannot be read.

Configuration validation failures use `EXTRACTOR_CONFIG_INVALID`. None of these failures includes a private path, message identifier, localized text, or source payload.
