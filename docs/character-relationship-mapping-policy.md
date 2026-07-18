# Protagonist relationship mapping policy

## Scope

This policy resolves the two character rows that are present in the private candidate table but absent from the reviewed normalization mapping. It defines how those targets may enter the reviewed character catalog so that weapon and skill relationships can preserve their source meaning. It does not change the current normalized or public snapshot schema, edit the private mapping, accept a baseline, publish a snapshot or deploy the wiki.

## Evidence

The 2026-07-18 local review established all of the following without writing private data:

- both rows use the same character message key;
- the base display-name entry is empty, but all six non-empty context variants agree on the Korean label `주인공`;
- both rows are non-NPC, level-capable character entries with distinct UI order values;
- their structured gender values are different, and those values consistently mean male and female when cross-checked against the existing reviewed character catalog;
- the reviewed mapping currently contains 19 weapon and 16 skill references to the male target, and 18 weapon and 16 skill references to the female target;
- there are no empty or unknown targets in either relationship set.

The evidence supports two real variants of one player-facing role. It does not support treating the empty base message as a canonical name, inventing a proper name, or merging two source identities into one target.

## Decision

The two rows are separate public character records with these reviewed Korean display names:

| Source meaning             | `nameKo`        |
| -------------------------- | --------------- |
| Male protagonist variant   | `주인공 (남성)` |
| Female protagonist variant | `주인공 (여성)` |

The implementation must follow these rules:

1. Keep one normalized character record per private source row. Derive each public `id` and `slug` from its existing stable character identifier using the normal character mapping rule.
2. Route every weapon and skill relationship to the corresponding variant. Do not collapse both targets into a synthetic shared protagonist record.
3. Treat the gender suffix as an explicit reviewed disambiguation derived from the structured character field. Do not use a context-only message row as the general canonical display-name join.
4. Do not substitute proper names such as Gran or Djeeta unless a later reproducible Korean source establishes those names for this data contract.
5. Add the two records through the private reviewed mapping workflow. The automatic mapping-candidate generator remains strict and must continue to exclude empty base display-name entries.
6. Keep private source identifiers, message identifiers, raw rows and local paths out of documentation, public DTOs and logs.

This is a narrow reviewed exception for the two known protagonist rows, not a general fallback for unresolved localization.

## Rejected alternatives

| Alternative                                              | Reason rejected                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| One synthetic `주인공` record                            | Merges two distinct source identities and makes gender-specific weapons and skills ambiguous. |
| Two records both named `주인공`                          | Preserves identity but creates indistinguishable list, search and relationship targets.       |
| Proper names inferred from outside the validated catalog | Introduces an unsupported localization source into the normalization contract.                |
| Omit the two characters or drop their relationships      | Leaves 69 valid reviewed references unresolved and prevents complete relationship navigation. |

## Implementation gate

Policy approval alone does not authorize publication. Before relationship fields are added to normalized records or a public snapshot:

1. add both character records to a new private mapping revision using the decided names and stable IDs;
2. run mapped normalization and review the resulting two added character records through the existing diff and approval workflow;
3. rerun relationship validation and require 361 of 361 weapon references and 262 of 262 skill references to resolve with `readyForPublicRelationships: true`;
4. design a new versioned normalized and public DTO relationship contract, including diff and review behavior;
5. back up the active SQLite database before any migration or accepted-baseline replacement;
6. preview, review and publish through the existing explicit gates.

The current version 1 schema and published snapshot remain unchanged until those steps are completed.
