---
name: Assessment result finalization
description: Durable timing and grading behavior for timed learning assessments
---

An assessment that reaches its deadline must persist its graded result at the first server read or submit boundary, not merely change status to expired.

**Why:** Students can leave an expired attempt and return later; a status-only transition loses the durable feedback experience and makes repeat reads inconsistent with explicit submission.

**How to apply:** Keep expiry grading idempotent with explicit submission, persist the question snapshot and deterministic/provider analysis together, and expose the same result contract to authorized students and tutors.