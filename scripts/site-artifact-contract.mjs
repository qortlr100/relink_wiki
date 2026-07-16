import { createReadStream } from "node:fs";
import { Buffer } from "node:buffer";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import typescript from "typescript";

const privateMarkers = [
  "RELINK_DATABASE_PATH",
  "better-sqlite3",
  "apps/mining-admin",
  "review-dashboard-repository",
];
const hostingManifestKeys = new Set(["d1", "project_id", "r2"]);
const publicWorkspacePackages = new Set(["@relink-wiki/wiki", "@relink-wiki/domain"]);
const ignoredSourceDirectories = new Set([
  ".vinext",
  ".wrangler",
  ".sites-runtime",
  "dist",
  "node_modules",
]);
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
    if (typescript.isShorthandPropertyAssignment(property)) {
      const initializer = variables.get(property.name.text);
      return initializer ? isFunctionValue(initializer, variables, new Set()) : false;
    }
    if (!typescript.isPropertyAssignment(property)) return false;
    return isFunctionValue(property.initializer, variables, new Set());
  });
}

/**
 * @param {import("typescript").Expression} expression
 * @param {Map<string, import("typescript").Expression>} variables
 * @param {Set<string>} visited
 */
function isFunctionValue(expression, variables, visited) {
  if (typescript.isArrowFunction(expression) || typescript.isFunctionExpression(expression)) {
    return true;
  }
  if (typescript.isParenthesizedExpression(expression)) {
    return isFunctionValue(expression.expression, variables, visited);
  }
  if (!typescript.isIdentifier(expression) || visited.has(expression.text)) return false;
  const initializer = variables.get(expression.text);
  if (!initializer) return false;
  visited.add(expression.text);
  return isFunctionValue(initializer, variables, visited);
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
 * @returns {Promise<string[]>} markers derived from non-public workspace packages
 */
export async function assertWorkspaceDependencyBoundary(
  repositoryRoot,
  entryPackageName = "@relink-wiki/wiki",
) {
  const manifests = /** @type {Map<string, Record<string, unknown>>} */ (new Map());
  const manifestDirectories = /** @type {Map<string, string>} */ (new Map());
  const workspaceScopes = await readWorkspaceScopes(repositoryRoot);

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
        if (typeof manifest.name === "string") {
          manifests.set(manifest.name, manifest);
          manifestDirectories.set(manifest.name, join(scopePath, entry.name));
        }
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

    if (!publicWorkspacePackages.has(packageName)) {
      throw new Error(
        `Non-public workspace dependency is reachable from the public wiki: ${dependencyPath.join(" -> ")}`,
      );
    }
    const packageDirectory = manifestDirectories.get(packageName);
    if (!packageDirectory) throw new Error(`Workspace package directory not found: ${packageName}`);
    await assertRelativeSourceBoundary(packageDirectory);

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

  return [...manifests.keys()]
    .filter((packageName) => !publicWorkspacePackages.has(packageName))
    .flatMap((packageName) => {
      const packageDirectory = manifestDirectories.get(packageName);
      const packagePath = packageDirectory
        ? relative(repositoryRoot, packageDirectory).split("\\").join("/")
        : undefined;
      return packagePath ? [packageName, packagePath] : [packageName];
    });
}

/** @param {string} repositoryRoot */
async function readWorkspaceScopes(repositoryRoot) {
  const workspacePath = join(repositoryRoot, "pnpm-workspace.yaml");
  const source = await readFile(workspacePath, "utf8");
  const lines = source.split(/\r?\n/u);
  const packagesLine = lines.findIndex((line) => /^packages:\s*(?:#.*)?$/u.test(line));
  if (packagesLine === -1) throw new Error("pnpm-workspace.yaml is missing packages");

  const scopes = [];
  for (const line of lines.slice(packagesLine + 1)) {
    if (/^\S[^:]*:/u.test(line)) break;
    if (/^\s*(?:#.*)?$/u.test(line)) continue;
    const item = /^\s+-\s+(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*(?:#.*)?$/u.exec(line);
    if (!item) throw new Error(`Unsupported pnpm workspace package entry: ${line.trim()}`);
    const pattern = item[1] ?? item[2] ?? item[3];
    const scope = pattern ? /^([^/*]+)\/\*$/u.exec(pattern)?.[1] : undefined;
    if (!scope) throw new Error(`Unsupported pnpm workspace package pattern: ${String(pattern)}`);
    scopes.push(scope);
  }
  if (scopes.length === 0) throw new Error("pnpm-workspace.yaml has no package scopes");
  return scopes;
}

/**
 * @param {string} packageDirectory
 * @param {string} [currentDirectory]
 */
async function assertRelativeSourceBoundary(packageDirectory, currentDirectory = packageDirectory) {
  for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
    if (ignoredSourceDirectories.has(entry.name)) continue;
    const entryPath = join(currentDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in the public wiki source: ${entryPath}`);
    }
    if (entry.isDirectory()) {
      await assertRelativeSourceBoundary(packageDirectory, entryPath);
      continue;
    }
    if (!entry.isFile() || !/\.(?:[cm]?[jt]sx?)$/u.test(entry.name)) continue;

    const source = await readFile(entryPath, "utf8");
    const sourceFile = typescript.createSourceFile(
      entryPath,
      source,
      typescript.ScriptTarget.Latest,
      true,
      entry.name.endsWith("x") ? typescript.ScriptKind.TSX : typescript.ScriptKind.TS,
    );
    /** @param {import("typescript").Node} node */
    const inspectNode = (node) => {
      const specifier = getModuleSpecifier(node);
      if (specifier?.startsWith(".")) {
        const targetPath = resolve(dirname(entryPath), specifier);
        const pathFromPackage = relative(packageDirectory, targetPath);
        if (pathFromPackage.startsWith("..") || isAbsolute(pathFromPackage)) {
          throw new Error(
            `Public workspace source import escapes package boundary: ${entryPath} -> ${specifier}`,
          );
        }
      }
      typescript.forEachChild(node, inspectNode);
    };
    inspectNode(sourceFile);
  }
}

/** @param {import("typescript").Node} node */
function getModuleSpecifier(node) {
  if (
    (typescript.isImportDeclaration(node) || typescript.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    typescript.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  if (!typescript.isCallExpression(node) || node.arguments.length !== 1) return undefined;
  const argument = node.arguments[0];
  if (
    argument &&
    (typescript.isStringLiteral(argument) ||
      typescript.isNoSubstitutionTemplateLiteral(argument)) &&
    (node.expression.kind === typescript.SyntaxKind.ImportKeyword ||
      (typescript.isIdentifier(node.expression) && node.expression.text === "require"))
  ) {
    return argument.text;
  }
  return undefined;
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

/**
 * @param {string} directoryPath
 * @param {string[]} [additionalMarkers]
 */
export async function assertPublicBoundary(directoryPath, additionalMarkers = []) {
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    const entryPath = join(directoryPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in the Sites artifact: ${entry.name}`);
    }

    if (entry.isDirectory()) {
      await assertPublicBoundary(entryPath, additionalMarkers);
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported entry in the Sites artifact: ${entry.name}`);
    }

    const marker = await findPrivateMarker(entryPath, additionalMarkers);
    if (marker) {
      throw new Error(`Private marker found in Sites artifact: ${marker}`);
    }
  }
}

/**
 * @param {string} path
 * @param {string[]} additionalMarkers
 */
async function findPrivateMarker(path, additionalMarkers) {
  const markers = [...new Set([...privateMarkers, ...additionalMarkers])];
  const markerBuffers = markers.map((marker) => Buffer.from(marker));
  const overlapLength = Math.max(...markerBuffers.map((marker) => marker.length)) - 1;
  let tail = Buffer.alloc(0);

  for await (const chunk of createReadStream(path)) {
    const window = Buffer.concat([tail, chunk]);
    const markerIndex = markerBuffers.findIndex((marker) => window.includes(marker));
    if (markerIndex !== -1) return markers[markerIndex];
    tail = window.subarray(Math.max(0, window.length - overlapLength));
  }

  return undefined;
}
