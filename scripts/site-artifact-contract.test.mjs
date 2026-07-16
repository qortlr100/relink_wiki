import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertHostingManifest,
  assertPublicBoundary,
  assertRequiredArtifactPaths,
  assertWorkerModuleSource,
  assertWorkspaceDependencyBoundary,
} from "./site-artifact-contract.mjs";

const temporaryDirectories = /** @type {string[]} */ ([]);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createArtifactDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "relink-sites-artifact-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function createWorkspaceDirectory(scopes = ["apps/*", "packages/*", "tools/*"]) {
  const directory = await createArtifactDirectory();
  await writeFile(
    join(directory, "pnpm-workspace.yaml"),
    `packages:\n${scopes.map((scope) => `  - ${scope}`).join("\n")}\n`,
  );
  return directory;
}

describe("Sites artifact contract", () => {
  it("accepts the complete required artifact layout", async () => {
    const artifactDirectory = await createArtifactDirectory();
    await mkdir(join(artifactDirectory, "client", "data"), { recursive: true });
    await mkdir(join(artifactDirectory, "server"), { recursive: true });
    await mkdir(join(artifactDirectory, ".openai"), { recursive: true });
    await writeFile(join(artifactDirectory, "client", "data", "public-snapshot.v1.json"), "{}");
    await writeFile(join(artifactDirectory, "server", "index.js"), "export default { fetch() {} }");
    await writeFile(join(artifactDirectory, ".openai", "hosting.json"), "{}");

    await expect(assertRequiredArtifactPaths(artifactDirectory)).resolves.toBeUndefined();
  });

  it("rejects a missing client directory", async () => {
    const artifactDirectory = await createArtifactDirectory();

    await expect(assertRequiredArtifactPaths(artifactDirectory)).rejects.toThrow(
      "Sites artifact is missing the client directory",
    );
  });

  it("rejects private markers in emitted files", async () => {
    const artifactDirectory = await createArtifactDirectory();
    await writeFile(join(artifactDirectory, "worker.js.map"), "apps/mining-admin/private.ts");

    await expect(assertPublicBoundary(artifactDirectory)).rejects.toThrow(
      "Private marker found in Sites artifact: apps/mining-admin",
    );
  });

  it("detects private markers split across stream chunks", async () => {
    const artifactDirectory = await createArtifactDirectory();
    await writeFile(
      join(artifactDirectory, "large.bin"),
      `${"x".repeat(65_530)}apps/mining-admin/private.ts`,
    );

    await expect(assertPublicBoundary(artifactDirectory)).rejects.toThrow(
      "Private marker found in Sites artifact: apps/mining-admin",
    );
  });

  it("validates the Worker shape without executing it", async () => {
    const artifactDirectory = await createArtifactDirectory();
    const workerPath = join(artifactDirectory, "worker.js");
    await writeFile(
      workerPath,
      "throw new Error('must not execute'); const worker = { fetch() {} }; export { worker as default };",
    );

    await expect(assertWorkerModuleSource(workerPath)).resolves.toBeUndefined();
    await writeFile(
      workerPath,
      "const worker = { fetch: (request) => new Response(request.url) }; export default worker;",
    );
    await expect(assertWorkerModuleSource(workerPath)).resolves.toBeUndefined();
    await writeFile(
      workerPath,
      "const handler = (request) => new Response(request.url); export default { fetch: handler };",
    );
    await expect(assertWorkerModuleSource(workerPath)).resolves.toBeUndefined();
    await writeFile(
      workerPath,
      "const fetch = (request) => new Response(request.url); export default { fetch };",
    );
    await expect(assertWorkerModuleSource(workerPath)).resolves.toBeUndefined();
    await writeFile(
      workerPath,
      "function handler(request) { return new Response(request.url); } export default { fetch: handler };",
    );
    await expect(assertWorkerModuleSource(workerPath)).resolves.toBeUndefined();
    await writeFile(
      workerPath,
      "const unrelated = { fetch() {} }; const worker = {}; export { worker as default };",
    );
    await expect(assertWorkerModuleSource(workerPath)).rejects.toThrow("statically export");
    await writeFile(workerPath, "export const worker = { fetch() {} };");
    await expect(assertWorkerModuleSource(workerPath)).rejects.toThrow("statically export");
  });

  it("rejects indirect private workspace dependencies", async () => {
    const repositoryRoot = await createWorkspaceDirectory();
    const workspaceManifests = /** @type {Array<[string, Record<string, unknown>]>} */ ([
      [
        "apps/wiki",
        { name: "@relink-wiki/wiki", dependencies: { "@relink-wiki/domain": "workspace:*" } },
      ],
      [
        "packages/domain",
        { name: "@relink-wiki/domain", dependencies: { "@relink-wiki/database": "workspace:*" } },
      ],
      ["packages/database", { name: "@relink-wiki/database" }],
    ]);
    for (const [path, manifest] of workspaceManifests) {
      await mkdir(join(repositoryRoot, path), { recursive: true });
      await writeFile(join(repositoryRoot, path, "package.json"), JSON.stringify(manifest));
    }

    await expect(assertWorkspaceDependencyBoundary(repositoryRoot)).rejects.toThrow(
      "@relink-wiki/wiki -> @relink-wiki/domain -> @relink-wiki/database",
    );
  });

  it("rejects relative source imports that escape the public wiki", async () => {
    const repositoryRoot = await createWorkspaceDirectory();
    await mkdir(join(repositoryRoot, "apps", "wiki", "src"), { recursive: true });
    await mkdir(join(repositoryRoot, "packages", "database"), { recursive: true });
    await writeFile(
      join(repositoryRoot, "apps", "wiki", "package.json"),
      JSON.stringify({ name: "@relink-wiki/wiki" }),
    );
    await writeFile(
      join(repositoryRoot, "packages", "database", "package.json"),
      JSON.stringify({ name: "@relink-wiki/database" }),
    );
    await writeFile(
      join(repositoryRoot, "apps", "wiki", "src", "page.ts"),
      'import { database } from "../../../packages/database/src/client";',
    );

    await expect(assertWorkspaceDependencyBoundary(repositoryRoot)).rejects.toThrow(
      "Public workspace source import escapes package boundary",
    );
  });

  it("rejects relative source imports from transitive public packages", async () => {
    const repositoryRoot = await createWorkspaceDirectory();
    await mkdir(join(repositoryRoot, "apps", "wiki"), { recursive: true });
    await mkdir(join(repositoryRoot, "packages", "domain", "src"), { recursive: true });
    await mkdir(join(repositoryRoot, "packages", "database"), { recursive: true });
    await writeFile(
      join(repositoryRoot, "apps", "wiki", "package.json"),
      JSON.stringify({
        name: "@relink-wiki/wiki",
        dependencies: { "@relink-wiki/domain": "workspace:*" },
      }),
    );
    await writeFile(
      join(repositoryRoot, "packages", "domain", "package.json"),
      JSON.stringify({ name: "@relink-wiki/domain" }),
    );
    await writeFile(
      join(repositoryRoot, "packages", "database", "package.json"),
      JSON.stringify({ name: "@relink-wiki/database" }),
    );
    await writeFile(
      join(repositoryRoot, "packages", "domain", "src", "schema.ts"),
      'import { database } from "../../database/src/client";',
    );

    await expect(assertWorkspaceDependencyBoundary(repositoryRoot)).rejects.toThrow(
      "source import escapes",
    );
  });

  it("rejects template-literal dynamic imports that escape a public package", async () => {
    const repositoryRoot = await createWorkspaceDirectory();
    await mkdir(join(repositoryRoot, "apps", "wiki", "src"), { recursive: true });
    await writeFile(
      join(repositoryRoot, "apps", "wiki", "package.json"),
      JSON.stringify({ name: "@relink-wiki/wiki" }),
    );
    await writeFile(
      join(repositoryRoot, "apps", "wiki", "src", "page.ts"),
      "void import(`../../../packages/database/src/client`);",
    );

    await expect(assertWorkspaceDependencyBoundary(repositoryRoot)).rejects.toThrow(
      "source import escapes",
    );
  });

  it("rejects interpolated dynamic imports that escape a public package", async () => {
    const repositoryRoot = await createWorkspaceDirectory();
    await mkdir(join(repositoryRoot, "apps", "wiki", "src"), { recursive: true });
    await writeFile(
      join(repositoryRoot, "apps", "wiki", "package.json"),
      JSON.stringify({ name: "@relink-wiki/wiki" }),
    );
    await writeFile(
      join(repositoryRoot, "apps", "wiki", "src", "page.ts"),
      "const moduleName = 'client'; void import(`../../../packages/database/${moduleName}`);",
    );

    await expect(assertWorkspaceDependencyBoundary(repositoryRoot)).rejects.toThrow(
      "source import escapes",
    );
  });

  it("rejects undeclared bare workspace imports", async () => {
    const repositoryRoot = await createWorkspaceDirectory();
    await mkdir(join(repositoryRoot, "apps", "wiki", "src"), { recursive: true });
    await mkdir(join(repositoryRoot, "apps", "mining-admin"), { recursive: true });
    await writeFile(
      join(repositoryRoot, "apps", "wiki", "package.json"),
      JSON.stringify({ name: "@relink-wiki/wiki" }),
    );
    await writeFile(
      join(repositoryRoot, "apps", "mining-admin", "package.json"),
      JSON.stringify({ name: "@relink-wiki/mining-admin" }),
    );
    await writeFile(
      join(repositoryRoot, "apps", "wiki", "src", "page.ts"),
      'import { database } from "@relink-wiki/mining-admin/db";',
    );

    await expect(assertWorkspaceDependencyBoundary(repositoryRoot)).rejects.toThrow(
      "imports undeclared workspace dependency",
    );
  });

  it("derives package scopes from pnpm-workspace.yaml", async () => {
    const repositoryRoot = await createWorkspaceDirectory(["services/*"]);
    await mkdir(join(repositoryRoot, "services", "wiki"), { recursive: true });
    await writeFile(
      join(repositoryRoot, "services", "wiki", "package.json"),
      JSON.stringify({ name: "@relink-wiki/wiki" }),
    );

    await expect(assertWorkspaceDependencyBoundary(repositoryRoot)).resolves.toEqual([]);
  });

  it("derives artifact markers from non-public workspace packages", async () => {
    const repositoryRoot = await createWorkspaceDirectory();
    await mkdir(join(repositoryRoot, "apps", "wiki"), { recursive: true });
    await mkdir(join(repositoryRoot, "tools", "extractor"), { recursive: true });
    await writeFile(
      join(repositoryRoot, "apps", "wiki", "package.json"),
      JSON.stringify({ name: "@relink-wiki/wiki" }),
    );
    await writeFile(
      join(repositoryRoot, "tools", "extractor", "package.json"),
      JSON.stringify({ name: "@relink-wiki/extractor" }),
    );
    const markers = await assertWorkspaceDependencyBoundary(repositoryRoot);
    const artifactDirectory = await createArtifactDirectory();
    await writeFile(join(artifactDirectory, "worker.js.map"), "tools/extractor/src/private.ts");

    await expect(assertPublicBoundary(artifactDirectory, markers)).rejects.toThrow(
      "Private marker found in Sites artifact: tools/extractor",
    );
  });

  it.skipIf(globalThis.process.platform === "win32")("rejects symbolic links", async () => {
    const artifactDirectory = await createArtifactDirectory();
    const targetPath = join(artifactDirectory, "target.txt");
    await writeFile(targetPath, "public");
    await symlink(targetPath, join(artifactDirectory, "linked.txt"));

    await expect(assertPublicBoundary(artifactDirectory)).rejects.toThrow(
      "Symbolic links are not allowed in the Sites artifact",
    );
  });

  it("accepts only the disabled-resource hosting manifest", () => {
    expect(() => {
      assertHostingManifest({ d1: null, project_id: "appgprj_example", r2: null });
    }).not.toThrow();
    expect(() => {
      assertHostingManifest({ d1: null, project_id: "appgprj_example", r2: null, secret: "x" });
    }).toThrow("unsupported key");
    expect(() => {
      assertHostingManifest({ d1: "database", project_id: "appgprj_example", r2: null });
    }).toThrow("must keep d1 and r2 disabled");
  });
});
