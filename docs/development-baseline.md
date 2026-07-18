# Development baseline

The mandatory contributor and agent rules live in the repository root `AGENTS.md`. This document explains the chosen baseline without duplicating every rule.

## Stack

| Concern              | Choice                                      | Reason                                                                           |
| -------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| Repository           | pnpm workspace monorepo                     | Shares types and validation while keeping public and local applications separate |
| Application language | TypeScript (strict)                         | One language across the wiki, local admin, pipeline adapters, and tests          |
| Public UI            | React / Sites-compatible Vinext conventions | Direct path to the selected hosting surface                                      |
| Local admin          | React plus a localhost-only Node runtime    | Reuses UI and domain packages and can invoke external tools                      |
| Extraction           | Pinned GBFRDataTools executable             | Existing support for archive extraction and table-to-SQLite conversion           |
| Local storage        | SQLite                                      | Portable, inspectable, and appropriate for a single-user local workflow          |
| Data access          | Drizzle ORM                                 | Typed schema and migrations without hiding SQL behavior                          |
| Boundary validation  | Zod                                         | Makes extraction and publication contracts explicit                              |
| Unit tests           | Vitest                                      | Fast TypeScript-native tests                                                     |
| Browser tests        | Manual browser QA; Playwright suite planned | Verifies critical flows now while preserving a path to checked-in regression QA  |
| Static analysis      | TypeScript, ESLint, Prettier                | Reproducible baseline across agents                                              |
| Initial publication  | Versioned static JSON                       | Simple and auditable before a hosted database is justified                       |

## Supported environments

The public wiki must build in the Sites environment.

The mining application targets the user's local Windows game installation. It must accept configuration rather than assuming a Steam library location. WSL support may be added, but Windows paths and WSL paths must never be mixed implicitly.

The initial scaffold is verified with Node.js 24.15.0 and pnpm 10.15.1 on Windows. Node.js 22 or newer is supported by the package contract, while Node.js 24 LTS is the recommended local runtime. Keep the package manager version aligned with the root `packageManager` field.

The active SQLite database lives on the Windows PC. The application may use WSL helpers when useful, but the Windows path is canonical and conversions must be explicit. Backups are written to NAS before destructive migrations, accepted-import replacement, or publication and are retained indefinitely under the initial policy.

## Configuration contract

Commit a documented `.env.example`, but never commit real values.

The implemented extractor commands read these settings:

- `GBFR_DATA_TOOLS_PATH`: GBFRDataTools executable path used by preflight;
- `GBFR_DATA_TOOLS_VERSION`: pinned extractor version, currently `2.0.0`;
- `GBFR_GAME_VERSION`: exceptional compatibility label checked by preflight;
- `GBFR_GAME_DATA_PATH`: game installation directory used by preflight;
- `RELINK_RAW_OUTPUT_PATH`: private extraction output directory used by preflight;
- `RELINK_CANDIDATE_DATABASE_PATH`: private GBFRDataTools candidate SQLite input;
- `RELINK_DATABASE_PATH`: private Relink Wiki SQLite database;
- `RELINK_NORMALIZATION_MAPPING_PATH`: private mapping-candidate output and reviewed mapped-normalization JSON input;
- `RELINK_KOREAN_MESSAGE_DIRECTORY_PATH`: private directory containing the extracted Korean `text.msg` and `text_chara.msg` files used by the read-only localization join validator.
- `RELINK_PUBLICATION_REQUEST_PATH`: private, strict version 1 request used only by the explicit local public snapshot publication command.

Snapshot output and log-level settings are not implemented. Add them to `.env.example` only when the publisher or structured logging code consumes and validates them.

Configuration must be parsed once at startup and validated. Application code must consume the validated configuration object, not read environment variables throughout the codebase.

The currently validated extraction baseline pins GBFRDataTools `2.0.0` and requires the .NET 10 x64 runtime. Its reproducible sample workflow, archive coverage, candidate table results, release hash, and known `skill.tbl` incompatibility are recorded in [`extractor-validation.md`](extractor-validation.md).

## Pipeline stages

Each stage has a separate input/output contract. The current repository status is:

