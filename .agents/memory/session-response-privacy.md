---
name: Session response privacy
description: Session APIs must expose approved scheduling fields without provider calendar metadata.
---

Session responses should be built from an explicit allowlist of scheduling and curriculum fields, never by spreading the database session row. If a response includes participant-derived text, apply per-session participant authorization before deriving or serializing that text; course-level or subject-level access alone is insufficient.

**Why:** Session records can gain provider metadata over time, and calendar event titles, attendees, descriptions, and locations are private to the tutor's connected calendar. Canonical titles can also reveal a client’s identity and appointment time to another member of a shared course unless list endpoints filter each session by participant.

**How to apply:** Keep dashboard, course-list, session-detail, and booking response shapes explicit. Test shared-course scenarios with multiple clients whenever participant names or calendar fields change.