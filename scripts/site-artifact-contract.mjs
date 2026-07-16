import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const privateMarkers = [
  "RELINK_DATABASE_PATH",
  "better-sqlite3",
  "apps/mining-admin",
  "review-dashboard-repository",
];
const hostingManifestKeys = new Set(["d1", "project_id", "r2"]);

/** @param {unknown} value */
export function assertHostingManifest(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Sites artifact hosting.json must be an object");
  }

  const manifest = /** @type {Record<string, unknown>} */ (value);
  const unexpectedKey = Object.keys(manifest).find((key) => !hostingManifestKeys.has(key));
  if (unexpectedKey) {
    throw new Error(`Sites artifact hosting.json contains unsupported key: ${unexpectedKey}`);
  }
  if (typeof manifest.project_id !== "string" || manifest.project_id.trim().length === 0) {
    throw new Error("Sites artifact hosting.json is missing project_id");
  }
  if (!("d1" in manifest) || manifest.d1 !== null || !("r2" in manifest) || manifest.r2 !== null) {
    throw new Error("Sites artifact hosting.json must keep d1 and r2 disabled");
  }
}

/** @param {string} artifactDirectory */
export async function assertRequiredArtifactPaths(artifactDirectory) {
  const clientDirectory = join(artifactDirectory, "client");
  const snapshotPath = join(clientDirectory, "data", "public-snapshot.v1.json");

  await assertPathType(
    clientDirectory,
    (entry) => entry.isDirectory(),
    "Sites artifact is missing the client directory",
  );
  await assertPathType(
    snapshotPath,
    (entry) => entry.isFile(),
    "Sites artifact is missing the public snapshot",
  );
}

/**
 * @param {string} path
 * @param {(entry: import("node:fs").Stats) => boolean} predicate
 * @param {string} message
 */
async function assertPathType(path, predicate, message) {
  let entry;
  try {
    entry = await stat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(message, { cause: error });
    }
    throw error;
  }
  if (!predicate(entry)) {
    throw new Error(message);
  }
}

/** @param {string} directoryPath */
export async function assertPublicBoundary(directoryPath) {
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    const entryPath = join(directoryPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in the Sites artifact: ${entry.name}`);
    }

    if (entry.isDirectory()) {
      await assertPublicBoundary(entryPath);
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported entry in the Sites artifact: ${entry.name}`);
    }

    const content = await readFile(entryPath);
    const marker = privateMarkers.find((candidate) => content.includes(candidate));
    if (marker) {
      throw new Error(`Private marker found in Sites artifact: ${marker}`);
    }
  }
}
