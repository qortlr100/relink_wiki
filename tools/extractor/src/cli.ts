#!/usr/bin/env node
import { readExtractorConfig } from "./config";
try {
  const config = readExtractorConfig(process.env);
  console.log(
    JSON.stringify({
      code: "EXTRACTOR_CONFIG_VALID",
      message: "추출기 설정이 유효합니다.",
      extractorVersion: config.version,
    }),
  );
} catch {
  console.error(
    JSON.stringify({ code: "EXTRACTOR_CONFIG_INVALID", message: "추출기 환경 변수를 확인하세요." }),
  );
  process.exitCode = 1;
}
