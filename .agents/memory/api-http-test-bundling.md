---
name: API HTTP test bundling
description: Why API tests that import the production router use an esbuild test entry.
---

Route-level HTTP tests that import the production API router should run through the API package’s esbuild toolchain rather than Node’s native TypeScript stripping.

**Why:** The server source and generated workspace packages use extensionless ESM imports that esbuild resolves, while Node’s strip-only loader does not. Some server TypeScript syntax also exceeds strip-only support. Direct router imports therefore fail before tests execute even though production builds correctly.

**How to apply:** Keep pure library tests on the fast native test runner. Put tests that mount the production router in a dedicated HTTP test entry and compile that entry with the existing esbuild dependency before invoking Node’s test runner.