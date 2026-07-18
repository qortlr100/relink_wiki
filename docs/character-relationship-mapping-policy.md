# Protagonist relationship mapping policy

## Scope

This policy resolves the two character rows that are present in the private candidate table but absent from the reviewed normalization mapping. It defines how those targets may enter the reviewed character catalog so that weapon and skill relationships can preserve their source meaning. It does not change the current normalized or public snapshot schema, edit the private mapping, accept a baseline, publish a snapshot or deploy the wiki.

## Evidence

The 2026-07-18 local review established all of the following without writing private data:

- both rows use the same character message key;
- the base display-name entry is empty, but all six non-empty context variants agree on the Korean label `주인공`;
- both rows are non-NPC, level-capable character entries with distinct UI order values;
- their structured gender values are different. The cross-check covered all 35 rows in the existing reviewed character mapping: among the 33 non-placeholder person rows, all 17 rows with value `1` are male-presented and all 16 rows with value `2` are female-presented; one non-human row with value `0` and one `dummy` row with value `1` were not used as supporting samples, and no reviewed row contradicted the interpretation;
- among weapon and skill source rows already present in the reviewed mapping, 19 weapons and 16 skills target the still-unmapped male character row, while 18 weapons and 16 skills target the still-unmapped female character row;
- there are no empty or unknown targets in either relationship set.

The evidence supports two real variants of one player-facing role. It does not support treating the empty base message as a canonical name, inventing a proper name, or merging two source identities into one target. The gender interpretation is strong dataset-specific evidence, not an official extractor enum contract; the revalidation and correction triggers below therefore remain mandatory.

## Decision

The two rows are separate public character records with these reviewed Korean display names:

| Source meaning             | `nameKo`        |
| -------------------------- | --------------- |
| Male protagonist variant   | `주인공 (남성)` |
| Female protagonist variant | `주인공 (여성)` |

The implementation must follow these rules:

1. Keep one normalized character record per private source row. Derive each public `id` and `slug` from its existing stable character identifier using the normal character mapping rule.
2. Route every weapon and skill relationship to the corresponding variant. Do not collapse both targets into a synthetic shared protagonist record.
3. Treat the gender suffix as an explicit reviewed disambiguation derived from the current structured character evidence, not as a universal enum assumption. Do not use a context-only message row as the general canonical display-name join.
4. Do not substitute proper names such as Gran or Djeeta unless a later reproducible Korean source establishes those names for this data contract.
5. Add the two records through the private reviewed mapping workflow. The automatic mapping-candidate generator remains strict and must continue to exclude empty base display-name entries. A previously reviewed manual mapping does not bypass the revalidation triggers below.
6. Keep private source identifiers, message identifiers, raw rows and local paths out of documentation, public DTOs and logs.

This is a narrow reviewed exception for the two known protagonist rows, not a general fallback for unresolved localization.

## Revalidation and correction triggers

Before reusing this exception after a GBFRDataTools version, candidate database or Korean message catalog change, rerun `localization:validate` and privately verify that the two targets still have the same stable identities, empty canonical display-name entries, unanimous `주인공` context variants and the same non-contradictory gender evidence.

Any of the following invalidates this policy for a new mapping or publication until the evidence and decision are reviewed again:

- the character unresolved count is no longer exactly two;
- either target gains a non-empty canonical Korean display name;
- the context variants no longer agree, or the structured gender evidence changes or gains a contradiction;
- either target's stable identity or relationship meaning changes.

When a canonical Korean name becomes available, replace the derived label only through a new private mapping revision, normalization diff and explicit review. Do not silently retain the manual label and do not overwrite an existing operator mapping file.

If contradictory evidence is found before publication, block the publication. If it is found after publication, stop further publications, explicitly roll Sites back to the last verified saved version that predates the affected snapshot, correct and review the private mapping, publish a new allowlisted snapshot through the normal gates, verify the restored deployment and update this policy and its Notion decision record. Never patch the deployed JSON directly. See [`sites-deployment.md`](sites-deployment.md) and [`publication-history.md`](publication-history.md).

## Rejected alternatives

| Alternative                                              | Reason rejected                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| One synthetic `주인공` record                            | Merges two distinct source identities and makes gender-specific weapons and skills ambiguous. |
| Two records both named `주인공`                          | Preserves identity but creates indistinguishable list, search and relationship targets.       |
| Proper names inferred from outside the validated catalog | Introduces an unsupported localization source into the normalization contract.                |
| Omit the two characters or drop their relationships      | Leaves 69 valid reviewed references unresolved and prevents complete relationship navigation. |

## Implementation gate

Policy approval alone does not authorize publication. Before relationship fields are added to normalized records or a public snapshot:

1. satisfy the revalidation triggers above against the exact private inputs used for the mapping revision;
2. add both character records to a new private mapping revision using the decided names and stable IDs;
3. run mapped normalization and review the resulting two added character records through the existing diff and approval workflow;
4. rerun relationship validation and require every currently mapped weapon and skill reference to resolve with `readyForPublicRelationships: true`; treat the reported mapped-source counts as evidence for that exact input, not as fixed policy constants;
5. design a new versioned normalized and public DTO relationship contract, including diff and review behavior;
6. back up the active SQLite database before any migration or accepted-baseline replacement;
7. preview, review and publish through the existing explicit gates.

Steps 1–4 were completed locally on 2026-07-18: the non-overwriting mapping revision revalidated the exact evidence, mapped normalization produced exactly two added character records with 1,681 unchanged records, both additions received record-level approval, and relationship validation resolved all 361 mapped weapons and 262 mapped skills with `readyForPublicRelationships: true`. Steps 5–7 remain open. The current version 1 schema, accepted baseline and published snapshot remain unchanged until those gates are completed.
