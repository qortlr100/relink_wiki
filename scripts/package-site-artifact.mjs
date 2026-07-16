import { cp, readFile, readdir, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const sourceDirectory = new URL("../apps/wiki/dist/", import.meta.url);
const targetDirectory = new URL("../dist/", import.meta.url);
const workerUrl = new URL("server/index.js", targetDirectory);
const hostingUrl = new URL(".openai/hosting.json", targetDirectory);
const privateMarkers = [
  "RELINK_DATABASE_PATH",
  "better-sqlite3",
  "apps/mining-admin",
  "review-dashboard-repository",
];

await rm(targetDirectory, { recursive: true, force: true });
await cp(sourceDirectory, targetDirectory, { recursive: true });

JSON.parse(await readFile(hostingUrl, "utf8"));
await assertPublicBoundary(targetDirectory);

const workerImportUrl = pathToFileURL(workerUrl.pathname);
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

/** @param {URL} directoryUrl */
async function assertPublicBoundary(directoryUrl) {
  for (const entry of await readdir(directoryUrl, { withFileTypes: true })) {
    const entryUrl = new URL(entry.name, directoryUrl);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in the Sites artifact: ${entry.name}`);
    }

    if (entry.isDirectory()) {
      await assertPublicBoundary(new URL(`${entryUrl.href}/`));
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported entry in the Sites artifact: ${entry.name}`);
    }

    const content = await readFile(entryUrl);
    const marker = privateMarkers.find((candidate) => content.includes(candidate));
    if (marker) {
      throw new Error(`Private marker found in Sites artifact: ${marker}`);
    }
  }
}

globalThis.console.log("Validated Sites artifact and public/private deployment boundary.");
