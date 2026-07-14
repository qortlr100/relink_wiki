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
export type PublicRecord = z.infer<typeof publicRecordSchema>;
export type PublicSnapshot = z.infer<typeof publicSnapshotSchema>;
