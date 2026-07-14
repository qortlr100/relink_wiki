import { describe, expect, it } from "vitest";
import {
  loadPublicSnapshot,
  PublicSnapshotLoadError,
  publicSnapshotLoadErrorCode,
} from "./public-snapshot";

const validSnapshot = {
  schemaVersion: 1,
  contentRevision: "test-revision",
  generatedAt: "2026-07-14T00:00:00.000Z",
  sourceRevision: "test-source",
  characters: [],
  weapons: [],
  sigils: [],
  skills: [],
};

describe("loadPublicSnapshot", () => {
  it("returns a fully validated version 1 snapshot", () => {
    expect(loadPublicSnapshot(validSnapshot)).toEqual(validSnapshot);
  });

  it("rejects an unsupported schema version with a stable error", () => {
    expect(() => loadPublicSnapshot({ ...validSnapshot, schemaVersion: 2 })).toThrow(
      expect.objectContaining({
        code: publicSnapshotLoadErrorCode,
        message: "공개 데이터 스냅샷을 불러올 수 없습니다.",
      }),
    );
  });

  it("rejects records that are not explicitly published", () => {
    const loadUnreviewedSnapshot = () =>
      loadPublicSnapshot({
        ...validSnapshot,
        characters: [{ id: "1", slug: "gran", nameKo: "그랑", reviewState: "reviewed" }],
      });

    expect(loadUnreviewedSnapshot).toThrow(PublicSnapshotLoadError);
  });
});
