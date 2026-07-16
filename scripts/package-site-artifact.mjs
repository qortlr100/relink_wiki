import { cp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  assertHostingManifest,
  assertPublicBoundary,
  assertRequiredArtifactPaths,
} from "./site-artifact-contract.mjs";

const sourceDirectory = new URL("../apps/wiki/dist/", import.meta.url);
const targetDirectory = new URL("../dist/", import.meta.url);
const workerUrl = new URL("server/index.js", targetDirectory);
const hostingUrl = new URL(".openai/hosting.json", targetDirectory);

await rm(targetDirectory, { recursive: true, force: true });
await cp(sourceDirectory, targetDirectory, { recursive: true });

await assertRequiredArtifactPaths(fileURLToPath(targetDirectory));
assertHostingManifest(JSON.parse(await readFile(hostingUrl, "utf8")));
await assertPublicBoundary(fileURLToPath(targetDirectory));

const workerImportUrl = new URL(workerUrl.href);
workerImportUrl.searchParams.set(
  "sites-validation",
  `${String(globalThis.process.pid)}-${String(Date.now())}`,
);
const worker = /** @type {unknown} */ (await import(workerImportUrl.href));

if (!isWorkerModule(worker)) {
  throw new Error("Sites artifact must export default.fetch from dist/server/index.js");
}

/**
 * @param {unknown} value
 * @returns {value is { default: { fetch: (...arguments_: unknown[]) => unknown } }}
 */
function isWorkerModule(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "default" in value &&
    typeof value.default === "object" &&
    value.default !== null &&
    "fetch" in value.default &&
    typeof value.default.fetch === "function"
  );
}

globalThis.console.log("Validated Sites artifact and public/private deployment boundary.");
