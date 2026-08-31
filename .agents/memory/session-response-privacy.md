---
name: Session response privacy
description: Session APIs must expose approved scheduling fields without provider calendar metadata.
---

Session responses should be built from an explicit allowlist of scheduling and curriculum fields, never by spreading the database session row.

**Why:** Session records can gain provider metadata over time, and calendar event titles, attendees, descriptions, and locations are private to the tutor's connected calendar.

**How to apply:** Keep dashboard, session-detail, and booking response shapes explicit; add regression coverage whenever session or calendar fields change.