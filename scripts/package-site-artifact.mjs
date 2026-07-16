import { cp, readFile, rm } from "node:fs/promises";
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
const workerUrl = new URL("server/index.js", targetDirectory);
const hostingUrl = new URL(".openai/hosting.json", targetDirectory);

await assertWorkspaceDependencyBoundary(repositoryRoot);
await rm(targetDirectory, { recursive: true, force: true });
await cp(sourceDirectory, targetDirectory, { recursive: true });

await assertRequiredArtifactPaths(fileURLToPath(targetDirectory));
assertHostingManifest(JSON.parse(await readFile(hostingUrl, "utf8")));
await assertPublicBoundary(fileURLToPath(targetDirectory));
await assertWorkerModuleSource(fileURLToPath(workerUrl));

globalThis.console.log("Validated Sites artifact and public/private deployment boundary.");
