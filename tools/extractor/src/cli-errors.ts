import { DatabaseMigrationError, NormalizationError } from "@relink-wiki/database";
import { ZodError } from "zod";
import { CandidateImportError } from "./import-candidate";
import { MappingCandidateError } from "./generate-mapping-candidate";
import { NormalizationMappingError } from "./normalize-mapped";
import { LocalizationValidationError } from "./validate-localization";
import { RelationshipValidationError } from "./validate-relationships";
import { ProtagonistMappingRevisionError } from "./revise-protagonist-mapping";

export interface CliFailure {
  code: string;
  message: string;
}

class ExtractorConfigError extends Error {
  constructor() {
    super("추출기 환경 변수를 확인하세요.");
    this.name = "ExtractorConfigError";
  }
}

export function readCliConfig<T>(reader: () => T): T {
  try {
    return reader();
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ExtractorConfigError();
    }
    throw error;
  }
}

function hasSqliteBusyCode(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return typeof error.code === "string" && error.code.startsWith("SQLITE_BUSY");
}

export function classifyCliFailure(error: unknown): CliFailure {
  if (
    error instanceof CandidateImportError ||
    error instanceof MappingCandidateError ||
    error instanceof DatabaseMigrationError ||
    error instanceof NormalizationError ||
    error instanceof NormalizationMappingError ||
    error instanceof LocalizationValidationError ||
    error instanceof RelationshipValidationError ||
    error instanceof ProtagonistMappingRevisionError
  ) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof ExtractorConfigError) {
    return { code: "EXTRACTOR_CONFIG_INVALID", message: error.message };
  }

  if (hasSqliteBusyCode(error)) {
    return {
      code: "DATABASE_BUSY",
      message: "다른 데이터베이스 작업이 끝난 뒤 다시 시도하세요.",
    };
  }

  return {
    code: "EXTRACTOR_UNEXPECTED_ERROR",
    message: "예상하지 못한 오류로 작업을 완료하지 못했습니다.",
  };
}
