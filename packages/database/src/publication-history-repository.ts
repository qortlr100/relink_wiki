import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  backupReceiptSchema,
  publicSnapshotPublicationSchema,
  publicSnapshotSchema,
  type PublicSnapshot,
  type PublicSnapshotPublication,
} from "@relink-wiki/domain";
import { z } from "zod";
import type { openDatabase } from "./index";
import {
  acceptedNormalizationBaselines,
  currentPublicSnapshotPublications,
  normalizedRecords,
  publicSnapshotPublications,
} from "./schema";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const finalizePublicationInputSchema = z
  .object({
    publicationId: z.uuid(),
    snapshot: publicSnapshotSchema,
    output: z
      .object({
        fileName: z.literal("public-snapshot.v1.json"),
        contentRevision: sha256Schema,
        outputSha256: sha256Schema,
        reused: z.boolean(),
      })
      .strict(),
    publishedAt: z.iso.datetime(),
    backup: backupReceiptSchema,
    expectedCurrentContentRevision: sha256Schema.nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.output.contentRevision !== input.snapshot.contentRevision) {
      context.addIssue({
        code: "custom",
        path: ["output", "contentRevision"],
        message: "쓴 파일의 콘텐츠 리비전이 스냅샷과 일치해야 합니다.",
      });
    }
    if (Date.parse(input.snapshot.generatedAt) > Date.parse(input.publishedAt)) {
      context.addIssue({
        code: "custom",
        path: ["snapshot", "generatedAt"],
        message: "스냅샷은 발행 시각 이후에 생성될 수 없습니다.",
      });
    }
    if (Date.parse(input.backup.createdAt) > Date.parse(input.publishedAt)) {
      context.addIssue({
        code: "custom",
        path: ["backup", "createdAt"],
        message: "백업은 발행 이전에 완료되어야 합니다.",
      });
    }
  });

type RelinkDatabase = ReturnType<typeof openDatabase>["db"];

export type PublicationHistoryErrorCode =
  | "PUBLICATION_FINALIZE_INPUT_INVALID"
  | "PUBLICATION_ALREADY_RECORDED"
  | "PUBLICATION_BASELINE_CHANGED"
  | "PUBLICATION_CURRENT_CHANGED"
  | "PUBLICATION_SNAPSHOT_SOURCE_INVALID"
  | "PUBLICATION_SNAPSHOT_CONTENT_INVALID"
  | "PUBLICATION_REVIEW_STATE_INVALID";

export class PublicationHistoryError extends Error {
  constructor(
    readonly code: PublicationHistoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PublicationHistoryError";
  }
}

