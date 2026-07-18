import { describe, expect, it } from "vitest";
import type { DashboardReview } from "./dashboard-data";
import { buildNormalizationChangeReport } from "./change-report";

const readyReview = {
  status: "ready",
  comparisonFingerprint: "a".repeat(64),
  schemaVersion: 1,
  candidateNormalizedAt: "2026-07-18T01:02:03.000Z",
  hasBaseline: true,
  summary: { added: 0, changed: 1, removed: 0, unchanged: 3 },
  decisionSummary: { pending: 0, approved: 1, rejected: 0 },
  canAccept: true,
  records: [
    {
      recordIndex: 0,
      category: "weapon",
      status: "changed",
      changedFields: ["slug", "nameKo"],
      baseline: { id: "weapon-1", slug: "old-slug", nameKo: "이전 이름" },
      candidate: {
        id: "weapon-1",
        slug: "new-(slug)",
        nameKo: "새 이름\n둘째 줄 <img src=x onerror=alert(1)>",
      },
      decision: "approved",
      note: "PRIVATE_REVIEW_NOTE",
      decidedAt: "2026-07-18T02:00:00.000Z",
    },
  ],
} satisfies DashboardReview;

describe("normalization change report", () => {
  it("builds a deterministic allowlist-only Markdown report", () => {
    const first = buildNormalizationChangeReport(readyReview);
    const second = buildNormalizationChangeReport(readyReview);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: "ready",
      fileName: "normalization-change-report-aaaaaaaaaaaa.md",
    });
    if (first.status !== "ready") throw new Error("Expected a ready report.");
    expect(first.markdown).toContain("# 정규화 변경 보고서");
    expect(first.markdown).toContain("- **변경 필드:** 슬러그, 한국어 이름");
    expect(first.markdown).toContain("- **후보 슬러그:** new\\-\\(slug\\)");
    expect(first.markdown).toContain(
      "- **후보 한국어 이름:** 새 이름 둘째 줄 \\<img src=x onerror=alert\\(1\\)\\>",
    );
    expect(first.markdown).not.toContain("새 이름 둘째 줄 <img");
    expect(first.markdown).not.toContain("PRIVATE_REVIEW_NOTE");
    expect(first.markdown).not.toContain("2026-07-18T02:00:00.000Z");
    expect(first.markdown).not.toContain("recordIndex");
  });

  it("preserves a safe unavailable message without inventing a report", () => {
    expect(
      buildNormalizationChangeReport({ status: "empty", message: "검수할 후보가 없습니다." }),
    ).toEqual({ status: "unavailable", message: "검수할 후보가 없습니다." });
  });
});
