import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openReadonlyDatabase } from "@relink-wiki/database";
import { publicSnapshotSchema } from "@relink-wiki/domain";
import { z } from "zod";
import { createPublicSnapshotPreview, PublicSnapshotPreviewError } from "./index";

const commandEnvironmentSchema = z.object({
  RELINK_DATABASE_PATH: z.string().trim().min(1),
});

const outputPath = fileURLToPath(
  new URL("../../../data/exports/public-snapshot-preview.v1.json", import.meta.url),
);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function removeTemporaryFile(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // A later retry uses a different temporary filename.
  }
}

function run(): void {
  const environment = commandEnvironmentSchema.safeParse(process.env);
  if (!environment.success) {
    throw new Error("DATABASE_PATH_UNSET");
  }

  const connection = openReadonlyDatabase({ path: environment.data.RELINK_DATABASE_PATH });
  try {
    const snapshot = createPublicSnapshotPreview(connection.db, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
    });
    const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
    const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;

    mkdirSync(dirname(outputPath), { recursive: true });
    try {
      writeFileSync(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
      renameSync(temporaryPath, outputPath);
    } finally {
      removeTemporaryFile(temporaryPath);
    }

    const verified = readFileSync(outputPath, "utf8");
    const verification = publicSnapshotSchema.safeParse(JSON.parse(verified) as unknown);
    if (!verification.success || verified !== serialized) {
      throw new Error("PREVIEW_VERIFY_FAILED");
    }

    console.log(
      JSON.stringify({
        code: "PUBLIC_SNAPSHOT_PREVIEW_CREATED",
        schemaVersion: snapshot.schemaVersion,
        generatedAt: snapshot.generatedAt,
        contentRevision: snapshot.contentRevision,
        recordCounts: snapshot.recordCounts,
        outputSha256: sha256(serialized),
      }),
    );
  } finally {
    connection.sqlite.close();
  }
}

try {
  run();
} catch (error) {
  if (error instanceof PublicSnapshotPreviewError) {
    console.error(
      JSON.stringify({
        code: error.code,
        message: error.message,
        details: error.details,
      }),
    );
  } else if (error instanceof Error && error.message === "DATABASE_PATH_UNSET") {
    console.error(
      JSON.stringify({
        code: "DATABASE_PATH_UNSET",
        message: "RELINK_DATABASE_PATH를 비공개 실행 환경에 설정해야 합니다.",
      }),
    );
  } else {
    console.error(
      JSON.stringify({
        code: "PUBLIC_SNAPSHOT_PREVIEW_WRITE_FAILED",
        message: "공개 스냅샷 미리보기 파일을 생성하고 검증할 수 없습니다.",
      }),
    );
  }
  process.exitCode = 1;
}
