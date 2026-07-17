import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  finalizePublicSnapshotPublication,
  getReviewDashboard,
  openDatabase,
  type FinalizePublicSnapshotPublicationResult,
} from "@relink-wiki/database";
import {
  backupReceiptSchema,
  publicSnapshotSchema,
  type PublicSnapshot,
} from "@relink-wiki/domain";
import { z } from "zod";
import { writePublicSnapshot, type PublicSnapshotWriteResult } from "./snapshot-writer";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const commandInputSchema = z
  .object({
    databasePath: z.string().trim().min(1),
    requestPath: z.string().trim().min(1),
  })
  .strict();
const publicationRequestSchema = z
  .object({
    confirmation: z.literal("PUBLISH_REVIEWED_PUBLIC_SNAPSHOT_V1"),
    publicationId: z.uuid(),
    reviewedSnapshotPath: z.string().trim().min(1),
    reviewedSnapshotSha256: sha256Schema,
    reviewedContentRevision: sha256Schema,
    outputDirectory: z.string().trim().min(1),
    writtenAt: z.iso.datetime(),
    publishedAt: z.iso.datetime(),
    backup: backupReceiptSchema,
    expectedCurrentContentRevision: sha256Schema.nullable(),
  })
  .strict()
  .superRefine((request, context) => {
    if (Date.parse(request.backup.createdAt) > Date.parse(request.writtenAt)) {
      context.addIssue({
        code: "custom",
        path: ["backup", "createdAt"],
        message: "백업은 후보 파일 쓰기 전에 완료되어야 합니다.",
      });
    }
    if (Date.parse(request.writtenAt) > Date.parse(request.publishedAt)) {
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "발행 시각은 후보 파일 쓰기 시각보다 빠를 수 없습니다.",
      });
    }
  });

type RelinkDatabase = ReturnType<typeof openDatabase>["db"];
type PublicationRequest = z.infer<typeof publicationRequestSchema>;

export type PublicSnapshotPublicationCommandErrorCode =
  | "PUBLIC_SNAPSHOT_PUBLICATION_COMMAND_INPUT_INVALID"
  | "PUBLIC_SNAPSHOT_PUBLICATION_REQUEST_INVALID"
  | "PUBLIC_SNAPSHOT_PUBLICATION_SNAPSHOT_INVALID"
  | "PUBLIC_SNAPSHOT_PUBLICATION_SNAPSHOT_CHANGED"
  | "PUBLIC_SNAPSHOT_PUBLICATION_BACKUP_STALE";

export class PublicSnapshotPublicationCommandError extends Error {
  constructor(
    readonly code: PublicSnapshotPublicationCommandErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PublicSnapshotPublicationCommandError";
  }
}

