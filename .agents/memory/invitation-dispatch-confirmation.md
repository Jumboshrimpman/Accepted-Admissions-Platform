---
name: Invitation dispatch confirmation
description: A safety boundary for sending external identity invitations during account provisioning.
---

Do not send external identity invitations merely because intended addresses or environments have been confirmed. Obtain a separate, immediate confirmation that the invitations should be dispatched, then report the target and recipients before sending.

**Why:** Confirming who should eventually receive access is not necessarily authorization to notify them now. Invitation delivery is an external side effect and may be difficult to undo even when the invitation can be revoked.

**How to apply:** Keep allowlist configuration, account creation, invitation dispatch, and first sign-in as separate gates. If the user withdraws intent, revoke pending invitations and remove any newly added access entries before continuing.