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
| Browser tests        | Playwright                                  | Verifies wiki navigation and critical admin flows                                |
| Static analysis      | TypeScript, ESLint, Prettier                | Reproducible baseline across agents                                              |
| Initial publication  | Versioned static JSON                       | Simple and auditable before a hosted database is justified                       |

## Supported environments

The public wiki must build in the Sites environment.

The mining application targets the user's local Windows game installation. It must accept configuration rather than assuming a Steam library location. WSL support may be added, but Windows paths and WSL paths must never be mixed implicitly.

The initial scaffold is verified with Node.js 24.15.0 and pnpm 10.15.1 on Windows. Node.js 22 or newer is supported by the package contract, while Node.js 24 LTS is the recommended local runtime. Keep the package manager version aligned with the root `packageManager` field.

The active SQLite database lives on the Windows PC. The application may use WSL helpers when useful, but the Windows path is canonical and conversions must be explicit. Backups are written to NAS before destructive migrations, accepted-import replacement, or publication and are retained indefinitely under the initial policy.

## Configuration contract

Commit a documented `.env.example`, but never commit real values.

Expected local settings will include:

- game installation directory;
- GBFRDataTools executable path;
- local working directory;
- SQLite database path;
- snapshot output directory;
- log level.

Configuration must be parsed once at startup and validated. Application code must consume the validated configuration object, not read environment variables throughout the codebase.

## Pipeline stages

Each stage has a separate input/output contract:

1. **extract** — invokes the pinned external extractor in read-only mode;
2. **import** — parses known output and stores private staging records;
3. **normalize** — maps staging data into versioned domain records;
4. **diff** — compares the candidate import with the accepted local version;
5. **review** — records explicit user decisions;
6. **publish** — generates allowlisted public DTOs and a manifest;
7. **verify** — validates snapshot integrity and public build compatibility.

Stages must be independently repeatable and must not infer success from file existence alone.

## Public snapshot contract

The current version 1 prototype snapshot is validated by `publicSnapshotSchema` in `packages/domain`. It contains the four allowlisted collections `characters`, `weapons`, `sigils`, and `skills` together with `schemaVersion`, `contentRevision`, `generatedAt`, and `sourceRevision`. Prototype records expose only their public identifier, slug, Korean display name, and the literal `published` review state.

This prototype contract is intentionally smaller than the final publication manifest. Before the first real data release, the publisher will add and validate release metadata similar to:

```ts
type SnapshotManifest = {
  schemaVersion: number;
  contentRevision: string;
  generatedAt: string;
  sourceRevision: string;
  extractor: {
    name: "GBFRDataTools";
    version: string;
  };
  recordCounts: Record<string, number>;
};
```

The final publication manifest schema will be defined with Zod and inferred into TypeScript when the publisher is implemented. Public DTOs are allowlists and must not reuse private database row types directly. Do not treat the in-app sample snapshot as a generated public release.

The project does not maintain a normal game-version history because it targets the expected final content state. If a development-time game transition changes extraction or normalized semantics, record a one-off compatibility label on that import rather than introducing a permanent version catalog.

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
