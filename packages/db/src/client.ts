import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator"; // ADD THIS
import * as schema from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const DB_PATH = process.env.DATABASE_URL || resolve(PROJECT_ROOT, "data", "groffee.sqlite");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

const MIGRATIONS_FOLDER = resolve(__dirname, "..", "migrations");
migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

export type DB = typeof db;
