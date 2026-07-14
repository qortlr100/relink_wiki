import { describe, expect, it } from "vitest";
import { publicSnapshotSchema } from "./index";
describe("publicSnapshotSchema", () => {
  it("rejects unreviewed public records", () => {
    const result = publicSnapshotSchema.safeParse({
      schemaVersion: 1,
      contentRevision: "1",
      generatedAt: new Date().toISOString(),
      sourceRevision: "abc",
      characters: [{ id: "1", slug: "gran", nameKo: "그랑", reviewState: "staged" }],
    });
    expect(result.success).toBe(false);
  });
});
