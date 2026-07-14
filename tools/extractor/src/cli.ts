#!/usr/bin/env node
import { readExtractorConfig } from "./config";
import { DatabaseMigrationError } from "@relink-wiki/database";
import {
  CandidateImportError,
  importCandidateDatabase,
  readCandidateImportConfig,
} from "./import-candidate";
import { inspectExtractorEnvironment } from "./preflight";

try {
  const command = process.argv[2] ?? "preflight";

  if (command === "import-candidate") {
    const result = importCandidateDatabase(readCandidateImportConfig(process.env));
    console.log(
      JSON.stringify({
        code: result.reused ? "CANDIDATE_IMPORT_REUSED" : "CANDIDATE_IMPORT_COMPLETED",
        message: result.reused
          ? "동일한 후보 데이터를 이미 가져와 기존 실행을 재사용했습니다."
          : "후보 데이터를 비공개 스테이징으로 가져왔습니다.",
        ...result,
      }),
    );
  } else if (command !== "preflight") {
    console.error(
      JSON.stringify({ code: "EXTRACTOR_COMMAND_INVALID", message: "지원하지 않는 명령입니다." }),
    );
    process.exitCode = 1;
  } else {
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
  }
} catch (error) {
  if (error instanceof CandidateImportError) {
    console.error(JSON.stringify({ code: error.code, message: error.message }));
    process.exitCode = 1;
  } else if (error instanceof DatabaseMigrationError) {
    console.error(JSON.stringify({ code: error.code, message: error.message }));
    process.exitCode = 1;
  } else {
    console.error(
      JSON.stringify({
        code: "EXTRACTOR_CONFIG_INVALID",
        message: "추출기 환경 변수를 확인하세요.",
      }),
    );
    process.exitCode = 1;
  }
}
