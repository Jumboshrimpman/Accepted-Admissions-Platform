---
name: OAuth from Replit previews
description: How external OAuth authorization must navigate when the app runs inside Replit's preview iframe.
---

External provider authorization pages must be opened in a separate browser window from Replit previews, not loaded into the preview iframe or sent through blocked top-frame navigation.

**Why:** Google blocks OAuth pages embedded in frames and can display only a generic 403 “you do not have access to this page,” even when the client, audience, test user, redirect URI, and scopes are correct.

**How to apply:** From the user click, synchronously open a named window at an authenticated server route that immediately redirects to the provider. If the browser blocks it, show a direct `target="_blank"` retry link and an explicit status message.