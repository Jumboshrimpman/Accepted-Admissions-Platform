---
name: OpenAPI and Zod generator compatibility
description: Compatibility rule for this workspace's Orval-generated validation schemas.
---

Keep OpenAPI numeric fields as `type: number` and formatted values such as URLs or UUIDs as plain strings while the workspace catalog remains on Zod 3. Pin `override.zod.version: 3` in `lib/api-spec/orval.config.ts` so codegen cannot emit Zod 4-only APIs. `patch-generated-zod3.mjs` remains a post-Orval safety net for `looseObject`. `check-zod3-compat.mjs` must stay green. Verify that generated object validators enforce every contract constraint.

**Why:** Orval 8's default `'auto'` target falls back to Zod 4 (`looseObject`, `strictObject`, `int()`, `url()`, `uuid()`) when it cannot resolve the workspace `catalog:` Zod version. Those methods are undefined on Zod 3.25 and crash API boot. The live hotfix (#81) rewrites `looseObject` after generation; the pin is the durable generator fix. Orval also ignores some object constraints such as `minProperties`.

**How to apply:** Until the catalog and all Zod consumers are upgraded together, keep the Zod 3 pin, leave the post-codegen patch in place, avoid incompatible formats, and enforce integer, URL, UUID, and minimum-update rules in domain handlers when they are security- or behavior-critical. Inspect generated validators after adding less-common OpenAPI constraints.
