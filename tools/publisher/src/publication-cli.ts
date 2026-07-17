import { PublicationHistoryError } from "@relink-wiki/database";
import { PublicSnapshotWriteError } from "./snapshot-writer";
import {
  PublicSnapshotPublicationCommandError,
  runPublicSnapshotPublicationCommand,
} from "./publication-command";

try {
  const result = runPublicSnapshotPublicationCommand({
    databasePath: process.env.RELINK_DATABASE_PATH,
    requestPath: process.env.RELINK_PUBLICATION_REQUEST_PATH,
  });
  console.log(JSON.stringify(result));
} catch (error) {
  if (
    error instanceof PublicSnapshotPublicationCommandError ||
    error instanceof PublicSnapshotWriteError ||
    error instanceof PublicationHistoryError
  ) {
    console.error(JSON.stringify({ code: error.code, message: error.message }));
  } else {
    console.error(
      JSON.stringify({
        code: "PUBLIC_SNAPSHOT_PUBLICATION_FAILED",
        message: "공개 스냅샷 발행 명령을 안전하게 완료할 수 없습니다.",
      }),
    );
  }
  process.exitCode = 1;
}
