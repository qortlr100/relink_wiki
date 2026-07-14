import { publicSnapshotSchema, type PublicSnapshot } from "@relink-wiki/domain";

export const publicSnapshotLoadErrorCode = "PUBLIC_SNAPSHOT_INVALID";

export class PublicSnapshotLoadError extends Error {
  readonly code = publicSnapshotLoadErrorCode;

  constructor(cause?: unknown) {
    super("공개 데이터 스냅샷을 불러올 수 없습니다.", { cause });
    this.name = "PublicSnapshotLoadError";
  }
}

export function loadPublicSnapshot(snapshotInput: unknown): PublicSnapshot {
  const result = publicSnapshotSchema.safeParse(snapshotInput);
  if (!result.success) {
    throw new PublicSnapshotLoadError(result.error);
  }
  return result.data;
}
