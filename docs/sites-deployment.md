# Sites deployment

## Purpose

Sites hosts only the public wiki. GitHub remains the source of truth for the monorepo, while local extraction, SQLite, review evidence, publisher inputs, and the mining admin remain outside the hosted runtime.

## Build contract

The repository root owns the Sites project identity. The normal workspace build still builds every package and application, then `site:package` copies only `apps/wiki/dist` to the repository-root `dist/`.

The final artifact must contain:

- `dist/server/index.js` with an ESM default export exposing `fetch(request, env, ctx)`;
- `dist/client/` with the wiki's static assets and version 1 snapshot;
- `dist/.openai/hosting.json` with the Sites project identity.

Packaging fails if the Worker or manifest is missing or invalid. Before loading the Worker, it rejects symbolic links and unsupported filesystem entries, then scans every emitted file for known mining-admin, SQLite dependency, review repository, and local database configuration markers.

The marker scan is a defense-in-depth check, not proof that semantically equivalent or obfuscated private code is absent. The primary boundary remains the dedicated `apps/wiki` entry point and its dependency graph. The scan deliberately covers binary as well as text assets so a new extension or source-map format cannot silently bypass the gate; artifact size and packaging time should be monitored before changing that fail-closed policy.

The root `dev` command delegates through `npm --prefix apps/wiki` so Sites agent preview can start without a separately exposed `pnpm` executable while package-local script resolution still selects the wiki's declared Vite dependency.

## Public and private boundary

- `apps/wiki` may import the shared domain package and the validated public snapshot only.
- `apps/mining-admin`, `packages/database`, `tools/extractor`, and `tools/publisher` are not Sites entry points.
- The build must not read the local database or publisher output directory.
- A Sites checkpoint never performs extraction, review, snapshot publication, or database state transition.

The current checked-in snapshot is prototype sample data. A private checkpoint can verify routing, rendering, artifact integrity, and the hosting path, but it is not the actual public data release.

## Release sequence

1. Complete the explicit local review and NAS-backed snapshot publication flow.
2. Replace the checked-in version 1 snapshot only with the verified publisher output.
3. Run the full repository checks and confirm the Sites artifact boundary.
4. Create and verify an immutable Sites checkpoint.
5. Widen access only after the deployed snapshot identity and public content are confirmed.

Actual snapshot rollback and restoration of a previous public checkpoint remain follow-up operational work.
