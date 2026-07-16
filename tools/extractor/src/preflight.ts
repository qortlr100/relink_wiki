import { existsSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import type { ExtractorConfig } from "./config";

export type ExtractorPreflightIssueCode =
  | "EXTRACTOR_EXECUTABLE_MISSING"
  | "EXTRACTOR_EXECUTABLE_INVALID"
  | "GAME_DATA_INDEX_MISSING"
  | "GAME_ARCHIVE_MISSING"
  | "RAW_OUTPUT_PATH_INVALID"
  | "RAW_OUTPUT_INSIDE_GAME_DIRECTORY";

export interface ExtractorPreflightIssue {
  code: ExtractorPreflightIssueCode;
  message: string;
}

export type ExtractorPreflightResult =
  { ok: true; dataIndexPath: string } | { ok: false; issues: ExtractorPreflightIssue[] };

function isFile(filePath: string): boolean {
  return existsSync(filePath) && statSync(filePath).isFile();
}

function isDirectory(directoryPath: string): boolean {
  return existsSync(directoryPath) && statSync(directoryPath).isDirectory();
}

function isInside(candidatePath: string, parentPath: string): boolean {
  const pathFromParent = relative(resolve(parentPath), resolve(candidatePath));
  return pathFromParent === "" || (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent));
}

export function inspectExtractorEnvironment(config: ExtractorConfig): ExtractorPreflightResult {
  const issues: ExtractorPreflightIssue[] = [];
  const executablePath = resolve(config.executablePath);
  const gameDataPath = resolve(config.gameDataPath);
  const outputPath = resolve(config.outputPath);
  const dataIndexPath = resolve(gameDataPath, "data.i");
  const firstArchivePath = resolve(gameDataPath, "data.0");

  if (!isFile(executablePath)) {
    issues.push({
      code: "EXTRACTOR_EXECUTABLE_MISSING",
      message: "GBFRDataTools 실행 파일을 찾을 수 없습니다.",
    });
  } else if (
    extname(executablePath).toLowerCase() !== ".exe" ||
    isInside(executablePath, gameDataPath)
  ) {
    issues.push({
      code: "EXTRACTOR_EXECUTABLE_INVALID",
      message: "추출기는 게임 설치 폴더 밖의 Windows 실행 파일이어야 합니다.",
    });
  }

  if (!isFile(dataIndexPath)) {
    issues.push({
      code: "GAME_DATA_INDEX_MISSING",
      message: "게임 데이터 인덱스 data.i를 찾을 수 없습니다.",
    });
  }

  if (!isFile(firstArchivePath)) {
    issues.push({
      code: "GAME_ARCHIVE_MISSING",
      message: "첫 번째 게임 데이터 아카이브 data.0을 찾을 수 없습니다.",
    });
  }

  if (existsSync(outputPath) && !isDirectory(outputPath)) {
    issues.push({
      code: "RAW_OUTPUT_PATH_INVALID",
      message: "비공개 추출 출력 경로가 디렉터리가 아닙니다.",
    });
  }

  if (isInside(outputPath, gameDataPath)) {
    issues.push({
      code: "RAW_OUTPUT_INSIDE_GAME_DIRECTORY",
      message: "비공개 추출 출력 경로는 게임 설치 폴더 밖에 있어야 합니다.",
    });
  }

  return issues.length === 0 ? { ok: true, dataIndexPath } : { ok: false, issues };
}
