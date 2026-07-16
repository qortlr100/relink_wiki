import { describe, expect, it } from "vitest";
import { readExtractorConfig } from "./config";

describe("readExtractorConfig", () => {
  it("does not accept missing machine-specific paths", () => {
    expect(() => readExtractorConfig({})).toThrow();
  });

  it("accepts the pinned extractor and semantic game versions", () => {
    expect(
      readExtractorConfig({
        GBFR_DATA_TOOLS_PATH: "C:\\tools\\GBFRDataTools.exe",
        GBFR_DATA_TOOLS_VERSION: "2.0.0",
        GBFR_GAME_VERSION: "2.0.0",
        GBFR_GAME_DATA_PATH: "C:\\games\\relink",
        RELINK_RAW_OUTPUT_PATH: "C:\\private\\raw",
      }),
    ).toMatchObject({ version: "2.0.0", gameVersion: "2.0.0" });
  });

  it("rejects an extractor version that is not pinned", () => {
    expect(() =>
      readExtractorConfig({
        GBFR_DATA_TOOLS_PATH: "C:\\tools\\GBFRDataTools.exe",
        GBFR_DATA_TOOLS_VERSION: "1.5.1",
        GBFR_GAME_VERSION: "2.0.0",
        GBFR_GAME_DATA_PATH: "C:\\games\\relink",
        RELINK_RAW_OUTPUT_PATH: "C:\\private\\raw",
      }),
    ).toThrow();
  });
});
