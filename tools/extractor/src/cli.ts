#!/usr/bin/env node
import { readExtractorConfig } from "./config";
import { importCandidateDatabase, readCandidateImportConfig } from "./import-candidate";
import { classifyCliFailure, readCliConfig } from "./cli-errors";
import { generateMappingCandidate, readMappingCandidateConfig } from "./generate-mapping-candidate";
import { normalizeMappedDatabase, readMappedNormalizationConfig } from "./normalize-mapped";
import { inspectExtractorEnvironment } from "./preflight";
import {
  readLocalizationValidationConfig,
  validateLocalizationJoins,
} from "./validate-localization";

try {
  const command = process.argv[2] ?? "preflight";

  if (command === "generate-mapping-candidate") {
    const result = generateMappingCandidate(
      readCliConfig(() => readMappingCandidateConfig(process.env)),
    );
    console.log(
      JSON.stringify({
        code: "MAPPING_CANDIDATE_GENERATED",
        message: "검수용 비공개 정규화 mapping 후보를 생성했습니다.",
        ...result,
      }),
    );
  } else if (command === "import-candidate") {
    const result = importCandidateDatabase(
      readCliConfig(() => readCandidateImportConfig(process.env)),
    );
    console.log(
      JSON.stringify({
        code: result.reused ? "CANDIDATE_IMPORT_REUSED" : "CANDIDATE_IMPORT_COMPLETED",
        message: result.reused
          ? "동일한 후보 데이터를 이미 가져와 기존 실행을 재사용했습니다."
          : "후보 데이터를 비공개 스테이징으로 가져왔습니다.",
        ...result,
      }),
    );
  } else if (command === "normalize-mapped") {
    const result = normalizeMappedDatabase(
      readCliConfig(() => readMappedNormalizationConfig(process.env)),
    );
    console.log(
      JSON.stringify({
        code: result.reused ? "NORMALIZATION_REUSED" : "NORMALIZATION_COMPLETED",
        message: result.reused
          ? "동일한 정규화 입력을 이미 처리해 기존 실행을 재사용했습니다."
          : "명시적 매핑을 비공개 정규화 레코드로 저장했습니다.",
        ...result,
      }),
    );
  } else if (command === "validate-localization") {
    const result = validateLocalizationJoins(
      readCliConfig(() => readLocalizationValidationConfig(process.env)),
    );
    console.log(
      JSON.stringify({
        code: "LOCALIZATION_JOIN_VALIDATED",
        message: "한국어 메시지 조인 범위를 검증했습니다.",
        ...result,
      }),
    );
  } else if (command !== "preflight") {
    console.error(
      JSON.stringify({ code: "EXTRACTOR_COMMAND_INVALID", message: "지원하지 않는 명령입니다." }),
    );
    process.exitCode = 1;
  } else {
    const config = readCliConfig(() => readExtractorConfig(process.env));
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
  console.error(JSON.stringify(classifyCliFailure(error)));
  process.exitCode = 1;
}
