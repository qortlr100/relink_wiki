import { z } from "zod";
export const reviewStateSchema = z.enum(["staged", "reviewed", "published"]);
export const provenanceSchema = z.object({
  sourceFileId: z.string().min(1),
  extractorVersion: z.string().min(1),
  importRunId: z.uuid(),
  importedAt: z.iso.datetime(),
  schemaVersion: z.int().positive(),
});
export const characterSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  nameKo: z.string().min(1),
  reviewState: reviewStateSchema,
  provenance: provenanceSchema,
});
export const publicCharacterSchema = characterSchema
  .pick({ id: true, slug: true, nameKo: true })
  .extend({ reviewState: z.literal("published") });
export const publicSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  contentRevision: z.string().min(1),
  generatedAt: z.iso.datetime(),
  sourceRevision: z.string().min(1),
  characters: z.array(publicCharacterSchema),
});
export type Character = z.infer<typeof characterSchema>;
export type PublicSnapshot = z.infer<typeof publicSnapshotSchema>;
