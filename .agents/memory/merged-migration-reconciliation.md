---
name: Merged migration reconciliation
description: Why merged Drizzle migrations may need to tolerate schema objects already present in development.
---

After isolated task merges, the development database can already contain the merged schema while `drizzle.__drizzle_migrations` still lacks the corresponding main-workspace migration entries. Keep reconciliation migrations idempotent when they cover those pre-existing objects.

**Why:** Calendar and payment task merges left columns, tables, and indexes present while the main migration ledger stopped before those migrations. Strict `ADD COLUMN` and `CREATE TABLE` statements prevented the API from starting.

**How to apply:** Before changing or reverting idempotent migration statements, compare the migration ledger with `information_schema`. For merged additions, retain `IF NOT EXISTS` and conditional constraint creation so both clean databases and schema-ahead development databases migrate safely.