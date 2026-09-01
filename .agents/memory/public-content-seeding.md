---
name: Public content seed preservation
description: How mirrored public content should be refreshed without overriding administrator-managed publication decisions.
---

Seed refreshes may update a known untouched record, but must not overwrite content after an administrator has edited or re-published it.

**Why:** Public content is database-backed and may be intentionally changed or unpublished after the initial seed. A startup upsert that always writes the mirror would silently undo those decisions.

**How to apply:** Gate one-time mirror refreshes on the record still matching the original seed shape and having no administrator owner, then leave later edits to the public-content workflow.