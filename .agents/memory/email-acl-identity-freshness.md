---
name: Email ACL identity freshness
description: Security rule for portal authorization when access is provisioned by email.
---

Email-based portal access must be evaluated from Clerk’s current primary email only when Clerk reports that address as verified. A persisted local email is account-linking data, not authorization evidence. Explicit Clerk user-ID overrides may bypass the email lookup.

**Why:** A local email can become stale after the Clerk account changes its primary address or loses verification. Trusting that stale value would preserve access after the identity no longer matches the owner-controlled allowlist.

**How to apply:** On every request that is not granted by an explicit Clerk user-ID override, fetch the Clerk user server-side, require verified primary-email status, normalize the address, and then evaluate exactly one role-specific allowlist match.