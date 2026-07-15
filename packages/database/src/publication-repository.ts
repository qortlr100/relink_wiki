import { asc, eq } from "drizzle-orm";
import { normalizedCategorySchema, recordIdSchema } from "@relink-wiki/domain";
import { z } from "zod";
import type { openDatabase } from "./index";
import { acceptedNormalizationBaselines, normalizedRecords } from "./schema";

const schemaVersionInputSchema = z.int().positive();
const reviewedPublicationRecordSchema = z.object({
  category: normalizedCategorySchema,
  id: recordIdSchema,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  nameKo: z.string().trim().min(1),
  reviewState: z.literal("reviewed"),
  extractorVersion: z.string().trim().min(1),
});

type RelinkDatabase = ReturnType<typeof openDatabase>["db"];
export type ReviewedPublicationRecord = z.infer<typeof reviewedPublicationRecordSchema>;

export interface AcceptedNormalizationSnapshotSource {
  normalizationRunId: string;
  schemaVersion: number;
  acceptedAt: string;
  records: ReviewedPublicationRecord[];
}

export type PublicationRepositoryErrorCode =
  "PUBLICATION_INPUT_INVALID" | "ACCEPTED_BASELINE_NOT_FOUND" | "ACCEPTED_BASELINE_INVALID";

export class PublicationRepositoryError extends Error {
  constructor(
    readonly code: PublicationRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PublicationRepositoryError";
  }
}

export function getAcceptedNormalizationSnapshotSource(
  db: RelinkDatabase,
  schemaVersion: unknown,
): AcceptedNormalizationSnapshotSource {
  const validation = schemaVersionInputSchema.safeParse(schemaVersion);
  if (!validation.success) {
    throw new PublicationRepositoryError(
      "PUBLICATION_INPUT_INVALID",
      "공개 미리보기의 정규화 스키마 버전이 올바르지 않습니다.",
    );
  }

  const baseline = db
    .select()
    .from(acceptedNormalizationBaselines)
    .where(eq(acceptedNormalizationBaselines.schemaVersion, validation.data))
    .get();
  if (!baseline) {
    throw new PublicationRepositoryError(
      "ACCEPTED_BASELINE_NOT_FOUND",
      "공개 미리보기에 사용할 승인된 정규화 baseline이 없습니다.",
    );
  }

  const rows = db
    .select({
      category: normalizedRecords.category,
      id: normalizedRecords.id,
      slug: normalizedRecords.slug,
      nameKo: normalizedRecords.nameKo,
      reviewState: normalizedRecords.reviewState,
      extractorVersion: normalizedRecords.extractorVersion,
      schemaVersion: normalizedRecords.schemaVersion,
    })
    .from(normalizedRecords)
    .where(eq(normalizedRecords.normalizationRunId, baseline.normalizationRunId))
    .orderBy(
      asc(normalizedRecords.category),
      asc(normalizedRecords.id),
      asc(normalizedRecords.slug),
    )
    .all();

  const records = rows.map(({ schemaVersion: recordSchemaVersion, ...row }) => {
    if (recordSchemaVersion !== validation.data) {
      throw new PublicationRepositoryError(
        "ACCEPTED_BASELINE_INVALID",
        "승인된 baseline의 레코드 스키마가 일치하지 않습니다.",
      );
    }
    const record = reviewedPublicationRecordSchema.safeParse(row);
    if (!record.success) {
      throw new PublicationRepositoryError(
        "ACCEPTED_BASELINE_INVALID",
        "승인된 baseline에 공개 미리보기를 만들 수 없는 레코드가 있습니다.",
      );
    }
    return record.data;
  });

  if (records.length === 0) {
    throw new PublicationRepositoryError(
      "ACCEPTED_BASELINE_INVALID",
      "승인된 baseline에 공개 미리보기 레코드가 없습니다.",
    );
  }

  return {
    normalizationRunId: baseline.normalizationRunId,
    schemaVersion: baseline.schemaVersion,
    acceptedAt: baseline.acceptedAt,
    records,
  };
}
