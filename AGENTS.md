# AGENTS.md

This file defines the mandatory working agreement for every human or AI agent contributing to this repository. Read it before inspecting implementation details or changing files.

## 1. Project mission

Build a maintainable database wiki for Granblue Fantasy: Relink with two strictly separated surfaces:

- `apps/wiki`: a public, read-only wiki containing only reviewed publishable data.
- `apps/mining-admin`: a localhost-only tool for extraction runs, validation, review, and publication.

Never expose local paths, raw extraction output, unpublished records, logs, credentials, or admin capabilities through the public wiki.

## 2. Sources of truth

Use the following precedence when instructions conflict:

1. The current explicit user request.
2. This `AGENTS.md`.
3. Code-adjacent schemas, tests, and configuration in Git.
4. Notion project decisions and data documentation.
5. Existing implementation patterns.

GitHub is the source of truth for code, schemas, migrations, tests, and minimum run instructions. Notion is the source of truth for planning, research, the data dictionary, work logs, and architectural decision summaries.

Project hub: https://app.notion.com/p/39df3967bca880c2800cd8026fcccb4a

## 3. Fixed technical direction

- Monorepo package manager: pnpm workspaces.
- Application language: TypeScript with strict compiler settings.
- UI: React using the Sites-compatible Vinext starter conventions.
- Runtime validation: Zod at every untrusted boundary.
- Local database: SQLite.
- Database access: Drizzle ORM unless an accepted decision record changes it.
- Unit and integration tests: Vitest.
- Browser tests: Playwright.
- Formatting and linting: Prettier and ESLint.
- Extraction engine: call a pinned GBFRDataTools release as an external tool; do not copy or fork its source into this repository without an explicit decision.
- Initial publication format: versioned static JSON snapshots. Introduce a hosted database only after measured need.
- User-facing text: Korean first. Keep identifiers, code, and developer-facing error codes in English.

Do not introduce another framework, package manager, database, language, or state-management library without documenting the reason and obtaining user approval when the change affects architecture.

## 4. Intended repository structure

```text
apps/
  wiki/                 Public wiki
  mining-admin/         Local-only administration UI and local API
packages/
  domain/               Shared domain types, schemas, and business rules
  database/             SQLite schema, migrations, and repositories
  ui/                   Shared presentational components only
tools/
  extractor/            GBFRDataTools adapter and import pipeline
  publisher/            Reviewed snapshot generation
data/
  raw/                   Local only; ignored
  local/                 Local SQLite; ignored
  exports/               Generated; ignored
docs/                    Code-adjacent technical documentation
```

Create folders only when they contain real implementation. Do not add empty scaffolding for speculative features.

## 5. Data safety and copyright boundary

- Never commit game archives, extracted game assets, local databases, generated exports, save files, or copyrighted source dumps.
- Never embed machine-specific game installation paths in code or documentation.
- Read paths and tool locations from validated configuration or environment variables.
- Never upload extracted data to an external service unless the user explicitly authorizes that exact publication.
- Treat all extracted records as private until they pass an explicit review state.
- Public output must be generated from an allowlist schema. Do not publish by copying whole source records and deleting a few known fields.
- Store provenance for normalized records: source file identifier, extractor version, import run ID, import timestamp, and schema version. Do not require a game-version catalog unless development reveals a real compatibility need.
- Do not modify the installed game or its `data.i` during read-only mining workflows.

## 6. Public/private separation

The public wiki must not import from `apps/mining-admin`, `tools/extractor`, local database adapters, or filesystem APIs.

Shared packages may contain domain types and pure functions. They must not contain secrets, absolute paths, process spawning, or admin-only operations.

The mining admin must bind to `127.0.0.1` by default. Listening on external interfaces requires an explicit user-controlled configuration and a security review.

Publication is always an explicit operation with a preview or diff. Never publish automatically after extraction.

## 7. Coding rules

- Enable TypeScript strict mode. Do not use `any`; use `unknown` and narrow it.
- Prefer small pure functions and explicit data transformations.
- Validate files, subprocess output, API input, database rows, and JSON snapshots with Zod.
- Use domain-specific names. Avoid generic names such as `data`, `item`, `info`, or `manager` when a precise name exists.
- Keep UI components focused on rendering and interaction. Put domain rules in `packages/domain`.
- Use repository interfaces for database access; do not scatter SQL through UI code.
- Make extraction and import steps idempotent. Re-running the same input must not create duplicate records.
- Use structured errors with stable English codes and a Korean user-facing message where applicable.
- Preserve unknown source fields only in private staging records, never in public DTOs.
- Do not add dependencies for functionality that can be implemented clearly with the existing stack.
- Comments explain why, constraints, or non-obvious format behavior. Do not narrate straightforward code.

## 8. Change workflow

Before changing code:

1. Read this file and the nearest nested `AGENTS.md`, if one exists.
2. Inspect the affected code, tests, schemas, and current Git status.
3. Check the Notion project hub when the task depends on research, roadmap state, or a prior architectural decision.
4. State assumptions if missing information can affect data compatibility or publication safety.

While changing code:

1. Keep the diff limited to the requested outcome.
2. Preserve unrelated user changes.
3. Update schemas, validation, tests, and documentation together when their contract changes.
4. Record meaningful project progress or architectural decisions in Notion.
5. Never include raw or generated game data in a commit.

Before declaring completion:

1. Run formatting and linting for affected packages.
2. Run type checking.
3. Run relevant unit/integration tests.
4. Run the production build for affected applications.
5. For UI changes, verify the relevant route visually and test primary interactions.
6. Review `git diff` and confirm no local data, secrets, or internal paths are present.
7. Report checks run, remaining risks, and any manual follow-up.

Do not claim a check passed if it was not run. Explain unavailable checks briefly.

## 9. Git conventions

- Default branch: `main`.
- Branch names: `feature/<short-name>`, `fix/<short-name>`, `docs/<short-name>`, or `chore/<short-name>`.
- Commit messages use Conventional Commits, for example `feat(wiki): add character index`.
- Keep commits focused and reversible.
- Do not force-push shared branches.
- Prefer a draft pull request for substantial work.
- Do not mix generated public snapshots with unrelated source changes.

## 10. Versioning, backup, and compatibility

- Pin the GBFRDataTools version used for an import and store it in import metadata.
- Do not maintain game-version history by default. The project targets the current final content state; record an exceptional compatibility label only when a development-time transition changes parsing or normalized meaning.
- Every normalized database change requires a migration.
- Every public snapshot includes `schemaVersion`, `contentRevision`, `generatedAt`, and `sourceRevision`.
- Readers must fail clearly on unsupported schema versions.
- Do not silently reinterpret old fields. Migrate them or keep explicit compatibility handling.
- Keep the active SQLite database on the Windows PC and back it up to NAS before destructive migrations, accepted-import replacement, or publication.
- Retain NAS backups indefinitely unless the user later defines a retention policy. Backup cleanup must never be automated under the current policy.

## 11. Definition of done

A task is complete only when:

- the requested behavior is implemented;
- public/private boundaries remain intact;
- relevant validation and tests pass;
- code-adjacent documentation is current;
- Notion status or decision records are updated when applicable;
- no ignored/private data is included;
- the user receives a concise outcome and any required next action.
