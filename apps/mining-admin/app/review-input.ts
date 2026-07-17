import { z } from "zod";

export const recordIndexFormSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.int().nonnegative());

export function hasOwnKey<ObjectType extends object>(
  object: ObjectType,
  key: string | undefined,
): key is Extract<keyof ObjectType, string> {
  return key !== undefined && Object.hasOwn(object, key);
}