| Stage         | Status      | Current contract                                                                                                                                                                                                                                                                                                               |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **extract**   | Partial     | Preflight and a documented read-only GBFRDataTools workflow exist; the repository does not invoke extraction yet.                                                                                                                                                                                                              |
| **import**    | Implemented | Imports four allowlisted candidate tables into private staging records with provenance and idempotency.                                                                                                                                                                                                                        |
| **normalize** | Implemented | Generates a private review candidate from canonical resolved localization joins, creates the narrow policy-approved protagonist revision only after exact evidence revalidation, maps only explicitly reviewed JSON into versioned `staged` records, and validates aggregate weapon/skill-to-character relationship readiness. |
| **diff**      | Implemented | A read-only engine compares two compatible private normalization runs with deterministic, allowlisted results.                                                                                                                                                                                                                 |
| **review**    | Implemented | The local admin compares the latest staged run, exports an allowlist-only deterministic Markdown report, persists per-record decisions, rejects stale comparisons, and gates acceptance on approval plus NAS backup evidence.                                                                                                  |
| **publish**   | Partial     | Local CLI and mining-admin publication controls, checked-in schema v1 snapshot and the actual Sites release are complete; checked-in replacement, deployment and rollback remain separate explicit operations.                                                                                                                 |
| **verify**    | Partial     | The actual snapshot passes automated boundaries, browser checks and complete deployed-JSON comparison; a live rollback transition still requires explicit approval and rehearsal.                                                                                                                                              |

Stages must be independently repeatable and must not infer success from file existence alone.

The first import increment reads only the allowlisted `chara`, `weapon`, `gem`, and `ability` tables from a GBFRDataTools candidate SQLite database. It stores every accepted source row as a private staging JSON payload, joined to an import run that records the extractor version, import timestamp, and staging schema version. A content fingerprint makes exact reruns reuse the original atomic import instead of duplicating runs or rows. The known `skill.tbl` incompatibility is retained as an `SKILL_TABLE_INCOMPATIBLE` warning. See [`staging-import.md`](staging-import.md) for the executable contract and current limits.

The mapping-candidate command idempotently imports the current candidate database, resolves only canonical non-empty Korean display-name joins, derives stable public identifiers from `chara.CharId` and the `Key` columns of `weapon`, `gem`, and `ability`, and writes a new private JSON file without overwriting an existing operator copy. Empty, non-canonical, and unresolved message keys remain excluded and are reported only as counts. The output is an unreviewed draft and does not normalize or publish data. See [`mapping-candidate.md`](mapping-candidate.md).

The mapped normalization increment accepts the private, explicitly reviewed mapping file for selected staging rows. It derives category and provenance from the selected import, validates the Korean display name and public identifiers, and writes only `staged` normalized records. The mapping and source payload hashes form an idempotency fingerprint, so identical reruns reuse the original normalization run. See [`normalization.md`](normalization.md).

The read-only localization validator establishes the current `chara.CharaName`, `weapon.Name`, `gem.Name`, and `ability.Unk5` joins against the extracted Korean message catalogs. It reports only coverage counts and keeps unresolved or empty-key rows out of automatic normalization. See [`localization-validation.md`](localization-validation.md).

The read-only relationship validator checks `weapon.CharaId` and `ability.ReqCharaId1` against `chara.CharId` for rows already selected by the reviewed mapping. It returns aggregate coverage only and blocks relationship publication readiness while any mapped source points to an unmapped or unknown character. The original version 1 mapping left 69 references pointing to two private protagonist variants. On 2026-07-18, a non-overwriting private mapping revision revalidated their approved names and one-to-one policy, produced an exact two-character addition diff, received both record approvals, and resolved all 361 mapped weapon plus 262 mapped skill references. Extending the versioned normalized/public schemas, taking a new NAS backup and accepting a baseline remain separate gated work. See [`character-relationship-mapping-policy.md`](character-relationship-mapping-policy.md) and [`relationship-validation.md`](relationship-validation.md).

The normalization diff pairs records by normalized category and source record ID, compares only the public candidate fields, reports deterministic status counts, and rejects cross-schema comparisons. The local admin selects the current version 1 baseline and latest staged candidate, sends only allowlisted values plus an opaque fingerprint to the browser, and persists `approved`/`rejected` decisions for `added`, `changed`, and `removed` rows. Stale fingerprints, pending decisions, or any rejection block acceptance. A separate atomic acceptance contract requires verified, path-free NAS backup evidence, prevents stale baseline replacement, preserves prior acceptance history, and changes the accepted run's records from `staged` to `reviewed`. See [`normalization-diff.md`](normalization-diff.md), [`normalization-review.md`](normalization-review.md), and [`review-dashboard.md`](review-dashboard.md).

## Public snapshot contract

The current version 1 snapshot contract is validated by `publicSnapshotSchema` in `packages/domain`. It contains the four allowlisted collections `characters`, `weapons`, `sigils`, and `skills` together with `schemaVersion`, SHA-256 `contentRevision` and `sourceRevision`, `generatedAt`, extractor identity and verified per-collection counts. Public records expose only their public identifier, slug, Korean display name, and the literal `published` review state.

