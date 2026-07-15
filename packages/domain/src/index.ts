import { z } from "zod";
export const reviewStateSchema = z.enum(["staged", "reviewed", "published"]);
export const normalizedCategorySchema = z.enum(["character", "weapon", "sigil", "skill"]);
export const recordIdSchema = z
  .string()
  .min(1, "식별자는 비어 있을 수 없습니다.")
  .max(128, "식별자는 128자 이하여야 합니다.")
  .superRefine((identifier, context) => {
    if (identifier !== identifier.trim()) {
      context.addIssue({
        code: "custom",
        message: "식별자는 앞뒤 공백을 포함할 수 없습니다.",
      });
    }
    if (/[\p{Cc}\p{Cf}]/u.test(identifier)) {
      context.addIssue({
        code: "custom",
        message: "식별자는 제어 문자를 포함할 수 없습니다.",
      });
    }
  });
export const provenanceSchema = z.object({
  sourceFileId: z.string().min(1),
  extractorVersion: z.string().min(1),
  importRunId: z.uuid(),
  importedAt: z.iso.datetime(),
  schemaVersion: z.int().positive(),
});
export const normalizedProvenanceSchema = provenanceSchema.extend({
  sourceRecordId: z.string().min(1),
});
export const normalizedRecordSchema = z.object({
  category: normalizedCategorySchema,
  id: recordIdSchema,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  nameKo: z.string().trim().min(1),
  reviewState: reviewStateSchema,
  provenance: normalizedProvenanceSchema,
});
export const normalizedDiffFieldSchema = z.enum(["id", "slug", "nameKo"]);
export const normalizedDiffStatusSchema = z.enum(["added", "changed", "removed", "unchanged"]);
export const normalizedDiffRecordValueSchema = normalizedRecordSchema.pick({
  id: true,
  slug: true,
  nameKo: true,
});
const normalizedRecordDiffKeySchema = z.object({
  category: normalizedCategorySchema,
  sourceRecordId: z.string().min(1),
});
const unchangedFieldsSchema = z.array(normalizedDiffFieldSchema).max(0);
const changedFieldsSchema = z
  .array(normalizedDiffFieldSchema)
  .min(1)
  .refine((fields) => new Set(fields).size === fields.length, "변경 필드는 중복될 수 없습니다.");
export const normalizedRecordDiffSchema = z
  .discriminatedUnion("status", [
    normalizedRecordDiffKeySchema.extend({
      status: z.literal("added"),
      changedFields: unchangedFieldsSchema,
      baseline: z.null(),
      candidate: normalizedDiffRecordValueSchema,
    }),
    normalizedRecordDiffKeySchema.extend({
      status: z.literal("changed"),
      changedFields: changedFieldsSchema,
      baseline: normalizedDiffRecordValueSchema,
      candidate: normalizedDiffRecordValueSchema,
    }),
    normalizedRecordDiffKeySchema.extend({
      status: z.literal("removed"),
      changedFields: unchangedFieldsSchema,
      baseline: normalizedDiffRecordValueSchema,
      candidate: z.null(),
    }),
    normalizedRecordDiffKeySchema.extend({
      status: z.literal("unchanged"),
      changedFields: unchangedFieldsSchema,
      baseline: normalizedDiffRecordValueSchema,
      candidate: normalizedDiffRecordValueSchema,
    }),
  ])
  .superRefine((record, context) => {
    if (record.status !== "changed" && record.status !== "unchanged") {
      return;
    }
    const actualChangedFields = normalizedDiffFieldSchema.options.filter(
      (field) => record.baseline[field] !== record.candidate[field],
    );
    const declaredChangedFields = new Set(record.changedFields);
    const fieldsMatch =
      actualChangedFields.length === record.changedFields.length &&
      actualChangedFields.every((field) => declaredChangedFields.has(field));
    if (!fieldsMatch) {
      context.addIssue({
        code: "custom",
        path: ["changedFields"],
        message: "변경 필드가 전후 레코드 값과 일치하지 않습니다.",
      });
    }
  });
export const normalizationDiffSchema = z
  .object({
    baselineNormalizationRunId: z.uuid(),
    candidateNormalizationRunId: z.uuid(),
    schemaVersion: z.int().positive(),
    summary: z.object({
      added: z.int().nonnegative(),
      changed: z.int().nonnegative(),
      removed: z.int().nonnegative(),
      unchanged: z.int().nonnegative(),
    }),
    records: z.array(normalizedRecordDiffSchema),
  })
  .superRefine((diff, context) => {
    for (const status of normalizedDiffStatusSchema.options) {
      const actualCount = diff.records.filter((record) => record.status === status).length;
      if (diff.summary[status] !== actualCount) {
        context.addIssue({
          code: "custom",
          path: ["summary", status],
          message: "요약 건수가 레코드 비교 결과와 일치하지 않습니다.",
        });
      }
    }
  });
export const backupReceiptSchema = z
  .object({
    reference: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/, "백업 참조에는 경로나 공백을 포함할 수 없습니다."),
    createdAt: z.iso.datetime(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
const acceptedNormalizationBaselineFields = {
  normalizationRunId: z.uuid(),
  schemaVersion: z.int().positive(),
  acceptedAt: z.iso.datetime(),
  backup: backupReceiptSchema,
};
function backupPrecedesAcceptance(acceptance: {
  acceptedAt: string;
  backup: { createdAt: string };
}): boolean {
  return Date.parse(acceptance.backup.createdAt) <= Date.parse(acceptance.acceptedAt);
}
export const normalizationAcceptanceSchema = z
  .object({
    ...acceptedNormalizationBaselineFields,
    previousBaselineNormalizationRunId: z.uuid().nullable(),
  })
  .strict()
  .refine(backupPrecedesAcceptance, {
    path: ["backup", "createdAt"],
    message: "백업은 승인 이전에 완료되어야 합니다.",
  });
export const acceptedNormalizationBaselineSchema = z
  .object(acceptedNormalizationBaselineFields)
  .strict()
  .refine(backupPrecedesAcceptance, {
    path: ["backup", "createdAt"],
    message: "백업은 승인 이전에 완료되어야 합니다.",
  });
export const characterSchema = z.object({
  id: recordIdSchema,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  nameKo: z.string().min(1),
  reviewState: reviewStateSchema,
  provenance: provenanceSchema,
});
export const publicCharacterSchema = characterSchema
  .pick({ id: true, slug: true, nameKo: true })
  .extend({ reviewState: z.literal("published") });
export const publicRecordSchema = publicCharacterSchema;
export const publicSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  contentRevision: z.string().min(1),
  generatedAt: z.iso.datetime(),
  sourceRevision: z.string().min(1),
  characters: z.array(publicCharacterSchema),
  weapons: z.array(publicRecordSchema),
  sigils: z.array(publicRecordSchema),
  skills: z.array(publicRecordSchema),
});
export type Character = z.infer<typeof characterSchema>;
export type NormalizedRecord = z.infer<typeof normalizedRecordSchema>;
export type NormalizationDiff = z.infer<typeof normalizationDiffSchema>;
export type NormalizedRecordDiff = z.infer<typeof normalizedRecordDiffSchema>;
export type BackupReceipt = z.infer<typeof backupReceiptSchema>;
export type NormalizationAcceptance = z.infer<typeof normalizationAcceptanceSchema>;
export type AcceptedNormalizationBaseline = z.infer<typeof acceptedNormalizationBaselineSchema>;
export type PublicRecord = z.infer<typeof publicRecordSchema>;
export type PublicSnapshot = z.infer<typeof publicSnapshotSchema>;
