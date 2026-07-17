"use server";

import {
  acceptFullyReviewedNormalizationRun,
  NormalizationRecordReviewError,
  openDatabase,
  saveNormalizationRecordReviewDecision,
} from "@relink-wiki/database";
import {
  PublicSnapshotPublicationCommandError,
  runPublicSnapshotPublicationCommand,
} from "@relink-wiki/publisher";
import { redirect } from "next/navigation";
import { z } from "zod";

const fingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const decisionFormSchema = z.object({
  comparisonFingerprint: fingerprintSchema,
  recordIndex: z.coerce.number().int().nonnegative(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500),
});
const acceptanceFormSchema = z.object({
  comparisonFingerprint: fingerprintSchema,
  confirmation: z.literal("ACCEPT_FULLY_REVIEWED_NORMALIZATION_V1"),
  backupReference: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/),
  backupCreatedAt: z.iso.datetime(),
  backupSha256: sha256Schema,
});
const publicationFormSchema = z.object({
  confirmation: z.literal("PUBLISH_REVIEWED_PUBLIC_SNAPSHOT_V1"),
});

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function redirectToNotice(notice: string): never {
  redirect(`/?notice=${encodeURIComponent(notice)}#review`);
}

function reviewErrorNotice(error: unknown): string {
  if (error instanceof NormalizationRecordReviewError) {
    switch (error.code) {
      case "NORMALIZATION_RECORD_REVIEW_COMPARISON_STALE":
        return "review_stale";
      case "NORMALIZATION_RECORD_REVIEW_INCOMPLETE":
        return "review_incomplete";
      case "NORMALIZATION_RECORD_REVIEW_REJECTED":
        return "review_rejected";
      case "NORMALIZATION_RECORD_REVIEW_INPUT_INVALID":
      case "NORMALIZATION_RECORD_REVIEW_RECORD_INVALID":
        return "review_input_invalid";
      case "NORMALIZATION_RECORD_REVIEW_DATABASE_INVALID":
        return "database_invalid";
    }
  }
  return "database_invalid";
}

// React Server Actions require async exports even though the local SQLite work is synchronous.
// eslint-disable-next-line @typescript-eslint/require-await
export async function saveRecordDecisionAction(formData: FormData): Promise<void> {
  const databasePath = process.env.RELINK_DATABASE_PATH?.trim();
  if (!databasePath) {
    redirectToNotice("database_unset");
  }
  const validation = decisionFormSchema.safeParse({
    comparisonFingerprint: formText(formData, "comparisonFingerprint"),
    recordIndex: formText(formData, "recordIndex"),
    decision: formText(formData, "decision"),
    note: formText(formData, "note"),
  });
  if (!validation.success) {
    redirectToNotice("review_input_invalid");
  }

  let notice = "decision_saved";
  let connection: ReturnType<typeof openDatabase> | undefined;
  try {
    connection = openDatabase({ path: databasePath });
    saveNormalizationRecordReviewDecision(connection.db, {
      ...validation.data,
      note: validation.data.note || null,
      decidedAt: new Date().toISOString(),
    });
  } catch (error) {
    notice = reviewErrorNotice(error);
  } finally {
    connection?.sqlite.close();
  }
  redirectToNotice(notice);
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function acceptCandidateAction(formData: FormData): Promise<void> {
  const databasePath = process.env.RELINK_DATABASE_PATH?.trim();
  if (!databasePath) {
    redirectToNotice("database_unset");
  }
  const validation = acceptanceFormSchema.safeParse({
    comparisonFingerprint: formText(formData, "comparisonFingerprint"),
    confirmation: formText(formData, "confirmation"),
    backupReference: formText(formData, "backupReference"),
    backupCreatedAt: formText(formData, "backupCreatedAt"),
    backupSha256: formText(formData, "backupSha256"),
  });
  if (!validation.success) {
    redirectToNotice("acceptance_input_invalid");
  }

  let notice = "candidate_accepted";
  let connection: ReturnType<typeof openDatabase> | undefined;
  try {
    connection = openDatabase({ path: databasePath });
    acceptFullyReviewedNormalizationRun(connection.db, {
      comparisonFingerprint: validation.data.comparisonFingerprint,
      acceptedAt: new Date().toISOString(),
      backup: {
        reference: validation.data.backupReference,
        createdAt: validation.data.backupCreatedAt,
        sha256: validation.data.backupSha256,
      },
    });
  } catch (error) {
    notice = reviewErrorNotice(error);
  } finally {
    connection?.sqlite.close();
  }
  redirectToNotice(notice);
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function publishSnapshotAction(formData: FormData): Promise<void> {
  const databasePath = process.env.RELINK_DATABASE_PATH?.trim();
  const requestPath = process.env.RELINK_PUBLICATION_REQUEST_PATH?.trim();
  if (!databasePath || !requestPath) {
    redirectToNotice("publication_environment_unset");
  }
  const validation = publicationFormSchema.safeParse({
    confirmation: formText(formData, "confirmation"),
  });
  if (!validation.success) {
    redirectToNotice("publication_confirmation_invalid");
  }

  let notice = "publication_completed";
  try {
    runPublicSnapshotPublicationCommand({ databasePath, requestPath });
  } catch (error) {
    notice =
      error instanceof PublicSnapshotPublicationCommandError
        ? "publication_request_invalid"
        : "publication_failed";
  }
  redirectToNotice(notice);
}
