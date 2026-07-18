import { buildNormalizationChangeReport } from "../change-report";
import { loadDashboard, type DashboardLoadState } from "../dashboard-data";

export const dynamic = "force-dynamic";

function textResponse(body: string, status: number): Response {
  return new Response(`${body}\n`, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function createChangeReportResponse(state: DashboardLoadState): Response {
  if (state.kind === "error") {
    const status = state.code === "DATABASE_NOT_FOUND" ? 404 : 503;
    return textResponse(`${state.title}. ${state.message}`, status);
  }

  const report = buildNormalizationChangeReport(state.review);
  if (report.status === "unavailable") {
    return textResponse(report.message, 409);
  }

  return new Response(report.markdown, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${report.fileName}"`,
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function GET(): Response {
  return createChangeReportResponse(loadDashboard());
}
