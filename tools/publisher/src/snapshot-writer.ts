import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  backupReceiptSchema,
  publicSnapshotSchema,
  type PublicSnapshot,
} from "@relink-wiki/domain";
import { z } from "zod";

const snapshotWriteInputSchema = z
  .object({
    snapshot: publicSnapshotSchema,
    outputDirectory: z.string().trim().min(1),
    writtenAt: z.iso.datetime(),
    backup: backupReceiptSchema,
    expectedCurrentContentRevision: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
  })
  .strict()
  .refine((input) => Date.parse(input.backup.createdAt) <= Date.parse(input.writtenAt), {
    path: ["backup", "createdAt"],
    message: "백업은 스냅샷 쓰기 이전에 완료되어야 합니다.",
  })
  .refine((input) => Date.parse(input.snapshot.generatedAt) <= Date.parse(input.writtenAt), {
    path: ["snapshot", "generatedAt"],
    message: "스냅샷은 쓰기 시각 이후에 생성될 수 없습니다.",
  });

export type PublicSnapshotWriteErrorCode =
  | "PUBLIC_SNAPSHOT_WRITE_INPUT_INVALID"
  | "PUBLIC_SNAPSHOT_WRITE_OUTPUT_DIRECTORY_INVALID"
  | "PUBLIC_SNAPSHOT_WRITE_LOCKED"
  | "PUBLIC_SNAPSHOT_WRITE_CURRENT_INVALID"
  | "PUBLIC_SNAPSHOT_WRITE_CURRENT_CHANGED"
  | "PUBLIC_SNAPSHOT_WRITE_FAILED"
  | "PUBLIC_SNAPSHOT_WRITE_VERIFY_FAILED";

export class PublicSnapshotWriteError extends Error {
  constructor(
    readonly code: PublicSnapshotWriteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PublicSnapshotWriteError";
  }
}

export interface PublicSnapshotWriteResult {
  fileName: string;
  contentRevision: string;
  outputSha256: string;
  reused: boolean;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function removeIfPresent(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (!isErrorCode(error, "ENOENT")) {
      throw error;
    }
  }
}

