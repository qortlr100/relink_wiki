import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

const snapshotPathname = "/data/public-snapshot.v1.json";
const maximumSnapshotBytes = 5 * 1024 * 1024;
const parseJson = /** @type {(source: string) => unknown} */ (JSON.parse);

export class SiteDeploymentVerificationError extends Error {
  /** @param {string} code @param {string} message @param {{ cause?: unknown }} [options] */
  constructor(code, message, options) {
    super(message, options);
    this.name = "SiteDeploymentVerificationError";
    this.code = code;
  }
}

/** @param {string} siteUrl */
export function getDeploymentSnapshotUrl(siteUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(siteUrl);
  } catch (error) {
    throw new SiteDeploymentVerificationError(
      "SITE_URL_INVALID",
      "Sites URL must be a valid absolute URL",
      { cause: error },
    );
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username.length > 0 ||
    parsedUrl.password.length > 0 ||
    parsedUrl.search.length > 0 ||
    parsedUrl.hash.length > 0 ||
    (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "")
  ) {
    throw new SiteDeploymentVerificationError(
      "SITE_URL_INVALID",
      "Sites URL must be an HTTPS origin without credentials, path, query, or fragment",
    );
  }

  return new URL(snapshotPathname, parsedUrl);
}

/**
 * @param {{ siteUrl: string, expectedSnapshotPath: string, fetchImplementation?: typeof fetch, timeoutMs?: number }} options
 */
export async function verifySiteDeployment(options) {
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const snapshotUrl = getDeploymentSnapshotUrl(options.siteUrl);
  const expectedSnapshot = await readSnapshotFile(options.expectedSnapshotPath);
  const requestController = new AbortController();

  let response;
  try {
    response = await fetchImplementation(snapshotUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.any([requestController.signal, AbortSignal.timeout(timeoutMs)]),
    });
  } catch (error) {
    throw new SiteDeploymentVerificationError(
      "SITE_SNAPSHOT_UNAVAILABLE",
      "The deployed public snapshot could not be read",
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new SiteDeploymentVerificationError(
      "SITE_SNAPSHOT_UNAVAILABLE",
      `The deployed public snapshot returned HTTP ${String(response.status)}`,
    );
  }

  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader === null ? undefined : Number(contentLengthHeader);
  if (
    contentLength !== undefined &&
    Number.isFinite(contentLength) &&
    contentLength > maximumSnapshotBytes
  ) {
    requestController.abort();
    throw new SiteDeploymentVerificationError(
      "SITE_SNAPSHOT_TOO_LARGE",
      "The deployed public snapshot exceeds the verification size limit",
    );
  }

  let deployedSource;
  try {
    deployedSource = await readLimitedResponseBody(response, requestController);
  } catch (error) {
    if (error instanceof SiteDeploymentVerificationError) throw error;
    throw new SiteDeploymentVerificationError(
      "SITE_SNAPSHOT_UNAVAILABLE",
      "The deployed public snapshot body could not be read",
      { cause: error },
    );
  }
  const deployedSnapshot = parseSnapshot(deployedSource, "SITE_SNAPSHOT_INVALID");

  if (!isDeepStrictEqual(deployedSnapshot, expectedSnapshot)) {
    throw new SiteDeploymentVerificationError(
      "SITE_SNAPSHOT_MISMATCH",
      "The deployed public snapshot does not match the expected reviewed snapshot",
    );
  }

  return summarizeSnapshot(deployedSnapshot, "SITE_SNAPSHOT_INVALID");
}

/** @param {Response} response @param {AbortController} requestController */
async function readLimitedResponseBody(response, requestController) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks = /** @type {Buffer[]} */ ([]);
  let receivedBytes = 0;

  try {
    let result = await reader.read();
    while (!result.done) {
      receivedBytes += result.value.byteLength;
      if (receivedBytes > maximumSnapshotBytes) {
        requestController.abort();
        await reader.cancel().catch(() => undefined);
        throw new SiteDeploymentVerificationError(
          "SITE_SNAPSHOT_TOO_LARGE",
          "The deployed public snapshot exceeds the verification size limit",
        );
      }
      chunks.push(Buffer.from(result.value));
      result = await reader.read();
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, receivedBytes).toString("utf8");
}

/** @param {string} snapshotFilePath @returns {Promise<unknown>} */
async function readSnapshotFile(snapshotFilePath) {
  let source;
  try {
    source = await readFile(snapshotFilePath, "utf8");
  } catch (error) {
    throw new SiteDeploymentVerificationError(
      "EXPECTED_SNAPSHOT_UNAVAILABLE",
      "The expected reviewed snapshot could not be read",
      { cause: error },
    );
  }
  return parseSnapshot(source, "EXPECTED_SNAPSHOT_INVALID");
}

/** @param {string} source @param {string} code @returns {unknown} */
function parseSnapshot(source, code) {
  try {
    const value = parseJson(source);
    summarizeSnapshot(value, code);
    return value;
  } catch (error) {
    if (error instanceof SiteDeploymentVerificationError) throw error;
    throw new SiteDeploymentVerificationError(code, "The snapshot is not valid JSON", {
      cause: error,
    });
  }
}

/** @param {unknown} value @param {string} invalidCode */
function summarizeSnapshot(value, invalidCode) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SiteDeploymentVerificationError(invalidCode, "The snapshot must be an object");
  }
  const snapshot = /** @type {Record<string, unknown>} */ (value);
  const schemaVersion = snapshot.schemaVersion;
  if (
    typeof schemaVersion !== "number" ||
    !Number.isSafeInteger(schemaVersion) ||
    schemaVersion < 1
  ) {
    throw new SiteDeploymentVerificationError(
      invalidCode,
      "The snapshot schema version is invalid",
    );
  }
  if (
    typeof snapshot.contentRevision !== "string" ||
    !/^[a-f0-9]{64}$/u.test(snapshot.contentRevision)
  ) {
    throw new SiteDeploymentVerificationError(
      invalidCode,
      "The snapshot content revision is invalid",
    );
  }

  const collections = ["characters", "weapons", "sigils", "skills"];
  const recordCounts = Object.fromEntries(
    collections.map((collection) => {
      const records = snapshot[collection];
      if (!Array.isArray(records)) {
        throw new SiteDeploymentVerificationError(
          invalidCode,
          `The snapshot collection is invalid: ${collection}`,
        );
      }
      return [collection, records.length];
    }),
  );

  return {
    code: "SITE_DEPLOYMENT_VERIFIED",
    schemaVersion,
    contentRevision: snapshot.contentRevision,
    recordCounts,
  };
}
