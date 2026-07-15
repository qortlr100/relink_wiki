import { createHash } from "node:crypto";
import {
  getAcceptedNormalizationSnapshotSource,
  PublicationRepositoryError,
  type openDatabase,
  type ReviewedPublicationRecord,
} from "@relink-wiki/database";
import { publicSnapshotSchema, type PublicRecord, type PublicSnapshot } from "@relink-wiki/domain";
import { z } from "zod";

export * from "./snapshot-writer";

const publicSnapshotPreviewInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime(),
  })
  .strict();

type RelinkDatabase = ReturnType<typeof openDatabase>["db"];

export type PublicSnapshotPreviewErrorCode =
  | "PUBLIC_SNAPSHOT_PREVIEW_INPUT_INVALID"
  | "PUBLIC_SNAPSHOT_PREVIEW_SOURCE_INVALID"
  | "PUBLIC_SNAPSHOT_PREVIEW_OUTPUT_INVALID";

export class PublicSnapshotPreviewError extends Error {
  constructor(
    readonly code: PublicSnapshotPreviewErrorCode,
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = "PublicSnapshotPreviewError";
  }
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toPublicRecord(record: ReviewedPublicationRecord): PublicRecord {
  return {
    id: record.id,
    slug: record.slug,
    nameKo: record.nameKo,
    reviewState: "published",
  };
}

function getPreviewSource(db: RelinkDatabase, schemaVersion: number) {
  try {
    return getAcceptedNormalizationSnapshotSource(db, schemaVersion);
  } catch (error) {
    if (error instanceof PublicationRepositoryError) {
      throw new PublicSnapshotPreviewError(
        "PUBLIC_SNAPSHOT_PREVIEW_SOURCE_INVALID",
        "공개 스냅샷 미리보기의 승인된 baseline을 읽을 수 없습니다.",
        [error.code, ...error.details],
      );
    }
    throw error;
  }
}

export function createPublicSnapshotPreview(db: RelinkDatabase, input: unknown): PublicSnapshot {
  const validation = publicSnapshotPreviewInputSchema.safeParse(input);
  if (!validation.success) {
    throw new PublicSnapshotPreviewError(
      "PUBLIC_SNAPSHOT_PREVIEW_INPUT_INVALID",
      "공개 스냅샷 미리보기 입력이 올바르지 않습니다.",
    );
  }

  const source = getPreviewSource(db, validation.data.schemaVersion);
  if (Date.parse(validation.data.generatedAt) < Date.parse(source.acceptedAt)) {
    throw new PublicSnapshotPreviewError(
      "PUBLIC_SNAPSHOT_PREVIEW_INPUT_INVALID",
      "공개 스냅샷은 baseline 승인 이후에 생성되어야 합니다.",
    );
  }
  const extractorVersions = new Set(source.records.map((record) => record.extractorVersion));
  if (extractorVersions.size !== 1) {
    throw new PublicSnapshotPreviewError(
      "PUBLIC_SNAPSHOT_PREVIEW_SOURCE_INVALID",
      "승인된 baseline의 추출기 버전이 일관되지 않습니다.",
    );
  }
  const extractorVersion = [...extractorVersions][0];
  if (!extractorVersion) {
    throw new PublicSnapshotPreviewError(
      "PUBLIC_SNAPSHOT_PREVIEW_SOURCE_INVALID",
      "승인된 baseline의 추출기 버전을 확인할 수 없습니다.",
    );
  }

  const collections = {
    characters: source.records
      .filter((record) => record.category === "character")
      .map(toPublicRecord),
    weapons: source.records.filter((record) => record.category === "weapon").map(toPublicRecord),
    sigils: source.records.filter((record) => record.category === "sigil").map(toPublicRecord),
    skills: source.records.filter((record) => record.category === "skill").map(toPublicRecord),
  };
  const sourceRevision = hash({
    normalizationRunId: source.normalizationRunId,
    acceptedAt: source.acceptedAt,
    schemaVersion: source.schemaVersion,
  });
  const snapshot = {
    schemaVersion: validation.data.schemaVersion,
    contentRevision: hash(collections),
    generatedAt: validation.data.generatedAt,
    sourceRevision,
    extractor: { name: "GBFRDataTools" as const, version: extractorVersion },
    recordCounts: {
      characters: collections.characters.length,
      weapons: collections.weapons.length,
      sigils: collections.sigils.length,
      skills: collections.skills.length,
    },
    ...collections,
  };

  const result = publicSnapshotSchema.safeParse(snapshot);
  if (!result.success) {
    throw new PublicSnapshotPreviewError(
      "PUBLIC_SNAPSHOT_PREVIEW_OUTPUT_INVALID",
      "생성된 공개 스냅샷 미리보기가 출력 계약을 충족하지 않습니다.",
      result.error.issues.map((issue) => `${issue.path.join(".") || "snapshot"}: ${issue.message}`),
    );
  }
  return result.data;
}
