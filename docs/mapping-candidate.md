# Private normalization mapping candidate

## Purpose

The mapping-candidate command creates the first private JSON draft required by mapped normalization. It runs only on the local Windows data workflow and never writes to the public wiki, changes review state, publishes a snapshot, or uploads extracted data.

The command first runs the existing candidate import idempotently. The resulting import run ID is embedded in the mapping file, ensuring every mapping row targets the same private staging import.

## Inputs and output

The command reads these validated settings:

- `RELINK_CANDIDATE_DATABASE_PATH`: GBFRDataTools candidate SQLite;
- `RELINK_DATABASE_PATH`: private Relink Wiki SQLite;
- `RELINK_KOREAN_MESSAGE_DIRECTORY_PATH`: directory containing `text.msg` and `text_chara.msg`;
- `RELINK_NORMALIZATION_MAPPING_PATH`: new private JSON output;
- `GBFR_DATA_TOOLS_VERSION`: pinned `2.0.0` extractor identity.

The output path's parent directory must already exist. The command uses exclusive creation and refuses to overwrite an existing mapping file. Keep the file outside Git; it contains localized game text and private source identifiers.

## Candidate policy

| Category  | Stable source identifier | Display-name join                    |
| --------- | ------------------------ | ------------------------------------ |
| Character | `chara.CharId`           | `chara.CharaName` → `text_chara.msg` |
| Weapon    | `weapon.Key`             | `weapon.Name` → `text.msg`           |
| Sigil     | `gem.Key`                | `gem.Name` → `text.msg`              |
| Skill     | `ability.Key`            | `ability.Unk5` → `text.msg`          |

Stable source identifiers are lowercased, consecutive non-alphanumeric characters become one hyphen, and the normalized category is prefixed. The same stable value is used for version 1 `id` and `slug`. Duplicate or invalid results reject the complete candidate before any file is written.

Rows are included only when the message key is a canonical non-empty string and resolves to non-empty Korean text. Empty/null, whitespace-normalized, and unresolved keys are excluded. The command reports category counts but never prints source identifiers, localized text, source payloads, or local paths.

The generated file is a review candidate, not an approval. The unresolved weapon rows remain absent until a separate evidence-backed policy resolves them. The two protagonist character rows also remain absent from automatic generation because their base display-name entry is empty; an operator may add them only through an explicitly reviewed private mapping revision that follows [`character-relationship-mapping-policy.md`](character-relationship-mapping-policy.md).

For that narrow protagonist exception, keep `RELINK_NORMALIZATION_MAPPING_PATH` pointed at the existing reviewed mapping and set `RELINK_NORMALIZATION_MAPPING_REVISION_PATH` to a new, non-existent private file. Then run:

```bash
pnpm --filter @relink-wiki/extractor mapping:protagonists
```

The command fails closed unless the exact policy evidence still holds: two unmapped non-NPC, level-capable character rows share one empty canonical display-name entry; their structured gender values are the reviewed `1` and `2` pair; their UI order values remain distinct; and exactly six non-empty Korean context variants all equal `주인공`. It derives the two stable public identifiers through the normal character rule, assigns the reviewed names `주인공 (남성)` and `주인공 (여성)`, validates the complete mapping, and writes the revision with exclusive creation. It never changes or overwrites the source mapping.

Korean catalogs may intentionally contain Latin letters, digits, or repeated display names. Those properties alone do not exclude a row: the stable source identifier keeps records distinct, while review must still reject empty text, control characters, context-only placeholders, or an unsupported join.

## Current local evidence

The first 2026-07-15 local candidate contains 1,681 records: 35 characters, 361 weapons, 1,023 sigils, and 262 skills. Structural review found no empty names, control characters, or `id`/`slug` mismatches. Four resolved catalog strings contain no Hangul and are retained because they are non-empty canonical results; 260 category-scoped duplicate-name groups are retained because display names are not identifiers. The two unresolved character rows, two unresolved weapon rows, and all empty-key rows remain excluded.

On 2026-07-18, `mapping:protagonists` revalidated the exact private policy evidence and created a separate 1,683-record revision without changing the original mapping. Mapped normalization produced a candidate whose baseline diff is exactly two added character records and 1,681 unchanged records; both additions were approved through the record-review workflow. The resulting baseline was accepted and published locally through the separate backup and confirmation gates. Relationship schema changes and Sites deployment remain separate operations.

## Run and review

After loading the private `.env`, run:

```bash
pnpm --filter @relink-wiki/extractor mapping:candidate
```

Review the file locally before normalization:

1. confirm every category count against `localization:validate`;
2. inspect Korean names, public IDs, and slugs for obvious placeholder or context text;
3. keep unresolved and ignored rows absent unless a documented policy defines a narrow manual mapping exception;
4. retain the exact `importRunId` generated by the command.

After review, run:

```bash
pnpm --filter @relink-wiki/extractor normalize:mapped
```

Mapped normalization validates the entire JSON again and writes only `staged` private records. Acceptance, publication, and deployment remain separate explicit operations.

## Failure contract

- `MAPPING_CANDIDATE_SOURCE_INVALID`: candidate identifiers, table structure, or generated mapping contract is invalid;
- `MAPPING_CANDIDATE_OUTPUT_INVALID`: the private output directory or file cannot be written;
- `MAPPING_CANDIDATE_OUTPUT_EXISTS`: an operator mapping already exists and was not overwritten;
- existing import and localization errors retain their stable codes.
- `PROTAGONIST_MAPPING_INPUT_INVALID`: the source mapping or candidate character table is invalid;
- `PROTAGONIST_MAPPING_EVIDENCE_INVALID`: a policy revalidation condition no longer holds;
- `PROTAGONIST_MAPPING_OUTPUT_INVALID`: the revision cannot be written safely;
- `PROTAGONIST_MAPPING_OUTPUT_EXISTS`: the requested revision already exists and was not overwritten.

Configuration validation failures use `EXTRACTOR_CONFIG_INVALID`. Errors do not contain private paths, identifiers, localized text, or source payloads.
