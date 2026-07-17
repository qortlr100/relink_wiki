import {
  getNormalizationReviewWorkspace,
  getReviewDashboard,
  NormalizationRecordReviewError,
  openReadonlyDatabase,
  type NormalizationReviewWorkspace,
  type ReviewDashboard,
} from "@relink-wiki/database";
import { createPublicSnapshotPreview } from "@relink-wiki/publisher";

export type DashboardPreview =
  | {
      status: "ready" | "published";
      contentRevision: string;
      recordCounts: { characters: number; weapons: number; sigils: number; skills: number };
    }
  | { status: "unavailable"; message: string };

export type DashboardLoadState =
  | {
      kind: "ready";
      dashboard: ReviewDashboard;
      preview: DashboardPreview;
      review: DashboardReview;
    }
  | {
      kind: "error";
      code: "DATABASE_PATH_UNSET" | "DATABASE_NOT_FOUND" | "DATABASE_INVALID";
      title: string;
      message: string;
    };

export type DashboardReview =
  | NormalizationReviewWorkspace
  | {
      status: "unavailable";
      message: string;
    };

function loadPreview(
  dashboard: ReviewDashboard,
  db: ReturnType<typeof openReadonlyDatabase>["db"],
): DashboardPreview {
  const baseline = dashboard.currentBaseline;
  if (!baseline) {
    return { status: "unavailable", message: "승인된 baseline이 아직 없습니다." };
  }
  if (dashboard.currentPublication && baseline.reviewStateCounts.published > 0) {
    return {
      status: "published",
      contentRevision: dashboard.currentPublication.contentRevision,
      recordCounts: {
        characters: dashboard.currentPublication.categoryCounts.character,
        weapons: dashboard.currentPublication.categoryCounts.weapon,
        sigils: dashboard.currentPublication.categoryCounts.sigil,
        skills: dashboard.currentPublication.categoryCounts.skill,
      },
    };
  }
  try {
    const generatedAt = new Date(
      Math.max(Date.now(), Date.parse(baseline.acceptedAt)),
    ).toISOString();
    const snapshot = createPublicSnapshotPreview(db, { schemaVersion: 1, generatedAt });
    return {
      status: "ready",
      contentRevision: snapshot.contentRevision,
      recordCounts: snapshot.recordCounts,
    };
  } catch {
    return {
      status: "unavailable",
      message: "현재 baseline의 검수 상태로는 allowlist 미리보기를 만들 수 없습니다.",
    };
  }
}

function sqliteErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  return typeof error.code === "string" ? error.code : null;
}

function loadReview(db: ReturnType<typeof openReadonlyDatabase>["db"]): DashboardReview {
  try {
    return getNormalizationReviewWorkspace(db);
  } catch (error) {
    if (
      error instanceof NormalizationRecordReviewError &&
      error.code === "NORMALIZATION_RECORD_REVIEW_DATABASE_INVALID"
    ) {
      return {
        status: "unavailable",
        message:
          "저장된 검수 결정이 현재 비교 결과와 일치하지 않습니다. 데이터 무결성과 최신 후보 상태를 확인하세요.",
      };
    }
    return {
      status: "unavailable",
      message:
        "레코드 검수 저장소를 읽을 수 없습니다. 마이그레이션 상태와 데이터베이스 무결성을 확인하세요.",
    };
  }
}

export function loadDashboard(databasePath = process.env.RELINK_DATABASE_PATH): DashboardLoadState {
  if (!databasePath?.trim()) {
    return {
      kind: "error",
      code: "DATABASE_PATH_UNSET",
      title: "로컬 데이터베이스가 설정되지 않았습니다",
      message: "RELINK_DATABASE_PATH를 설정한 뒤 관리 앱을 다시 시작하세요.",
    };
  }

  let connection: ReturnType<typeof openReadonlyDatabase> | undefined;
  try {
    connection = openReadonlyDatabase({ path: databasePath });
    const dashboard = getReviewDashboard(connection.db);
    return {
      kind: "ready",
      dashboard,
      preview: loadPreview(dashboard, connection.db),
      review: loadReview(connection.db),
    };
  } catch (error) {
    if (sqliteErrorCode(error) === "SQLITE_CANTOPEN") {
      return {
        kind: "error",
        code: "DATABASE_NOT_FOUND",
        title: "로컬 데이터베이스를 찾을 수 없습니다",
        message: "설정한 데이터베이스 파일이 존재하는지 확인하세요.",
      };
    }
    return {
      kind: "error",
      code: "DATABASE_INVALID",
      title: "로컬 데이터베이스를 읽을 수 없습니다",
      message: "파일이 손상되지 않았는지와 최신 마이그레이션이 적용되었는지 확인하세요.",
    };
  } finally {
    connection?.sqlite.close();
  }
}
