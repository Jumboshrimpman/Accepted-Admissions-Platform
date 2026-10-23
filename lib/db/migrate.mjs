import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

function redactQueryParams(text) {
  if (typeof text !== "string") return undefined;
  return text.replace(/\nparams:[^\n]*/g, "");
}

function databaseErrorFields(error) {
  if (!error || typeof error !== "object") return null;
  const fields = {};
  const message = redactQueryParams(error.message);
  if (message) fields.message = message;
  if (typeof error.code === "string" && error.code) fields.code = error.code;
  if (typeof error.detail === "string" && error.detail) fields.detail = error.detail;
  if (typeof error.hint === "string" && error.hint) fields.hint = error.hint;
  return Object.keys(fields).length > 0 ? fields : null;
}

export function formatDatabaseError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details = {
    name: error.name,
    message: redactQueryParams(error.message),
    ...(typeof error.code === "string" && error.code ? { code: error.code } : {}),
    ...(typeof error.detail === "string" && error.detail ? { detail: error.detail } : {}),
    ...(typeof error.hint === "string" && error.hint ? { hint: error.hint } : {}),
    ...(error.table ? { table: error.table } : {}),
    ...(error.column ? { column: error.column } : {}),
    ...(error.constraint ? { constraint: error.constraint } : {}),
    ...(error.stack ? { stack: redactQueryParams(error.stack) } : {}),
  };

  const causes = [];
  const seen = new Set();
  let current = error.cause;
  while (current && typeof current === "object" && !seen.has(current) && causes.length < 4) {
    seen.add(current);
    const fields = databaseErrorFields(current);
    if (fields) causes.push(fields);
    current = current.cause;
  }
  if (causes.length === 1) details.cause = causes[0];
  else if (causes.length > 1) details.cause = causes;

  return JSON.stringify(details, null, 2);
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "Database migration failed: DATABASE_URL must be set. Did you forget to provision a database?",
    );
    process.exit(1);
  }

  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const migrationsFolder = fileURLToPath(new URL("./drizzle", import.meta.url));

  try {
    console.log(`Applying database migrations from ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    console.log("Database migrations applied successfully.");
  } catch (error) {
    console.error("Database migration failed with the underlying database error:");
    console.error(formatDatabaseError(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (invokedDirectly()) {
  await runMigrations();
}