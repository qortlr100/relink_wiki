import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SiteDeploymentVerificationError,
  verifySiteDeployment,
} from "./site-deployment-verifier.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultSnapshotPath = fileURLToPath(
  new URL("../apps/wiki/public/data/public-snapshot.v1.json", import.meta.url),
);

const argumentsList = globalThis.process.argv.slice(2);
const siteUrl = argumentsList.shift();
let expectedSnapshotPath = defaultSnapshotPath;

while (argumentsList.length > 0) {
  const option = argumentsList.shift();
  if (option !== "--expected-snapshot") {
    fail(
      "SITE_VERIFY_USAGE_INVALID",
      "사용법: pnpm site:verify -- <Sites URL> [--expected-snapshot <file>]",
    );
  }
  const snapshotPathArgument = argumentsList.shift();
  if (!snapshotPathArgument) {
    fail(
      "SITE_VERIFY_USAGE_INVALID",
      "사용법: pnpm site:verify -- <Sites URL> [--expected-snapshot <file>]",
    );
  }
  expectedSnapshotPath = resolve(repositoryRoot, snapshotPathArgument);
}

if (!siteUrl) {
  fail("SITE_VERIFY_USAGE_INVALID", "Sites URL을 입력해야 합니다.");
}

try {
  const result = await verifySiteDeployment({ siteUrl, expectedSnapshotPath });
  globalThis.console.log(JSON.stringify(result));
} catch (error) {
  if (error instanceof SiteDeploymentVerificationError) {
    fail(error.code, "배포된 공개 스냅샷 검증에 실패했습니다.");
  }
  throw error;
}

/** @param {string} code @param {string} messageKo @returns {never} */
function fail(code, messageKo) {
  globalThis.console.error(JSON.stringify({ code, messageKo }));
  globalThis.process.exit(1);
}
