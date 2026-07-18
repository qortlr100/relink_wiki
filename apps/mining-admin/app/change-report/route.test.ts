import { describe, expect, it } from "vitest";
import type { DashboardLoadState } from "../dashboard-data";
import { createChangeReportResponse } from "./route";

const readyState = {
  kind: "ready",
  dashboard: { normalizationRuns: [], currentBaseline: null, currentPublication: null },
  preview: { status: "unavailable", message: "승인된 baseline이 아직 없습니다." },
  review: {
    status: "ready",
    comparisonFingerprint: "b".repeat(64),
    schemaVersion: 1,
    candidateNormalizedAt: "2026-07-18T01:02:03.000Z",
    hasBaseline: false,
    summary: { added: 1, changed: 0, removed: 0, unchanged: 0 },
    decisionSummary: { pending: 1, approved: 0, rejected: 0 },
    canAccept: false,
    records: [
      {
        recordIndex: 0,
        category: "character",
        status: "added",
        changedFields: [],
        baseline: null,
        candidate: { id: "character-1", slug: "character-1", nameKo: "캐릭터" },
        decision: null,
        note: null,
        decidedAt: null,
      },
    ],
  },
} satisfies DashboardLoadState;

describe("change report response", () => {
  it("returns the Markdown report as a non-cacheable download", async () => {
    const response = createChangeReportResponse(readyState);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="normalization-change-report-bbbbbbbbbbbb.md"',
    );
    expect(await response.text()).toContain("- **후보 ID:** character\\-1");
  });

  it("returns path-free guidance when the database is unavailable", async () => {
    const response = createChangeReportResponse({
      kind: "error",
      code: "DATABASE_NOT_FOUND",
      title: "로컬 데이터베이스를 찾을 수 없습니다",
      message: "설정한 데이터베이스 파일이 존재하는지 확인하세요.",
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).not.toContain(".sqlite");
  });
});
