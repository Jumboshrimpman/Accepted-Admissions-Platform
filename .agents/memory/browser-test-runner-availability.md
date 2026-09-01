---
name: Browser test runner availability
description: Environment constraint for authenticated real-browser validation of protected web flows
---

The Replit Playwright testing subagent can be disabled in Free mode, while the available preview screenshot tool is read-only and cannot perform sign-in or clicks.

**Why:** Protected flows need real Clerk session state and navigation, so substituting unauthenticated screenshots or weakening application auth does not validate the requested behavior.

**How to apply:** Run repository typechecks, component/API tests, workflow checks, and unauthenticated safe-state screenshots; report authenticated browser coverage as blocked until the testing runner is available.