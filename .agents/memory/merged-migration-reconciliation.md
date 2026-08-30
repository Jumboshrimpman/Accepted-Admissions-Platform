---
name: Migration ledger drift
description: Why Drizzle migrations may need to tolerate schema objects that already exist.
---

Keep reconciliation migrations idempotent when the database schema may be ahead of the recorded migration ledger.

**Why:** Branch integration or interrupted migration bookkeeping can leave columns, tables, or indexes present without their expected ledger entries. Strict creation statements then prevent startup.

**How to apply:** Compare the migration ledger with `information_schema`; use `IF NOT EXISTS` and conditional constraint creation when both clean and schema-ahead databases must migrate safely.