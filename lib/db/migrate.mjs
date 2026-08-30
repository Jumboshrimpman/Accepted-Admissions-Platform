import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error(
    "Database migration failed: DATABASE_URL must be set. Did you forget to provision a database?",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);
const migrationsFolder = fileURLToPath(new URL("./drizzle", import.meta.url));

function formatDatabaseError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details = {
    name: error.name,
    message: error.message,
    ...(error.code ? { code: error.code } : {}),
    ...(error.detail ? { detail: error.detail } : {}),
    ...(error.hint ? { hint: error.hint } : {}),
    ...(error.table ? { table: error.table } : {}),
    ...(error.column ? { column: error.column } : {}),
    ...(error.constraint ? { constraint: error.constraint } : {}),
    ...(error.stack ? { stack: error.stack } : {}),
  };

  return JSON.stringify(details, null, 2);
}

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