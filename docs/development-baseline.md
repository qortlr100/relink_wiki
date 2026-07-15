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
| Browser tests        | Playwright (planned)                        | Will verify wiki navigation and critical admin flows once the suite is added     |
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
- `RELINK_NORMALIZATION_MAPPING_PATH`: private mapped-normalization JSON input.
- `RELINK_KOREAN_MESSAGE_DIRECTORY_PATH`: private directory containing the extracted Korean `text.msg` and `text_chara.msg` files used by the read-only localization join validator.

Snapshot output and log-level settings are not implemented. Add them to `.env.example` only when the publisher or structured logging code consumes and validates them.

Configuration must be parsed once at startup and validated. Application code must consume the validated configuration object, not read environment variables throughout the codebase.

The currently validated extraction baseline pins GBFRDataTools `2.0.0` and requires the .NET 10 x64 runtime. Its reproducible sample workflow, archive coverage, candidate table results, release hash, and known `skill.tbl` incompatibility are recorded in [`extractor-validation.md`](extractor-validation.md).

## Pipeline stages

Each stage has a separate input/output contract. The current repository status is:

| Stage         | Status      | Current contract                                                                                                                                                       |
| ------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **extract**   | Partial     | Preflight and a documented read-only GBFRDataTools workflow exist; the repository does not invoke extraction yet.                                                      |
| **import**    | Implemented | Imports four allowlisted candidate tables into private staging records with provenance and idempotency.                                                                |
| **normalize** | Implemented | Maps explicitly selected staging rows into versioned `staged` normalized records; Korean display-name joins are reproducibly validated but not applied automatically.  |
| **diff**      | Implemented | A read-only engine compares two compatible private normalization runs with deterministic, allowlisted results.                                                         |
| **review**    | Partial     | Explicit run acceptance persists backup evidence, immutable history and one baseline per schema version; rejection, per-record review and admin integration remain.    |
| **publish**   | Partial     | Generates a deterministic allowlisted manifest preview and explicitly writes an atomic JSON candidate; publication history, DB state transition and deployment remain. |
| **verify**    | Partial     | Domain, wiki and publisher validate the complete snapshot; candidate bytes are re-read and hashed, while deployment verification is not built.                         |

Stages must be independently repeatable and must not infer success from file existence alone.

The first import increment reads only the allowlisted `chara`, `weapon`, `gem`, and `ability` tables from a GBFRDataTools candidate SQLite database. It stores every accepted source row as a private staging JSON payload, joined to an import run that records the extractor version, import timestamp, and staging schema version. A content fingerprint makes exact reruns reuse the original atomic import instead of duplicating runs or rows. The known `skill.tbl` incompatibility is retained as an `SKILL_TABLE_INCOMPATIBLE` warning. See [`staging-import.md`](staging-import.md) for the executable contract and current limits.

The first normalization increment accepts a private, explicitly curated mapping file for selected staging rows. It derives category and provenance from the selected import, validates the Korean display name and public identifiers, and writes only `staged` normalized records. The mapping and source payload hashes form an idempotency fingerprint, so identical reruns reuse the original normalization run. It does not infer localization joins or publish data. See [`normalization.md`](normalization.md).

The read-only localization validator establishes the current `chara.CharaName`, `weapon.Name`, `gem.Name`, and `ability.Unk5` joins against the extracted Korean message catalogs. It reports only coverage counts and keeps unresolved or empty-key rows out of automatic normalization. See [`localization-validation.md`](localization-validation.md).

The read-only normalization diff pairs records by normalized category and source record ID, compares only the public candidate fields, reports deterministic status counts, and rejects cross-schema comparisons. A separate atomic acceptance contract requires verified, path-free NAS backup evidence, prevents stale baseline replacement, preserves prior acceptance history, and changes the accepted run's records from `staged` to `reviewed`. Neither contract is connected to the local admin yet. See [`normalization-diff.md`](normalization-diff.md) and [`normalization-review.md`](normalization-review.md).

## Public snapshot contract

The current version 1 snapshot contract is validated by `publicSnapshotSchema` in `packages/domain`. It contains the four allowlisted collections `characters`, `weapons`, `sigils`, and `skills` together with `schemaVersion`, SHA-256 `contentRevision` and `sourceRevision`, `generatedAt`, extractor identity and verified per-collection counts. Public records expose only their public identifier, slug, Korean display name, and the literal `published` review state.

The wiki imports `apps/wiki/public/data/public-snapshot.v1.json` as a build-time static asset and validates the complete value before deriving search, list, and detail records. Invalid records or unsupported schema versions fail with the stable `PUBLIC_SNAPSHOT_INVALID` error code. The loader does not access the filesystem, local database, extractor output, or mining admin at runtime. Replace this file only with an explicitly reviewed publisher output; its current contents remain prototype sample records rather than a real game-data release.

The publisher preview reads only the accepted schema-version baseline, requires every selected record to remain `reviewed`, verifies one extractor version, sorts records deterministically and maps only `id`, `slug` and `nameKo` into public DTOs. It hashes the internal acceptance identity into `sourceRevision`, so private run identifiers, source paths, import provenance and backup evidence are not exposed. A separate writer requires new path-free backup evidence and the observed current content revision, then uses a sibling lock and temporary file to replace and re-verify `public-snapshot.v1.json`. It still does not mark database records `published`, record a publication event or deploy Sites. See [`publication-preview.md`](publication-preview.md).

The project does not maintain a normal game-version history because it targets the expected final content state. If a development-time game transition changes extraction or normalized semantics, record a one-off compatibility label on that import rather than introducing a permanent version catalog.

## Public wiki visual verification

Browser verification for the public snapshot flow must cover the home page, category list, record detail, search, category filtering, and sorting. Check both the default desktop viewport and a 390 × 844 mobile viewport. Confirm that the mobile layout has no horizontal overflow, category cards collapse to one column, snapshot metadata remains readable, and record details collapse to one column. Review browser console warnings and errors during the same run. A Playwright dependency and checked-in browser test suite have not been added yet, so this remains a manual verification requirement.

The snapshot loader integration was visually verified on 2026-07-14 with the prototype snapshot. The home page rendered all five records and snapshot metadata; searching for `그랑` returned the single expected record; the character list filter returned only `지타`; slug sorting produced `djeeta` before `gran`; and the `gran` detail route displayed its public identifier, slug, and published state. Desktop and mobile layouts showed no clipping or overlap, the 390-pixel viewport had no horizontal overflow, and the browser console reported no warnings or errors.

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
