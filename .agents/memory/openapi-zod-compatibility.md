---
name: OpenAPI and Zod generator compatibility
description: Compatibility rule for this workspace's Orval-generated validation schemas.
---

Keep OpenAPI numeric fields as `type: number` and URL values as plain strings while the workspace catalog remains on Zod 3.

**Why:** Orval 8 emits Zod 4-only `int()` and `url()` calls for OpenAPI integer and URI formats, but this workspace intentionally resolves generated validators against Zod 3, causing library typechecks to fail after successful generation.

**How to apply:** When extending the API contract, avoid OpenAPI `integer` and `format: uri` until the catalog and all Zod consumers are upgraded together. Enforce integer or URL rules in domain handlers when they are security- or behavior-critical.