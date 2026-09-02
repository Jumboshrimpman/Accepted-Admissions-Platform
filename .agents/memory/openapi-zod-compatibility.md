---
name: OpenAPI and Zod generator compatibility
description: Compatibility rule for this workspace's Orval-generated validation schemas.
---

Keep OpenAPI numeric fields as `type: number` and formatted values such as URLs or UUIDs as plain strings while the workspace catalog remains on Zod 3. Verify that generated object validators enforce every contract constraint.

**Why:** Orval 8 emits Zod 4-only `int()`, `url()`, and `uuid()` calls for OpenAPI integer and formatted-string fields, but this workspace intentionally resolves generated validators against Zod 3. It also ignores some object constraints such as `minProperties`, so a successful generation can still produce weaker runtime validation than the contract declares.

**How to apply:** Until the catalog and all Zod consumers are upgraded together, avoid incompatible formats and enforce integer, URL, UUID, and minimum-update rules in domain handlers when they are security- or behavior-critical. Inspect generated validators after adding less-common OpenAPI constraints.