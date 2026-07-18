import type { NormalizationReviewWorkspace } from "@relink-wiki/database";
import type { DashboardReview } from "./dashboard-data";

const categoryLabels = {
  character: "캐릭터",
  weapon: "무기",
  sigil: "진",
  skill: "어빌리티",
} as const;
const diffStatusLabels = { added: "추가", changed: "변경", removed: "삭제" } as const;
const decisionLabels = { approved: "승인", rejected: "거절" } as const;
const changedFieldLabels = { id: "ID", slug: "슬러그", nameKo: "한국어 이름" } as const;

type ReadyReview = Extract<NormalizationReviewWorkspace, { status: "ready" }>;
type ReviewRecordValue = ReadyReview["records"][number]["baseline"];

export type ChangeReportBuildResult =
  | { status: "ready"; fileName: string; markdown: string }
  | { status: "unavailable"; message: string };

function escapeMarkdown(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, " ")
    .replace(/([\\`*_[\]{}()#+\-.!<|>])/g, "\\$1");
}

function recordValueLines(label: string, value: ReviewRecordValue): string[] {
  if (!value) {
    return [`- **${label}:** 해당 없음`];
  }
  return [
    `- **${label} ID:** ${escapeMarkdown(value.id)}`,
    `- **${label} 슬러그:** ${escapeMarkdown(value.slug)}`,
    `- **${label} 한국어 이름:** ${escapeMarkdown(value.nameKo)}`,
  ];
}

export function buildNormalizationChangeReport(review: DashboardReview): ChangeReportBuildResult {
  if (review.status !== "ready") {
    return { status: "unavailable", message: review.message };
  }

  const lines = [
    "# 정규화 변경 보고서",
    "",
    `- **스키마:** v${String(review.schemaVersion)}`,
    `- **후보 정규화 시각:** ${review.candidateNormalizedAt}`,
    `- **비교 지문:** ${review.comparisonFingerprint}`,
    `- **기존 baseline:** ${review.hasBaseline ? "있음" : "없음"}`,
    `- **baseline 승인 가능:** ${review.canAccept ? "예" : "아니오"}`,
    "",
    "## 비교 요약",
    "",
    `- 추가: ${String(review.summary.added)}건`,
    `- 변경: ${String(review.summary.changed)}건`,
    `- 삭제: ${String(review.summary.removed)}건`,
    `- 동일: ${String(review.summary.unchanged)}건`,
    "",
    "## 검수 요약",
    "",
    `- 대기: ${String(review.decisionSummary.pending)}건`,
    `- 승인: ${String(review.decisionSummary.approved)}건`,
    `- 거절: ${String(review.decisionSummary.rejected)}건`,
    "",
    "## 변경 레코드",
    "",
  ];

  review.records.forEach((record, index) => {
    const decision = record.decision ? decisionLabels[record.decision] : "대기";
    lines.push(
      `### ${String(index + 1)}. ${diffStatusLabels[record.status]} · ${categoryLabels[record.category]} · ${decision}`,
      "",
    );
    if (record.changedFields.length > 0) {
      lines.push(
        `- **변경 필드:** ${record.changedFields.map((field) => changedFieldLabels[field]).join(", ")}`,
      );
    }
    lines.push(
      ...recordValueLines("이전", record.baseline),
      ...recordValueLines("후보", record.candidate),
      "",
    );
  });

  return {
    status: "ready",
    fileName: `normalization-change-report-${review.comparisonFingerprint.slice(0, 12)}.md`,
    markdown: `${lines.join("\n").trimEnd()}\n`,
  };
}