export interface FinalizePublicSnapshotPublicationResult {
  publication: PublicSnapshotPublication;
  reused: boolean;
  publishedRecordCount: number;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toPublication(
  row: typeof publicSnapshotPublications.$inferSelect,
): PublicSnapshotPublication {
  return publicSnapshotPublicationSchema.parse({
    id: row.id,
    normalizationRunId: row.normalizationRunId,
    schemaVersion: row.schemaVersion,
    publishedAt: row.publishedAt,
    snapshotGeneratedAt: row.snapshotGeneratedAt,
    contentRevision: row.contentRevision,
    sourceRevision: row.sourceRevision,
    outputSha256: row.outputSha256,
    recordCount: row.recordCount,
    previousContentRevision: row.previousContentRevision,
    backup: {
      reference: row.backupReference,
      createdAt: row.backupCreatedAt,
      sha256: row.backupSha256,
    },
  });
}

function isSamePublicationRequest(
  publication: PublicSnapshotPublication,
  input: z.infer<typeof finalizePublicationInputSchema>,
): boolean {
  return (
    publication.publishedAt === input.publishedAt &&
    publication.snapshotGeneratedAt === input.snapshot.generatedAt &&
    publication.contentRevision === input.snapshot.contentRevision &&
    publication.sourceRevision === input.snapshot.sourceRevision &&
    publication.outputSha256 === input.output.outputSha256 &&
    publication.previousContentRevision === input.expectedCurrentContentRevision &&
    publication.backup.reference === input.backup.reference &&
    publication.backup.createdAt === input.backup.createdAt &&
    publication.backup.sha256 === input.backup.sha256
  );
}

function snapshotCollections(snapshot: PublicSnapshot) {
  return {
    characters: snapshot.characters,
    weapons: snapshot.weapons,
    sigils: snapshot.sigils,
    skills: snapshot.skills,
  };
}

export function finalizePublicSnapshotPublication(
  db: RelinkDatabase,
  input: unknown,
): FinalizePublicSnapshotPublicationResult {
  const validation = finalizePublicationInputSchema.safeParse(input);
  if (!validation.success) {
    throw new PublicationHistoryError(
      "PUBLICATION_FINALIZE_INPUT_INVALID",
      "공개 스냅샷 발행 완료 입력 또는 백업 증빙이 올바르지 않습니다.",
    );
  }
  const candidate = validation.data;

  return db.transaction((transaction) => {
    const existing = transaction
      .select()
      .from(publicSnapshotPublications)
      .where(eq(publicSnapshotPublications.id, candidate.publicationId))
      .get();
    if (existing) {
      const publication = toPublication(existing);
      if (!isSamePublicationRequest(publication, candidate)) {
        throw new PublicationHistoryError(
          "PUBLICATION_ALREADY_RECORDED",
          "발행 식별자에 이미 다른 완료 기록이 있습니다.",
        );
      }
      return {
        publication,
        reused: true,
        publishedRecordCount: publication.recordCount,
      };
    }

    const current = transaction
      .select({ contentRevision: currentPublicSnapshotPublications.contentRevision })
      .from(currentPublicSnapshotPublications)
      .where(eq(currentPublicSnapshotPublications.schemaVersion, candidate.snapshot.schemaVersion))
      .get();
    if ((current?.contentRevision ?? null) !== candidate.expectedCurrentContentRevision) {
      throw new PublicationHistoryError(
        "PUBLICATION_CURRENT_CHANGED",
        "미리보기 이후 현재 공개 스냅샷 기록이 변경되었습니다.",
      );
    }

    const baseline = transaction
      .select()
      .from(acceptedNormalizationBaselines)
      .where(eq(acceptedNormalizationBaselines.schemaVersion, candidate.snapshot.schemaVersion))
      .get();
    if (!baseline) {
      throw new PublicationHistoryError(
        "PUBLICATION_BASELINE_CHANGED",
        "발행할 승인 baseline이 더 이상 현재 baseline이 아닙니다.",
      );
    }
    const expectedSourceRevision = hash({
      normalizationRunId: baseline.normalizationRunId,
      acceptedAt: baseline.acceptedAt,
      schemaVersion: baseline.schemaVersion,
    });
    if (expectedSourceRevision !== candidate.snapshot.sourceRevision) {
      throw new PublicationHistoryError(
        "PUBLICATION_SNAPSHOT_SOURCE_INVALID",
        "쓴 공개 스냅샷이 현재 승인 baseline에서 생성되지 않았습니다.",
      );
    }

    const rows = transaction
      .select({
        category: normalizedRecords.category,
        id: normalizedRecords.id,
        slug: normalizedRecords.slug,
        nameKo: normalizedRecords.nameKo,
        reviewState: normalizedRecords.reviewState,
      })
      .from(normalizedRecords)
      .where(eq(normalizedRecords.normalizationRunId, baseline.normalizationRunId))
      .orderBy(
        asc(normalizedRecords.category),
        asc(normalizedRecords.id),
        asc(normalizedRecords.slug),
      )
      .all();
    if (rows.length === 0 || rows.some((row) => row.reviewState !== "reviewed")) {
      throw new PublicationHistoryError(
        "PUBLICATION_REVIEW_STATE_INVALID",
        "승인 baseline의 레코드 검수 상태가 발행 조건과 일치하지 않습니다.",
      );
    }
    const expectedCollections = {
      characters: rows
        .filter((row) => row.category === "character")
        .map(({ id, slug, nameKo }) => ({ id, slug, nameKo, reviewState: "published" as const })),
      weapons: rows
        .filter((row) => row.category === "weapon")
        .map(({ id, slug, nameKo }) => ({ id, slug, nameKo, reviewState: "published" as const })),
      sigils: rows
        .filter((row) => row.category === "sigil")
        .map(({ id, slug, nameKo }) => ({ id, slug, nameKo, reviewState: "published" as const })),
      skills: rows
        .filter((row) => row.category === "skill")
        .map(({ id, slug, nameKo }) => ({ id, slug, nameKo, reviewState: "published" as const })),
    };
    if (
      hash(expectedCollections) !== candidate.snapshot.contentRevision ||
      JSON.stringify(expectedCollections) !==
        JSON.stringify(snapshotCollections(candidate.snapshot))
    ) {
      throw new PublicationHistoryError(
        "PUBLICATION_SNAPSHOT_CONTENT_INVALID",
        "쓴 공개 스냅샷의 공개 레코드가 현재 승인 baseline과 일치하지 않습니다.",
      );
    }

    const publication = publicSnapshotPublicationSchema.parse({
      id: candidate.publicationId,
      normalizationRunId: baseline.normalizationRunId,
      schemaVersion: candidate.snapshot.schemaVersion,
      publishedAt: candidate.publishedAt,
      snapshotGeneratedAt: candidate.snapshot.generatedAt,
      contentRevision: candidate.snapshot.contentRevision,
      sourceRevision: candidate.snapshot.sourceRevision,
      outputSha256: candidate.output.outputSha256,
      recordCount: rows.length,
      previousContentRevision: candidate.expectedCurrentContentRevision,
      backup: candidate.backup,
    });
    transaction
      .insert(publicSnapshotPublications)
      .values({
        id: publication.id,
        normalizationRunId: publication.normalizationRunId,
        schemaVersion: publication.schemaVersion,
        publishedAt: publication.publishedAt,
        snapshotGeneratedAt: publication.snapshotGeneratedAt,
        contentRevision: publication.contentRevision,
        sourceRevision: publication.sourceRevision,
        outputSha256: publication.outputSha256,
        recordCount: publication.recordCount,
        previousContentRevision: publication.previousContentRevision,
        backupReference: publication.backup.reference,
        backupCreatedAt: publication.backup.createdAt,
        backupSha256: publication.backup.sha256,
      })
      .run();
    transaction
      .insert(currentPublicSnapshotPublications)
      .values({
        schemaVersion: publication.schemaVersion,
        publicationId: publication.id,
        contentRevision: publication.contentRevision,
        publishedAt: publication.publishedAt,
      })
      .onConflictDoUpdate({
        target: currentPublicSnapshotPublications.schemaVersion,
        set: {
          publicationId: publication.id,
          contentRevision: publication.contentRevision,
          publishedAt: publication.publishedAt,
        },
      })
      .run();
    const update = transaction
      .update(normalizedRecords)
      .set({ reviewState: "published" })
      .where(
        and(
          eq(normalizedRecords.normalizationRunId, publication.normalizationRunId),
          eq(normalizedRecords.reviewState, "reviewed"),
        ),
      )
      .run();
    if (update.changes !== publication.recordCount) {
      throw new PublicationHistoryError(
        "PUBLICATION_REVIEW_STATE_INVALID",
        "승인 baseline의 레코드 검수 상태가 발행 중 변경되었습니다.",
      );
    }

    return {
      publication,
      reused: false,
      publishedRecordCount: update.changes,
    };
  });
}
