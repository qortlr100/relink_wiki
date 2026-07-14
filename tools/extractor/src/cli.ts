#!/usr/bin/env node
import { readExtractorConfig } from "./config";
import { inspectExtractorEnvironment } from "./preflight";

try {
  const config = readExtractorConfig(process.env);
  const preflight = inspectExtractorEnvironment(config);

  if (!preflight.ok) {
    console.error(
      JSON.stringify({
        code: "EXTRACTOR_PREFLIGHT_FAILED",
        message: "추출기 실행 전 점검에 실패했습니다.",
        issues: preflight.issues,
      }),
    );
    process.exitCode = 1;
  } else {
    console.log(
      JSON.stringify({
        code: "EXTRACTOR_PREFLIGHT_VALID",
        message: "추출기 실행 전 점검을 통과했습니다.",
        extractorVersion: config.version,
        gameVersion: config.gameVersion,
      }),
    );
  }
} catch {
  console.error(
    JSON.stringify({ code: "EXTRACTOR_CONFIG_INVALID", message: "추출기 환경 변수를 확인하세요." }),
  );
  process.exitCode = 1;
}
