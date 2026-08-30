---
name: OAuth from Replit previews
description: How external OAuth authorization must navigate when the app runs inside Replit's preview iframe.
---

External provider authorization pages must be opened as a top-level browser navigation from Replit previews, not loaded into the preview iframe.

**Why:** Google blocks OAuth pages embedded in frames and can display only a generic 403 “you do not have access to this page,” even when the client, audience, test user, redirect URI, and scopes are correct.

**How to apply:** Use a normal link or form with `target="_top"` to an authenticated server route that immediately redirects to the provider. Avoid fetching an authorization URL and assigning `window.location` inside the preview frame.