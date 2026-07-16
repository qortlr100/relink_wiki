import { createReadStream } from "node:fs";
import { Buffer } from "node:buffer";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import typescript from "typescript";

const privateMarkers = [
  "RELINK_DATABASE_PATH",
  "better-sqlite3",
  "apps/mining-admin",
  "review-dashboard-repository",
];
const hostingManifestKeys = new Set(["d1", "project_id", "r2"]);
const privateWorkspacePackages = new Set([
  "@relink-wiki/database",
  "@relink-wiki/extractor",
  "@relink-wiki/mining-admin",
  "@relink-wiki/publisher",
]);
const workspaceScopes = ["apps", "packages", "tools"];
const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const parseJson = /** @type {(source: string) => unknown} */ (JSON.parse);

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
  const workerPath = join(artifactDirectory, "server", "index.js");
  const hostingManifestPath = join(artifactDirectory, ".openai", "hosting.json");

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
  await assertPathType(
    workerPath,
    (entry) => entry.isFile(),
    "Sites artifact is missing the Worker entrypoint",
  );
  await assertPathType(
    hostingManifestPath,
    (entry) => entry.isFile(),
    "Sites artifact is missing the hosting manifest",
  );
}

/** @param {string} workerPath */
export async function assertWorkerModuleSource(workerPath) {
  const source = await readFile(workerPath, "utf8");
  const sourceFile = typescript.createSourceFile(
    workerPath,
    source,
    typescript.ScriptTarget.Latest,
    true,
    typescript.ScriptKind.JS,
  );
  const variables = /** @type {Map<string, import("typescript").Expression>} */ (new Map());

  for (const statement of sourceFile.statements) {
    if (!typescript.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (typescript.isIdentifier(declaration.name) && declaration.initializer) {
        variables.set(declaration.name.text, declaration.initializer);
      }
    }
  }

  const defaultExport = findDefaultExport(sourceFile, variables);
  if (!defaultExport || !isWorkerObject(defaultExport, variables, new Set())) {
    throw new Error("Sites artifact must statically export a default Worker with a fetch handler");
  }
}

/**
 * @param {import("typescript").SourceFile} sourceFile
 * @param {Map<string, import("typescript").Expression>} variables
 */
function findDefaultExport(sourceFile, variables) {
  for (const statement of sourceFile.statements) {
    if (typescript.isExportAssignment(statement) && !statement.isExportEquals) {
      return statement.expression;
    }
    if (!typescript.isExportDeclaration(statement) || !statement.exportClause) continue;
    if (!typescript.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) {
      if (element.name.text !== "default") continue;
      const localName = element.propertyName?.text ?? element.name.text;
      return variables.get(localName);
    }
  }
  return undefined;
}

/**
 * @param {import("typescript").Expression} expression
 * @param {Map<string, import("typescript").Expression>} variables
 * @param {Set<string>} visited
 */
function isWorkerObject(expression, variables, visited) {
  if (typescript.isParenthesizedExpression(expression)) {
    return isWorkerObject(expression.expression, variables, visited);
  }
  if (typescript.isIdentifier(expression)) {
    if (visited.has(expression.text)) return false;
    const initializer = variables.get(expression.text);
    if (!initializer) return false;
    visited.add(expression.text);
    return isWorkerObject(initializer, variables, visited);
  }
  if (!typescript.isObjectLiteralExpression(expression)) return false;

  return expression.properties.some((property) => {
    const name = getPropertyName(property.name);
    if (name !== "fetch") return false;
    if (typescript.isMethodDeclaration(property)) return true;
    if (!typescript.isPropertyAssignment(property)) return false;
    return (
      typescript.isArrowFunction(property.initializer) ||
      typescript.isFunctionExpression(property.initializer)
    );
  });
}

/** @param {import("typescript").PropertyName | undefined} name */
function getPropertyName(name) {
  if (!name) return undefined;
  if (typescript.isIdentifier(name) || typescript.isStringLiteral(name)) return name.text;
  return undefined;
}

/**
 * Ensure the public wiki's complete workspace dependency graph cannot reach private packages.
 * @param {string} repositoryRoot
 * @param {string} [entryPackageName]
 */
export async function assertWorkspaceDependencyBoundary(
  repositoryRoot,
  entryPackageName = "@relink-wiki/wiki",
) {
  const manifests = /** @type {Map<string, Record<string, unknown>>} */ (new Map());

  for (const scope of workspaceScopes) {
    const scopePath = join(repositoryRoot, scope);
    let entries;
    try {
      entries = await readdir(scopePath, { withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(scopePath, entry.name, "package.json");
      try {
        const value = parseJson(await readFile(manifestPath, "utf8"));
        if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
        const manifest = /** @type {Record<string, unknown>} */ (value);
        if (typeof manifest.name === "string") manifests.set(manifest.name, manifest);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
        throw error;
      }
    }
  }

  if (!manifests.has(entryPackageName)) {
    throw new Error(`Workspace package not found: ${entryPackageName}`);
  }

  const pending = /** @type {Array<[string, string[]]>} */ ([
    [entryPackageName, [entryPackageName]],
  ]);
  const visited = /** @type {Set<string>} */ (new Set());
  while (pending.length > 0) {
    const next = pending.shift();
    if (!next) break;
    const [packageName, dependencyPath] = next;
    if (visited.has(packageName)) continue;
    visited.add(packageName);

    if (privateWorkspacePackages.has(packageName)) {
      throw new Error(
        `Private workspace dependency is reachable from the public wiki: ${dependencyPath.join(" -> ")}`,
      );
    }

    const manifest = manifests.get(packageName);
    for (const section of dependencySections) {
      const dependencies = manifest?.[section];
      if (typeof dependencies !== "object" || dependencies === null) continue;
      for (const dependencyName of Object.keys(
        /** @type {Record<string, unknown>} */ (dependencies),
      )) {
        if (manifests.has(dependencyName))
          pending.push([dependencyName, [...dependencyPath, dependencyName]]);
      }
    }
  }
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

    const marker = await findPrivateMarker(entryPath);
    if (marker) {
      throw new Error(`Private marker found in Sites artifact: ${marker}`);
    }
  }
}

/** @param {string} path */
async function findPrivateMarker(path) {
  const markerBuffers = privateMarkers.map((marker) => Buffer.from(marker));
  const overlapLength = Math.max(...markerBuffers.map((marker) => marker.length)) - 1;
  let tail = Buffer.alloc(0);

  for await (const chunk of createReadStream(path)) {
    const window = Buffer.concat([tail, chunk]);
    const markerIndex = markerBuffers.findIndex((marker) => window.includes(marker));
    if (markerIndex !== -1) return privateMarkers[markerIndex];
    tail = window.subarray(Math.max(0, window.length - overlapLength));
  }

  return undefined;
}
