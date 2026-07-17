export interface ReviewNotice {
  tone: "success" | "error";
  message: string;
}

const reviewNotices: Record<string, ReviewNotice> = {
  decision_saved: { tone: "success", message: "레코드 검수 결정을 저장했습니다." },
  candidate_accepted: {
    tone: "success",
    message: "모든 검수 gate와 백업 증빙을 확인하고 normalization 후보를 승인했습니다.",
  },
  publication_completed: {
    tone: "success",
    message: "검토된 public snapshot 후보 쓰기와 publication 이력 기록을 완료했습니다.",
  },
  database_unset: { tone: "error", message: "RELINK_DATABASE_PATH를 먼저 설정하세요." },
  database_invalid: {
    tone: "error",
    message: "로컬 데이터베이스가 최신 검수 계약을 충족하는지 확인하세요.",
  },
  review_stale: {
    tone: "error",
    message: "baseline 또는 최신 후보가 바뀌었습니다. 새 비교 결과를 다시 검수하세요.",
  },
  review_incomplete: { tone: "error", message: "아직 검수하지 않은 변경 레코드가 있습니다." },
  review_rejected: { tone: "error", message: "거절된 변경 레코드가 있어 승인할 수 없습니다." },
  review_input_invalid: { tone: "error", message: "레코드 검수 입력이 올바르지 않습니다." },
  acceptance_input_invalid: {
    tone: "error",
    message: "승인 확인 문구 또는 NAS 백업 증빙이 올바르지 않습니다.",
  },
  publication_environment_unset: {
    tone: "error",
    message: "RELINK_PUBLICATION_REQUEST_PATH를 포함한 로컬 발행 환경을 설정하세요.",
  },
  publication_confirmation_invalid: {
    tone: "error",
    message: "명시적 발행 확인 문구가 일치하지 않습니다.",
  },
  publication_request_invalid: {
    tone: "error",
    message: "검토된 snapshot, 백업 증빙 또는 발행 요청 파일이 현재 상태와 일치하지 않습니다.",
  },
  publication_failed: {
    tone: "error",
    message: "public snapshot 발행을 안전하게 완료하지 못했습니다.",
  },
};

export function resolveReviewNotice(
  value: string | string[] | undefined,
): ReviewNotice | undefined {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(reviewNotices, key) ? reviewNotices[key] : undefined;
}
