import { z } from "zod";

export const recordIndexFormSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.int().nonnegative());

const reviewNavigationSchema = z.object({
  category: z.enum(["all", "character", "weapon", "sigil", "skill"]).catch("all"),
  diff: z.enum(["all", "added", "changed", "removed"]).catch("all"),
  decision: z.enum(["all", "pending", "approved", "rejected"]).catch("all"),
  page: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.int().positive())
    .catch(1),
});

export function buildReviewNoticeHref(notice: string, input: unknown): string {
  const navigation = reviewNavigationSchema.parse(input);
  const query = new URLSearchParams({ notice });
  if (navigation.category !== "all") query.set("category", navigation.category);
  if (navigation.diff !== "all") query.set("diff", navigation.diff);
  if (navigation.decision !== "all") query.set("decision", navigation.decision);
  if (navigation.page > 1) query.set("page", String(navigation.page));
  return `/?${query.toString()}#review`;
}

export function hasOwnKey<ObjectType extends object>(
  object: ObjectType,
  key: string | undefined,
): key is Extract<keyof ObjectType, string> {
  return key !== undefined && Object.hasOwn(object, key);
}