export interface PublicSnapshotPublicationCommandResult {
  code: "PUBLIC_SNAPSHOT_PUBLICATION_COMPLETED";
  contentRevision: string;
  recordCounts: PublicSnapshot["recordCounts"];
  outputSha256: string;
  publishedRecordCount: number;
  snapshotReused: boolean;
  publicationReused: boolean;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function resolveSafeAbsoluteFile(path: string): string {
  if (!isAbsolute(path)) {
    throw new Error("unsafe-file");
  }
  const resolved = resolve(path);
  const metadata = lstatSync(resolved);
  if (!metadata.isFile() || metadata.isSymbolicLink() || realpathSync(resolved) !== resolved) {
    throw new Error("unsafe-file");
  }
  return resolved;
}

function readSafeAbsoluteFile(path: string): string {
  return readFileSync(resolveSafeAbsoluteFile(path), "utf8");
}

function readPublicationRequest(path: string): PublicationRequest {
  try {
    const serialized = readSafeAbsoluteFile(path);
    const parsed = publicationRequestSchema.safeParse(JSON.parse(serialized) as unknown);
    if (!parsed.success) {
      throw new Error("invalid-request");
    }
    return parsed.data;
  } catch {
    throw new PublicSnapshotPublicationCommandError(
      "PUBLIC_SNAPSHOT_PUBLICATION_REQUEST_INVALID",
      "발행 요청 파일이 없거나 안전한 JSON 계약을 충족하지 않습니다.",
    );
  }
}

function readReviewedSnapshot(request: PublicationRequest): PublicSnapshot {
  let serialized: string;
  try {
    serialized = readSafeAbsoluteFile(request.reviewedSnapshotPath);
  } catch {
    throw new PublicSnapshotPublicationCommandError(
      "PUBLIC_SNAPSHOT_PUBLICATION_SNAPSHOT_INVALID",
      "검토된 공개 스냅샷 파일을 안전하게 읽을 수 없습니다.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new PublicSnapshotPublicationCommandError(
      "PUBLIC_SNAPSHOT_PUBLICATION_SNAPSHOT_INVALID",
      "검토된 공개 스냅샷이 version 1 JSON 계약을 충족하지 않습니다.",
    );
  }
  const snapshot = publicSnapshotSchema.safeParse(parsed);
  if (!snapshot.success) {
    throw new PublicSnapshotPublicationCommandError(
      "PUBLIC_SNAPSHOT_PUBLICATION_SNAPSHOT_INVALID",
      "검토된 공개 스냅샷이 version 1 JSON 계약을 충족하지 않습니다.",
    );
  }
  if (
    sha256(serialized) !== request.reviewedSnapshotSha256 ||
    snapshot.data.contentRevision !== request.reviewedContentRevision
  ) {
    throw new PublicSnapshotPublicationCommandError(
      "PUBLIC_SNAPSHOT_PUBLICATION_SNAPSHOT_CHANGED",
      "검토 이후 공개 스냅샷 파일 또는 콘텐츠 리비전이 변경되었습니다.",
    );
  }
  return snapshot.data;
}

function assertFreshBackup(db: RelinkDatabase, request: PublicationRequest): void {
  const baseline = getReviewDashboard(db).currentBaseline;
  if (!baseline || Date.parse(request.backup.createdAt) <= Date.parse(baseline.acceptedAt)) {
    throw new PublicSnapshotPublicationCommandError(
      "PUBLIC_SNAPSHOT_PUBLICATION_BACKUP_STALE",
      "현재 승인 baseline 이후에 완료된 NAS 백업 증빙이 필요합니다.",
    );
  }
}

function toResult(
  snapshot: PublicSnapshot,
  output: PublicSnapshotWriteResult,
  finalization: FinalizePublicSnapshotPublicationResult,
): PublicSnapshotPublicationCommandResult {
  return {
    code: "PUBLIC_SNAPSHOT_PUBLICATION_COMPLETED",
    contentRevision: snapshot.contentRevision,
    recordCounts: snapshot.recordCounts,
    outputSha256: output.outputSha256,
    publishedRecordCount: finalization.publishedRecordCount,
    snapshotReused: output.reused,
    publicationReused: finalization.reused,
  };
}

export function publishReviewedPublicSnapshot(
  db: RelinkDatabase,
  input: unknown,
): PublicSnapshotPublicationCommandResult {
  const validation = publicationRequestSchema.safeParse(input);
  if (!validation.success) {
    throw new PublicSnapshotPublicationCommandError(
      "PUBLIC_SNAPSHOT_PUBLICATION_REQUEST_INVALID",
      "발행 요청이 명시적 확인과 version 1 입력 계약을 충족하지 않습니다.",
    );
  }
  const request = validation.data;
  const snapshot = readReviewedSnapshot(request);
  assertFreshBackup(db, request);
  const output = writePublicSnapshot({
    snapshot,
    outputDirectory: request.outputDirectory,
    writtenAt: request.writtenAt,
    backup: request.backup,
    expectedCurrentContentRevision: request.expectedCurrentContentRevision,
  });
  const finalization = finalizePublicSnapshotPublication(db, {
    publicationId: request.publicationId,
    snapshot,
    output,
    publishedAt: request.publishedAt,
    backup: request.backup,
    expectedCurrentContentRevision: request.expectedCurrentContentRevision,
  });
  return toResult(snapshot, output, finalization);
}

export function runPublicSnapshotPublicationCommand(
  input: unknown,
): PublicSnapshotPublicationCommandResult {
  const validation = commandInputSchema.safeParse(input);
  if (!validation.success) {
    throw new PublicSnapshotPublicationCommandError(
      "PUBLIC_SNAPSHOT_PUBLICATION_COMMAND_INPUT_INVALID",
      "발행 명령의 데이터베이스 또는 요청 파일 설정이 올바르지 않습니다.",
    );
  }

  const request = readPublicationRequest(validation.data.requestPath);
  try {
    resolveSafeAbsoluteFile(validation.data.databasePath);
  } catch {
    throw new PublicSnapshotPublicationCommandError(
      "PUBLIC_SNAPSHOT_PUBLICATION_COMMAND_INPUT_INVALID",
      "기존 로컬 데이터베이스 파일을 안전하게 열 수 없습니다.",
    );
  }

  const connection = openDatabase({ path: validation.data.databasePath });
  try {
    return publishReviewedPublicSnapshot(connection.db, request);
  } finally {
    connection.sqlite.close();
  }
}
