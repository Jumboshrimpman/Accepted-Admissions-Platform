---
name: Clerk identity claims
description: Development Clerk sessions may omit email claims needed for server-side account linking.
---

Treat `auth.sessionClaims.email` as optional even for a valid development session. When account ownership depends on email, resolve the verified primary email through the server-side Clerk client rather than linking against a synthetic fallback.

**Why:** A valid allowlisted development session was observed without an email claim, which caused the application user to be created under a synthetic address and prevented the matching tutor profile from linking.

**How to apply:** Use the verified Clerk identity during just-in-time provisioning and return an explicit identity lookup error if it cannot be obtained; never use an email address as the access allowlist key.