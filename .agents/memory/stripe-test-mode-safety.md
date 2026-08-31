---
name: Stripe test-mode safety
description: How the Stripe regression runner relates to the active Replit Stripe connection
---

`STRIPE_TEST_MODE=1` enables the provider-backed regression cases, but it does not change the mode of the Stripe connection used by the Replit connector. Always verify the Stripe balance response reports `livemode: false` before creating any fixtures.

**Why:** A workspace can have an added Stripe connection that points at a live account even while the test runner is explicitly enabled. The regression suite's mode guard is the safety boundary that prevents accidental live products, prices, customers, payments, and refunds.

**How to apply:** Treat a `livemode: true` result as a configuration blocker. Do not bypass the guard, add live test resources, or assume an environment variable changes the connector's account mode; switch to the workspace's Stripe sandbox configuration before rerunning provider tests.