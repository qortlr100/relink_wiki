# Relationship validation

## Scope

The read-only relationship validator measures whether the currently mapped public weapon and skill candidates can point to mapped public characters. It establishes evidence for a later normalized/public relationship contract; it does not change the mapping file, write normalized records, accept a baseline, generate a snapshot or publish data.

The current source joins are:

| Source category | Source field          | Target field   |
| --------------- | --------------------- | -------------- |
| Weapon          | `weapon.CharaId`      | `chara.CharId` |
| Skill           | `ability.ReqCharaId1` | `chara.CharId` |

Only source rows already present in the private normalization mapping are measured. A target is publishable only when its `chara` row is also present in that mapping. This prevents a valid private identifier from becoming a broken public link merely because its character name or presentation policy has not been approved.

## Result contract

Each relationship reports aggregate counts only:

- mapped source records;
- references resolved to mapped public characters;
- empty references;
- references to existing but unmapped private characters;
- references that do not exist in the character table;
- unique resolved and unmapped target counts.

`readyForPublicRelationships` is `true` only when both relationship sets contain mapped sources and every source reference resolves to a mapped public character. Results never contain source identifiers, public record IDs, localized values, source payloads or local paths.

## Current local evidence

The 2026-07-18 validation of the reviewed version 1 mapping produced:

| Relationship       | Mapped sources | Resolved | Unmapped references | Unique unmapped targets |
| ------------------ | -------------: | -------: | ------------------: | ----------------------: |
| Weapon → character |            361 |      324 |                  37 |                       2 |
| Skill → character  |            262 |      230 |                  32 |                       2 |

There are no empty or unknown references. Both relationship sets are blocked by the same two character targets that exist in the private candidate table but are not present in the reviewed mapping, so `readyForPublicRelationships` is currently `false`.

The public-presentation decision is now recorded in [`character-relationship-mapping-policy.md`](character-relationship-mapping-policy.md): preserve the targets as separate character records named `주인공 (남성)` and `주인공 (여성)`, then route each relationship to its corresponding variant. The policy does not mutate the current private mapping or version 1 public schema.

## Run

Load the private `.env` values into the current shell, then run:

```powershell
pnpm --filter @relink-wiki/extractor relationships:validate
```

The command reads `RELINK_CANDIDATE_DATABASE_PATH` and `RELINK_NORMALIZATION_MAPPING_PATH`. Both inputs are validated as untrusted data, and the candidate SQLite file is opened read-only with query-only mode enabled.

## Failure contract

- `RELATIONSHIP_CANDIDATE_INVALID`: the candidate SQLite file cannot be opened read-only;
- `RELATIONSHIP_MAPPING_INVALID`: the mapping file is unreadable, invalid or disagrees with mapped source rows;
- `RELATIONSHIP_TABLE_INVALID`: a required table, field, row shape or identifier contract is invalid;
- `EXTRACTOR_CONFIG_INVALID`: a required private environment setting is missing or invalid.

Errors do not include private paths, source identifiers, localized text or source payloads.

## Next gate

Before adding relationships to the normalized database or public snapshot:

1. add the two policy-approved character records to a new private mapping revision and review their normalization diff;
2. make this validator report `readyForPublicRelationships: true` against the reviewed mapping;
3. design a new versioned normalized and public DTO contract, including diff and review fields;
4. back up the active SQLite database before applying its migration;
5. review and publish the new snapshot through the existing explicit gates.