The wiki imports `apps/wiki/public/data/public-snapshot.v1.json` as a build-time static asset and validates the complete value before deriving search, list, and detail records. Invalid records or unsupported schema versions fail with the stable `PUBLIC_SNAPSHOT_INVALID` error code. The loader does not access the filesystem, local database, extractor output, or mining admin at runtime. The current file is the explicitly reviewed schema version 1 publication with content revision `1b6f48b407c6114ee6dc73328c561d37a4f3dd21d2de8a944296a34e6b2117cf`: 37 characters, 361 weapons, 1,023 sigils and 262 skills.

The publisher preview reads only the accepted schema-version baseline, requires every selected record to remain `reviewed`, verifies one extractor version, sorts records deterministically and maps only `id`, `slug` and `nameKo` into public DTOs. It hashes the internal acceptance identity into `sourceRevision`, so private run identifiers, source paths, import provenance and backup evidence are not exposed. The explicit local publication command requires a private request that fixes the reviewed snapshot's complete file digest, content revision, publication UUID, timestamps, new path-free backup evidence and expected current revision. Its writer uses a sibling lock and temporary file to replace and re-verify `public-snapshot.v1.json`; the finalizer then rechecks the current publication pointer, accepted baseline, exact allowlisted content and review states before atomically recording immutable history, advancing the schema-version pointer and changing the baseline records to `published`. A byte-identical candidate and exact finalization request can both be retried after a lost response. An unfinalized candidate is not deployed, and the command does not copy it into the wiki or deploy Sites. See [`publication-preview.md`](publication-preview.md) and [`publication-history.md`](publication-history.md).

## Sites deployment contract

The repository-root `build` keeps the complete workspace build and then copies only the `apps/wiki` Sites Worker, static assets, and hosting manifest into the root `dist/` artifact. The packaging gate parses the hosting manifest, scans every emitted file for known mining-admin, SQLite, and local-path markers, and then statically verifies that the Worker default export owns a `fetch` handler without executing the emitted module. The reviewed schema version 1 snapshot is deployed at the current public Sites origin. `site:verify` reads only its public JSON endpoint and requires the complete parsed value to match the expected reviewed snapshot before reporting the schema version, content revision and category counts. See [`sites-deployment.md`](sites-deployment.md).

The project does not maintain a normal game-version history because it targets the expected final content state. If a development-time game transition changes extraction or normalized semantics, record a one-off compatibility label on that import rather than introducing a permanent version catalog.

## Public wiki visual verification

Browser verification for the public snapshot flow must cover the home page, category list, record detail, search, category filtering, and sorting. Check both the default desktop viewport and a 390 × 844 mobile viewport. Confirm that the mobile layout has no horizontal overflow, category cards collapse to one column, snapshot metadata remains readable, and record details collapse to one column. Review browser console warnings and errors during the same run. A Playwright dependency and checked-in browser test suite have not been added yet, so this remains a manual verification requirement.

The snapshot loader integration was visually verified on 2026-07-14 with the former five-record prototype snapshot. After replacing it with the actual 1,681-record publication on 2026-07-16, snapshot and catalog tests, all production builds, the Sites public/private artifact gate, and local HTTP rendering for the home, character list and a character detail route passed. The local Workers server also required pinning `compatibility_date` to the newest date supported by the pinned workerd runtime (`2026-05-22`) rather than advancing it with the wall clock.

The actual-data browser pass completed on 2026-07-17 after temporarily allowing the Codex in-app browser to access its Windows profile path. Desktop `1440 × 900` and mobile `390 × 844` checks covered home, category navigation, search, empty results, sorting, lists, record details, horizontal overflow and browser console output. The mobile snapshot revision now wraps within the viewport, category and detail layouts collapse to one column, and the console contained no warnings or errors. The 2026-07-18 checked-in snapshot contains all 1,683 published rows; the reader-facing catalog exposes 1,682 because exact ID `character-pl000b` is intentionally withheld from counts, search, lists and direct detail navigation without changing extraction or publication data.

The mining-admin record-review pass completed on the same date after migration `0004_record_review_decisions` was backed up and applied to the active private database. Desktop and mobile checks covered the no-candidate state, allowlisted record diffs, decision note persistence, approval/rejection transitions, filters, pagination, invalid acceptance input, completed candidate acceptance, publication environment blocking, horizontal overflow and browser warning/error output. The write interactions used a disposable local fixture rather than the active database.

## Initial quality commands

The root package exposes `pnpm check` as the required aggregate verification command. It runs the following checks in order:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The initial scaffold passed this complete sequence on Windows, including native `better-sqlite3` installation and production builds for both applications. Agents should call `pnpm check` instead of inventing package-specific alternatives unless diagnosing a failure.

## Documentation ownership

- Root `README.md`: purpose, prerequisites, and minimum local start.
- `AGENTS.md`: mandatory contribution and agent behavior.
- `docs/`: code contracts that must change with implementation.
- Notion: roadmap, research, work tracking, data dictionary, and architectural decision summaries.
