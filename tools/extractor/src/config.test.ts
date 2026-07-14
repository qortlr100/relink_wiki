import { describe, expect, it } from "vitest";
import { readExtractorConfig } from "./config";
describe("readExtractorConfig", () => {
  it("does not accept missing machine-specific paths", () => {
    expect(() => readExtractorConfig({})).toThrow();
  });
});
