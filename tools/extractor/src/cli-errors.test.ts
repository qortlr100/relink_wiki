import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CandidateImportError } from "./import-candidate";
import { classifyCliFailure, readCliConfig } from "./cli-errors";
import { NormalizationMappingError } from "./normalize-mapped";
import { LocalizationValidationError } from "./validate-localization";
import { RelationshipValidationError } from "./validate-relationships";
import { ProtagonistMappingRevisionError } from "./revise-protagonist-mapping";

describe("classifyCliFailure", () => {
  it("keeps configuration validation separate from runtime failures", () => {
    let configError: unknown;
    try {
      readCliConfig(() => z.object({ path: z.string().min(1) }).parse({}));
    } catch (error) {
      configError = error;
    }

    expect(classifyCliFailure(configError)).toEqual({
      code: "EXTRACTOR_CONFIG_INVALID",
      message: "추출기 환경 변수를 확인하세요.",
    });
    expect(classifyCliFailure(new Error("private runtime detail"))).toEqual({
      code: "EXTRACTOR_UNEXPECTED_ERROR",
      message: "예상하지 못한 오류로 작업을 완료하지 못했습니다.",
    });
  });

  it("reports database lock contention without exposing raw details", () => {
    expect(classifyCliFailure({ code: "SQLITE_BUSY", message: "private database path" })).toEqual({
      code: "DATABASE_BUSY",
      message: "다른 데이터베이스 작업이 끝난 뒤 다시 시도하세요.",
    });
  });

  it("preserves stable candidate import errors", () => {
    expect(
      classifyCliFailure(
        new CandidateImportError("CANDIDATE_TABLE_INVALID", "후보 테이블 구조 오류"),
      ),
    ).toEqual({ code: "CANDIDATE_TABLE_INVALID", message: "후보 테이블 구조 오류" });
  });

  it("preserves stable normalization mapping errors", () => {
    expect(classifyCliFailure(new NormalizationMappingError())).toEqual({
      code: "NORMALIZATION_MAPPING_INVALID",
      message: "정규화 매핑 파일을 읽거나 검증할 수 없습니다.",
    });
  });

  it("preserves stable localization validation errors", () => {
    expect(
      classifyCliFailure(
        new LocalizationValidationError("LOCALIZATION_MESSAGE_INVALID", "한국어 메시지 구조 오류"),
      ),
    ).toEqual({
      code: "LOCALIZATION_MESSAGE_INVALID",
      message: "한국어 메시지 구조 오류",
    });
  });

  it("preserves stable relationship validation errors", () => {
    expect(
      classifyCliFailure(
        new RelationshipValidationError("RELATIONSHIP_MAPPING_INVALID", "관계 mapping 구조 오류"),
      ),
    ).toEqual({
      code: "RELATIONSHIP_MAPPING_INVALID",
      message: "관계 mapping 구조 오류",
    });
  });

  it("preserves stable protagonist mapping revision errors", () => {
    expect(
      classifyCliFailure(
        new ProtagonistMappingRevisionError(
          "PROTAGONIST_MAPPING_EVIDENCE_INVALID",
          "주인공 mapping 근거 오류",
        ),
      ),
    ).toEqual({
      code: "PROTAGONIST_MAPPING_EVIDENCE_INVALID",
      message: "주인공 mapping 근거 오류",
    });
  });
});
