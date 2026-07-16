import { cp, mkdir, readFile, rename, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  assertHostingManifest,
  assertPublicBoundary,
  assertRequiredArtifactPaths,
  assertWorkerModuleSource,
  assertWorkspaceDependencyBoundary,
} from "./site-artifact-contract.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceDirectory = new URL("../apps/wiki/dist/", import.meta.url);
const targetDirectory = new URL("../dist/", import.meta.url);
const stagingRoot = new URL("../.sites-runtime/", import.meta.url);
const stagingDirectory = new URL("artifact-staging/", stagingRoot);
const workerUrl = new URL("server/index.js", stagingDirectory);
const hostingUrl = new URL(".openai/hosting.json", stagingDirectory);

const privateWorkspaceMarkers = await assertWorkspaceDependencyBoundary(repositoryRoot);
await mkdir(stagingRoot, { recursive: true });
await rm(stagingDirectory, { recursive: true, force: true });
try {
  await cp(sourceDirectory, stagingDirectory, { recursive: true });
  await assertRequiredArtifactPaths(fileURLToPath(stagingDirectory));
  assertHostingManifest(JSON.parse(await readFile(hostingUrl, "utf8")));
  await assertPublicBoundary(fileURLToPath(stagingDirectory), privateWorkspaceMarkers);
  await assertWorkerModuleSource(fileURLToPath(workerUrl));
  await rm(targetDirectory, { recursive: true, force: true });
  await rename(stagingDirectory, targetDirectory);
} catch (error) {
  await Promise.all([
    rm(stagingDirectory, { recursive: true, force: true }),
    rm(targetDirectory, { recursive: true, force: true }),
  ]);
  throw error;
}

globalThis.console.log("Validated Sites artifact and public/private deployment boundary.");
