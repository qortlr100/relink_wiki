import { asc, eq } from "drizzle-orm";
import {
  backupReceiptSchema,
  normalizedCategorySchema,
  reviewStateSchema,
} from "@relink-wiki/domain";
import { z } from "zod";
import type { openDatabase } from "./index";
import {
  acceptedNormalizationBaselines,
  currentPublicSnapshotPublications,
  normalizationRuns,
  normalizedRecords,
  publicSnapshotPublications,
} from "./schema";

const categoryCountsSchema = z.object({
  character: z.int().nonnegative(),
  weapon: z.int().nonnegative(),
  sigil: z.int().nonnegative(),
  skill: z.int().nonnegative(),
});
const reviewStateCountsSchema = z.object({
  staged: z.int().nonnegative(),
  reviewed: z.int().nonnegative(),
  published: z.int().nonnegative(),
});
const dashboardRunSchema = z.object({
  normalizedAt: z.iso.datetime(),
  schemaVersion: z.int().positive(),
  isCurrentBaseline: z.boolean(),
  categoryCounts: categoryCountsSchema,
  reviewStateCounts: reviewStateCountsSchema,
});
const dashboardBaselineSchema = z.object({
  schemaVersion: z.int().positive(),
  acceptedAt: z.iso.datetime(),
  backup: backupReceiptSchema,
  categoryCounts: categoryCountsSchema,
  reviewStateCounts: reviewStateCountsSchema,
});
const dashboardPublicationSchema = z.object({
  schemaVersion: z.literal(1),
  publishedAt: z.iso.datetime(),
  contentRevision: z.string().regex(/^[0-9a-f]{64}$/),
  recordCount: z.int().positive(),
  categoryCounts: categoryCountsSchema,
});
const reviewDashboardSchema = z.object({
  normalizationRuns: z.array(dashboardRunSchema),
  currentBaseline: dashboardBaselineSchema.nullable(),
  currentPublication: dashboardPublicationSchema.nullable(),
});

type RelinkDatabase = ReturnType<typeof openDatabase>["db"];
export type ReviewDashboard = z.infer<typeof reviewDashboardSchema>;

export class ReviewDashboardError extends Error {
  readonly code = "REVIEW_DASHBOARD_DATABASE_INVALID";

  constructor() {
    super("로컬 검수 데이터베이스를 읽을 수 없습니다.");
    this.name = "ReviewDashboardError";
  }
}

function emptyCategoryCounts(): z.infer<typeof categoryCountsSchema> {
  return { character: 0, weapon: 0, sigil: 0, skill: 0 };
}

function emptyReviewStateCounts(): z.infer<typeof reviewStateCountsSchema> {
  return { staged: 0, reviewed: 0, published: 0 };
}

export function getReviewDashboard(db: RelinkDatabase): ReviewDashboard {
  try {
    const runs = db
      .select({
        id: normalizationRuns.id,
        normalizedAt: normalizationRuns.normalizedAt,
        schemaVersion: normalizationRuns.schemaVersion,
      })
      .from(normalizationRuns)
      .orderBy(asc(normalizationRuns.normalizedAt))
      .all();
    const baselines = db.select().from(acceptedNormalizationBaselines).all();
    const baselineRunIds = new Set(baselines.map((baseline) => baseline.normalizationRunId));
    const countsByRun = new Map<
      string,
      {
        categoryCounts: z.infer<typeof categoryCountsSchema>;
        reviewStateCounts: z.infer<typeof reviewStateCountsSchema>;
      }
    >();
    const countRows = db
      .select({
        normalizationRunId: normalizedRecords.normalizationRunId,
        category: normalizedRecords.category,
        reviewState: normalizedRecords.reviewState,
      })
      .from(normalizedRecords)
      .all();

    for (const row of countRows) {
      const category = normalizedCategorySchema.parse(row.category);
      const reviewState = reviewStateSchema.parse(row.reviewState);
      const counts = countsByRun.get(row.normalizationRunId) ?? {
        categoryCounts: emptyCategoryCounts(),
        reviewStateCounts: emptyReviewStateCounts(),
      };
      counts.categoryCounts[category] += 1;
      counts.reviewStateCounts[reviewState] += 1;
      countsByRun.set(row.normalizationRunId, counts);
    }

    const normalizationRunSummaries = runs
      .map((run) => ({
        normalizedAt: run.normalizedAt,
        schemaVersion: run.schemaVersion,
        isCurrentBaseline: baselineRunIds.has(run.id),
        ...(countsByRun.get(run.id) ?? {
          categoryCounts: emptyCategoryCounts(),
          reviewStateCounts: emptyReviewStateCounts(),
        }),
      }))
      .reverse();
    const currentBaselineRow = [...baselines].sort((left, right) =>
      right.acceptedAt.localeCompare(left.acceptedAt),
    )[0];
    const currentBaseline = currentBaselineRow
      ? {
          schemaVersion: currentBaselineRow.schemaVersion,
          acceptedAt: currentBaselineRow.acceptedAt,
          backup: {
            reference: currentBaselineRow.backupReference,
            createdAt: currentBaselineRow.backupCreatedAt,
            sha256: currentBaselineRow.backupSha256,
          },
          ...(countsByRun.get(currentBaselineRow.normalizationRunId) ?? {
            categoryCounts: emptyCategoryCounts(),
            reviewStateCounts: emptyReviewStateCounts(),
          }),
        }
      : null;
    const currentPublicationPointer = db
      .select()
      .from(currentPublicSnapshotPublications)
      .where(eq(currentPublicSnapshotPublications.schemaVersion, 1))
      .get();
    const publication = currentPublicationPointer
      ? db
          .select()
          .from(publicSnapshotPublications)
          .where(eq(publicSnapshotPublications.id, currentPublicationPointer.publicationId))
          .get()
      : undefined;
    const currentPublication = publication
      ? {
          schemaVersion: 1 as const,
          publishedAt: publication.publishedAt,
          contentRevision: publication.contentRevision,
          recordCount: publication.recordCount,
          categoryCounts:
            countsByRun.get(publication.normalizationRunId)?.categoryCounts ??
            emptyCategoryCounts(),
        }
      : null;

    return reviewDashboardSchema.parse({
      normalizationRuns: normalizationRunSummaries,
      currentBaseline,
      currentPublication,
    });
  } catch {
    throw new ReviewDashboardError();
  }
}
