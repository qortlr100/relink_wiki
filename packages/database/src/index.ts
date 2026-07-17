import { z } from "zod";

export * from "./migration";
export * from "./normalization-diff-repository";
export * from "./normalization-record-review-repository";
export * from "./normalization-repository";
export * from "./normalization-review-repository";
export * from "./publication-repository";
export * from "./publication-history-repository";
export * from "./review-dashboard-repository";
export * from "./schema";
export * from "./staging-import-repository";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export const databaseConfigSchema = z.object({ path: z.string().min(1) });

export function openDatabase(input: unknown) {
  const config = databaseConfigSchema.parse(input);
  const sqlite = new Database(config.path);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

export function openExistingDatabase(input: unknown) {
  const config = databaseConfigSchema.parse(input);
  const sqlite = new Database(config.path, { fileMustExist: true });
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

export function openReadonlyDatabase(input: unknown) {
  const config = databaseConfigSchema.parse(input);
  const sqlite = new Database(config.path, { fileMustExist: true, readonly: true });
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("query_only = ON");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
