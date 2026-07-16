import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertHostingManifest,
  assertPublicBoundary,
  assertRequiredArtifactPaths,
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

describe("Sites artifact contract", () => {
  it("accepts the required client directory and public snapshot", async () => {
    const artifactDirectory = await createArtifactDirectory();
    await mkdir(join(artifactDirectory, "client", "data"), { recursive: true });
    await writeFile(join(artifactDirectory, "client", "data", "public-snapshot.v1.json"), "{}");

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
