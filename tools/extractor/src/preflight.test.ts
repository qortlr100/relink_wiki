import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtractorConfig } from "./config";
import { inspectExtractorEnvironment } from "./preflight";

const temporaryRoots: string[] = [];

function createFixture(): { config: ExtractorConfig; root: string } {
  const root = mkdtempSync(join(tmpdir(), "relink-extractor-"));
  temporaryRoots.push(root);
  const toolDirectory = join(root, "tool");
  const gameDirectory = join(root, "game");
  const outputDirectory = join(root, "raw");
  mkdirSync(toolDirectory);
  mkdirSync(gameDirectory);
  mkdirSync(outputDirectory);
  writeFileSync(join(toolDirectory, "GBFRDataTools.exe"), "fixture");
  writeFileSync(join(gameDirectory, "data.i"), "fixture");
  writeFileSync(join(gameDirectory, "data.0"), "fixture");

  return {
    root,
    config: {
      executablePath: join(toolDirectory, "GBFRDataTools.exe"),
      gameDataPath: gameDirectory,
      outputPath: outputDirectory,
      version: "2.0.0",
      gameVersion: "2.0.0",
    },
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("inspectExtractorEnvironment", () => {
  it("accepts a read-only game source and separate private output", () => {
    const { config } = createFixture();
    expect(inspectExtractorEnvironment(config)).toMatchObject({ ok: true });
  });

  it("rejects output inside the game directory", () => {
    const { config } = createFixture();
    const result = inspectExtractorEnvironment({
      ...config,
      outputPath: join(config.gameDataPath, "data", "wiki-extract"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected an invalid preflight result.");
    }
    expect(result.issues.map((issue) => issue.code)).toContain("RAW_OUTPUT_INSIDE_GAME_DIRECTORY");
  });

  it("reports missing archive inputs without exposing their paths", () => {
    const { config } = createFixture();
    rmSync(join(config.gameDataPath, "data.i"));
    rmSync(join(config.gameDataPath, "data.0"));
    const result = inspectExtractorEnvironment(config);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected an invalid preflight result.");
    }
    const issueCodes = result.issues.map((issue) => issue.code);
    expect(issueCodes).toContain("GAME_DATA_INDEX_MISSING");
    expect(issueCodes).toContain("GAME_ARCHIVE_MISSING");
    expect(JSON.stringify(result)).not.toContain(config.gameDataPath);
  });
});