function serializeSnapshot(snapshot: PublicSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function parseSnapshot(serialized: string): PublicSnapshot | null {
  try {
    const result = publicSnapshotSchema.safeParse(JSON.parse(serialized) as unknown);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function validateOutputDirectory(input: string): string {
  if (!isAbsolute(input)) {
    throw new PublicSnapshotWriteError(
      "PUBLIC_SNAPSHOT_WRITE_OUTPUT_DIRECTORY_INVALID",
      "공개 스냅샷 출력 디렉터리는 기존 절대 경로여야 합니다.",
    );
  }
  try {
    const resolved = resolve(input);
    const metadata = lstatSync(resolved);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      realpathSync(resolved) !== resolved
    ) {
      throw new Error("unsafe-output-directory");
    }
    return resolved;
  } catch {
    throw new PublicSnapshotWriteError(
      "PUBLIC_SNAPSHOT_WRITE_OUTPUT_DIRECTORY_INVALID",
      "공개 스냅샷 출력 디렉터리는 기존 절대 경로여야 합니다.",
    );
  }
}

function readCurrentSnapshot(
  targetPath: string,
): { serialized: string; snapshot: PublicSnapshot } | null {
  if (!existsSync(targetPath)) {
    return null;
  }
  try {
    const metadata = lstatSync(targetPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("unsafe-current-output");
    }
    const serialized = readFileSync(targetPath, "utf8");
    const snapshot = parseSnapshot(serialized);
    if (!snapshot) {
      throw new Error("invalid-current-output");
    }
    return { serialized, snapshot };
  } catch {
    throw new PublicSnapshotWriteError(
      "PUBLIC_SNAPSHOT_WRITE_CURRENT_INVALID",
      "기존 공개 스냅샷이 안전한 version 1 파일이 아닙니다.",
    );
  }
}

function assertExpectedCurrentRevision(
  current: { snapshot: PublicSnapshot } | null,
  expectedRevision: string | null,
): void {
  if (
    (current === null && expectedRevision !== null) ||
    (current !== null && current.snapshot.contentRevision !== expectedRevision)
  ) {
    throw new PublicSnapshotWriteError(
      "PUBLIC_SNAPSHOT_WRITE_CURRENT_CHANGED",
      "미리보기 이후 기존 공개 스냅샷이 변경되었습니다. 최신 파일을 다시 확인하세요.",
    );
  }
}

export function writePublicSnapshot(input: unknown): PublicSnapshotWriteResult {
  const validation = snapshotWriteInputSchema.safeParse(input);
  if (!validation.success) {
    throw new PublicSnapshotWriteError(
      "PUBLIC_SNAPSHOT_WRITE_INPUT_INVALID",
      "공개 스냅샷 쓰기 입력 또는 백업 증빙이 올바르지 않습니다.",
    );
  }
  const candidate = validation.data;
  const outputDirectory = validateOutputDirectory(candidate.outputDirectory);
  const fileName = "public-snapshot.v1.json";
  const targetPath = join(outputDirectory, fileName);
  const lockPath = `${targetPath}.lock`;
  const temporaryPath = join(outputDirectory, `.${fileName}.${randomUUID()}.tmp`);
  let lockDescriptor: number | null = null;
  let temporaryDescriptor: number | null = null;

  try {
    try {
      lockDescriptor = openSync(lockPath, "wx", 0o600);
    } catch (error) {
      if (isErrorCode(error, "EEXIST")) {
        throw new PublicSnapshotWriteError(
          "PUBLIC_SNAPSHOT_WRITE_LOCKED",
          "다른 공개 스냅샷 쓰기가 진행 중입니다.",
        );
      }
      throw error;
    }

    const serialized = serializeSnapshot(candidate.snapshot);
    const outputSha256 = sha256(serialized);
    const current = readCurrentSnapshot(targetPath);
    if (current?.serialized === serialized) {
      return {
        fileName,
        contentRevision: candidate.snapshot.contentRevision,
        outputSha256,
        reused: true,
      };
    }
    assertExpectedCurrentRevision(current, candidate.expectedCurrentContentRevision);

    temporaryDescriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(temporaryDescriptor, serialized, "utf8");
    fsyncSync(temporaryDescriptor);
    closeSync(temporaryDescriptor);
    temporaryDescriptor = null;
    renameSync(temporaryPath, targetPath);

    const verified = readFileSync(targetPath, "utf8");
    const verifiedSnapshot = parseSnapshot(verified);
    if (
      !verifiedSnapshot ||
      verified !== serialized ||
      sha256(verified) !== outputSha256 ||
      verifiedSnapshot.contentRevision !== candidate.snapshot.contentRevision
    ) {
      throw new PublicSnapshotWriteError(
        "PUBLIC_SNAPSHOT_WRITE_VERIFY_FAILED",
        "쓴 공개 스냅샷의 무결성 검증에 실패했습니다.",
      );
    }
    return {
      fileName,
      contentRevision: candidate.snapshot.contentRevision,
      outputSha256,
      reused: false,
    };
  } catch (error) {
    if (error instanceof PublicSnapshotWriteError) {
      throw error;
    }
    throw new PublicSnapshotWriteError(
      "PUBLIC_SNAPSHOT_WRITE_FAILED",
      "공개 스냅샷 파일을 안전하게 쓸 수 없습니다.",
    );
  } finally {
    if (temporaryDescriptor !== null) {
      try {
        closeSync(temporaryDescriptor);
      } catch {
        // The generic write error intentionally omits private filesystem details.
      }
    }
    try {
      removeIfPresent(temporaryPath);
    } catch {
      // The caller receives no machine-specific cleanup path.
    }
    if (lockDescriptor !== null) {
      try {
        closeSync(lockDescriptor);
      } catch {
        // The lock file is still removed below when possible.
      }
      try {
        removeIfPresent(lockPath);
      } catch {
        // A stale lock is recoverable by an explicit local operator action.
      }
    }
  }
}
