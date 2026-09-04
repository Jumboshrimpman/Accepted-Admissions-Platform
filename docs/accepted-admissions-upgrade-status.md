# Accepted Admissions platform upgrade status

## Current SAT catalog (source of truth: code + migrations 0023/0024)

Public checkout sells two prepaid credit products. Funds settle to Accepted Admissions (`tutorShareCents = 0`).

- Single SAT session — **$130** for 1 hour (1 credit)
- Ten SAT session package — **$1,300** for 10 hours ($130/hour)

The older 5-hour / $175 / $800 / $1,500 / $2,400 package list is retired. Live Wix `/book-online` still lists $175 SAT and other services; those non-SAT services are inquiry-only in this app.

## Implemented on main (post mega-merge)

- Viewer role, public SAT / Our Team / Past Success / Client Request routes, Stripe Checkout, booking with Xavier and Eunice, locally hosted team portraits and school logos, admin people provisioning, AI-native Fall SAT curriculum, dashboard cleanup.
- Tutor payout / Stripe Connect surfaces remain **deferred** (schema leftovers only; no tutor payout UI).
- Google Calendar OAuth is implemented; live availability still needs tutor consent.

## Fixed in this harden pass

- Reconciled status-doc pricing with the $130 / $1,300 catalog.
- Typecheck: `public-team-roster.test.ts` used a multi-line `.ts` import that `tsc` rejected after the Wix-media merge.
- Landing test no longer forbids the word “package” (it conflicted with the ten-hour offer copy).
- Removed leftover `useListTutorPayouts` test mocks from payout-surface removal.
- Deleted unjournaled duplicate-numbered SQL files (`0011_last_rocket_raccoon`, `0013_mean_thor_girl`, `0014_square_krista_starr`). `0018_orphan_ledger_repair` remains the idempotent repair. Added a journal↔SQL 1:1 test.
- Asserted approved team portraits and school logos exist under `artifacts/accepted-admissions/public/media/`.
- Public-site polish for replacing Wix:
  - Redirect `/book-online` → `/sat`; `/campus-tours` and `/service-page/*` → `/client-request`.
  - Visitor 404 (no developer “forgot to add the page” copy) with links home / SAT / guidance.
  - Footer contact `info@acceptedadmissions.org` (already public on the live site).
  - Home credibility line names Harvard students and recent graduates.
  - SAT page points other live-site services and case-by-case financial aid to the guidance form.
  - SAT public-content seed copy updated for the two-product catalog (untouched rows only).

## External services (not labeled live)

- Google Calendar: OAuth is wired. Booking-eligible tutors must complete consent from `/tutor`.
- Stripe: Checkout and signed webhooks are implemented. Configure `STRIPE_WEBHOOK_SECRET` in host secrets (not Replit) before accepting signed events. Set `APP_ORIGIN` to the canonical HTTPS origin.
- Email: not configured. Client requests are stored; no external acknowledgement is sent.
- Otter.ai: disconnected.

## Owner input still required

1. **Clerk invites** — confirm production/development addresses, invite in the matching Clerk instance, then put Clerk user IDs in `ACCEPTED_*_CLERK_USER_IDS` (see `docs/accepted-admissions-provisioning.md`). Do not enable public sign-up.
2. **Stripe webhook signing secret** — set `STRIPE_WEBHOOK_SECRET` on the deployment host and complete a test-mode Checkout / invoice / refund pass before live charges.
3. **Google Calendar consent** — Xavier (`xsfam6@gmail.com`) and Eunice (`eunice_chon@berkeley.edu`) both need `/tutor` Google consent before students can see live availability. Eunice’s Clerk invitation/allowlisting is still an owner action if not already done.
4. **Policy copy** — final cancellation, credit-restoration, invoice, refund, privacy-policy, and financial-aid rules. The public form has a short storage notice only; do not treat that as a legal privacy policy.
5. **Optional publish decisions** — whether to show the live-site phone (`757-332-4244`) and Virginia Beach address on the new footer; whether remaining Wix pages (blog posts, campus-tour product SKUs) should keep inquiry-only redirects.

## Verification

- Workspace typecheck, API and frontend tests, and production builds are the checks for this pass (see the PR). Database-backed API tests need `DATABASE_URL`; they are not assumed green in environments without Postgres.
- Public media files for the approved roster and seven school logos are present in-repo.
