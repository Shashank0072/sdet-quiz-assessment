import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function getDatabasePath() {
  const configured = process.env.DATABASE_URL;

  if (configured?.startsWith("file:")) {
    return configured.slice("file:".length);
  }

  if (configured && configured !== "") {
    return configured;
  }

  return resolve(packageRoot, "data", "quiz.sqlite");
}

export function createDatabase() {
  const path = getDatabasePath();
  mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA synchronous = NORMAL");
  sqlite.run("PRAGMA temp_store = MEMORY");
  sqlite.run("PRAGMA locking_mode = NORMAL");
  sqlite.run("PRAGMA busy_timeout = 15000");
  sqlite.run("PRAGMA wal_autocheckpoint = 1000");
  sqlite.run("PRAGMA cache_size = -20000");

  return drizzle(sqlite, { schema });
}

export const db = createDatabase();

export type QuizDb = ReturnType<typeof createDatabase>;
