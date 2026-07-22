# Sites deployment

## Purpose

Sites hosts only the public wiki. GitHub remains the source of truth for the monorepo, while local extraction, SQLite, review evidence, publisher inputs, and the mining admin remain outside the hosted runtime.

## Build contract

The repository root owns the Sites project identity. The normal workspace build still builds every package and application, then `site:package` copies only `apps/wiki/dist` to the repository-root `dist/`.

The final artifact must contain:

- `dist/server/index.js` with an ESM default export exposing `fetch(request, env, ctx)`;
- `dist/client/` with the wiki's static assets and version 1 snapshot;
- `dist/.openai/hosting.json` with the Sites project identity.

Packaging fails if the Worker, `client/data/public-snapshot.v1.json`, or manifest is missing or invalid. The manifest permits only `project_id` plus disabled `d1` and `r2` entries; unexpected keys and hosted resource bindings fail closed. Before validating the Worker, packaging rejects symbolic links and unsupported filesystem entries, then scans every emitted file for known mining-admin, SQLite dependency, review repository, and local database configuration markers.

The marker scan is a defense-in-depth check, not proof that semantically equivalent or obfuscated private code is absent. The primary boundary remains the dedicated `apps/wiki` entry point and its dependency graph: only the wiki and shared domain workspace packages are allowlisted, so a newly added workspace package is private by default. Packaging derives package scopes from `pnpm-workspace.yaml`, then parses every reachable public workspace package and rejects relative static, dynamic, re-export, or CommonJS imports that escape that package's directory. Bare workspace imports must be declared dependencies, and computed module loads must expose a statically analyzable path prefix; cross-package access must use an allowlisted workspace dependency. The scan derives every non-public workspace package name and repository path from that same allowlist, then covers binary as well as text assets so a new package, extension, or source-map format cannot silently bypass the gate. Artifact size and packaging time should be monitored before changing that fail-closed policy.

The root packager copies the Wiki build to a staging directory, validates it there, and renames it to `dist/` only after every contract check passes. Any failure removes both staging and final output paths so an invalid or stale artifact cannot be uploaded by a later step that ignores the failed command's exit status.

The Worker compatibility date is pinned to `2026-05-22`, the newest date supported by the repository's pinned workerd runtime. Advancing this date requires updating and validating the runtime together; it must not follow the wall clock automatically.

The packaging script parses the boundary-checked Worker as JavaScript without importing or executing it. It resolves the emitted ESM default export to its object literal and verifies that the exported object owns a method, function, or arrow-function `fetch` handler. This is a structural check rather than a Cloudflare Workers runtime test; the immutable Sites checkpoint build and deployment status remain the hosted-runtime verification step.

The root `dev` command delegates through `npm --prefix apps/wiki` so Sites agent preview can start without a separately exposed `pnpm` executable while package-local script resolution still selects the wiki's declared Vite dependency.

The Sites lifecycle may create `.sites-runtime/` for local package-manager and checkpoint cache state. That directory is tooling-owned, is not application input, and remains excluded from Git, formatting, linting, and TypeScript discovery.

## Public and private boundary

- `apps/wiki` may import the shared domain package and the validated public snapshot only.
- `apps/mining-admin`, `packages/database`, `tools/extractor`, and `tools/publisher` are not Sites entry points.
- The build must not read the local database or publisher output directory.
- A Sites checkpoint never performs extraction, review, snapshot publication, or database state transition.

The current checked-in snapshot is the explicitly reviewed schema version 1 publication with content revision `1b6f48b407c6114ee6dc73328c561d37a4f3dd21d2de8a944296a34e6b2117cf`: 37 characters, 361 weapons, 1,023 sigils and 262 skills, for 1,683 records total. A Sites checkpoint becomes the current public release only after the public origin passes the complete JSON comparison below; the checked-in artifact alone is not deployment evidence.

## Deployed snapshot verification

Run the verifier after a checkpoint deployment or rollback:

```bash
pnpm site:verify -- https://relink-wiki.cid100.chatgpt.site
```

The command accepts only an HTTPS origin without credentials, a path, query or fragment. It fetches `/data/public-snapshot.v1.json` with a size limit, parses the expected and deployed files, and requires their complete JSON values to match. Success output contains only `SITE_DEPLOYMENT_VERIFIED`, the schema version, content revision and category counts. Provider response bodies, local paths and record values are not printed on failure.

The default expected file is the checked-in `apps/wiki/public/data/public-snapshot.v1.json`. To verify a restored checkpoint, preserve the reviewed snapshot from that saved version in a temporary operator-controlled location and pass it explicitly:

```bash
pnpm site:verify -- https://relink-wiki.cid100.chatgpt.site --expected-snapshot <file>
```

## Release sequence

1. Complete the explicit local review and NAS-backed snapshot publication flow.
2. Replace the checked-in version 1 snapshot only with the verified publisher output.
3. Run the full repository checks and confirm the Sites artifact boundary.
4. Create and verify an immutable Sites checkpoint.
5. Widen access only after the deployed snapshot identity and public content are confirmed.

The checked-in 2026-07-18 schema version 1 publication has completed steps 1–3. Steps 4–5 remain pending until that exact revision is deployed and the public origin passes the complete JSON comparison.

## Rollback sequence

1. Record the current live Sites version and its source commit before changing production.
2. Select the previous immutable Sites version and recover its exact reviewed snapshot from the same source commit. Do not use an untracked local export as the expected value.
3. Run the full repository checks for that source and confirm the public/private artifact boundary.
4. Obtain explicit approval for the production change. A public Sites project cannot create an owner-only deployment of an older version; deploying the saved version changes the public origin immediately.
5. Deploy the selected saved version, then run `site:verify` against its recovered reviewed snapshot.
6. If deployment or verification fails, redeploy the version recorded in step 1 and verify it against its own reviewed snapshot.
7. Record both the selected version and verification result in the Notion work log. Never delete either checkpoint or its NAS backup evidence.

On 2026-07-17, the verifier passed against the public release that preceded the checked-in 2026-07-18 snapshot. That result is historical evidence for the prior deployment, not deployment evidence for the current checked-in revision. A non-disruptive private deployment of the previous version was rejected because the project is already public, so the live rollback transition was intentionally not performed without a separate approval and maintenance window.
