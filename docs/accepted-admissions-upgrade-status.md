# Accepted Admissions platform upgrade status

## Current SAT catalog (source of truth: code + migrations 0023/0024)

Public checkout sells two prepaid credit products. Funds settle to Accepted Admissions (`tutorShareCents = 0`).

- Single SAT session — **$130** for 1 hour (1 credit)
- Ten SAT session package — **$1,300** for 10 hours ($130/hour)

The older 5-hour / $175 / $800 / $1,500 / $2,400 package list is retired. Live Wix `/book-online` still lists $175 SAT and other services; those non-SAT services are inquiry-only in this app.

## Real clients (owner briefing)

### Taito Goto (student, Japan) — billing out of scope

- Pays **outside** the platform. Portal hides SAT credits and the prepaid booking card (`selfServeSatBooking = false` when the subject email is `taito0525@gmail.com`).
- SAT tutor: **Eunice Chon**. English tutor: **Nika Raiffe**.
- Seeded Fall 2026 plan: 12 sessions (~9 SAT + ~3 English), 9pm JST, shared Meet `https://meet.google.com/rih-iayt-okb`.
- Workflow today: Sama creates Google Calendar invites → Meet with the tutor.
- **In product now:** student and tutor dashboards (and session pages) offer **Join meeting** plus **Open calendar** for each upcoming date. If Google has stored an event `htmlLink`, that URL is used; otherwise the day view in Google Calendar opens for that session timezone (never provider event IDs).
- Curriculum: Sama authors in `/admin/curriculum`. Student + assigned tutor open the session dashboard and see published blocks, assignments, and attached library assets.

### Michelle Makarem (client) — prepaid book/pay in scope

- Primary SAT tutor **Xavier Morales**; can also book **Eunice Chon**. Nika is not on the SAT booking roster.
- Path: buy **$130 / 1 credit** or **$1,300 / 10 credits** on `/sat` (Stripe Checkout) → spend one credit per hour on the portal booking card against the selected tutor’s live Google Calendar.
- Curriculum is optional. Shared SAT practice tests / mini-sections can be attached to a booked session from the admin library (same building-block model as Taito).

Xavier payout tracking stays **out** (schema leftovers only; no tutor payout UI).

Migration `0026_xavier_email_xaver_rmz6` corrects Xavier’s live email from the 0008 alias `xsfam6@gmail.com` to `xaver.rmz6@gmail.com` on `tutor_profiles`, `users`, and `portal_access_grants`. Historical migration 0008 is left unchanged.

Migration `0034_retire_duplicate_xavier_clerk` soft-retires the duplicate Production Clerk user `user_3IsvKVDGAg5KdvwHhvODf2VFqtd` (wrong email) and keeps `user_3IxUfoT1xRnDsqhlx5NN1eGfRg6` + `xaver.rmz6@gmail.com` as the canonical SAT tutor. Sessions and relationships are remapped when safe. If Railway still has `ACCEPTED_SAT_TUTOR_CLERK_USER_IDS`, remove the retired id and include the canonical id; DB grants remain the source of truth. The retired Clerk user may be deleted manually in the Clerk Dashboard after that allowlist cleanup. This app does not send Clerk invites or call Clerk delete.

## Shared Google Meet collision

The Fall room `https://meet.google.com/rih-iayt-okb` is assigned to Fall 2026 curriculum sessions and to SAT self-serve bookings. Availability omits occupied slots; booking (and admin session create/update) returns `SCHEDULE_CONFLICT` when another active session already claims that room. This covers Michelle booking Xavier/Eunice at the same time as Taito’s Eunice/Nika Fall sessions.

## Curriculum building-block model

Admin library at `/admin/curriculum` → Content tools → **Library**:

- Reusable assets: full SAT practice test, mini-section, or resource (title, notes, shared URL).
- **Attach to a session** (roadmap date / session card) clones the asset as a published curriculum block on that session dashboard.
- Students and tutors open the session view and see the assigned block. Existing AI-native assignments, adaptive prep, and per-session materials are unchanged.

Migration `0025_curriculum_library_assets` adds `curriculum_library_assets` and optional `curriculum_blocks.library_asset_id`.

## Implemented on main (post mega-merge)

- Viewer role, public SAT / Our Team / Past Success / Client Request routes, Stripe Checkout, booking with Xavier and Eunice, locally hosted team portraits and school logos, admin people provisioning, AI-native Fall SAT curriculum, dashboard cleanup.
- Tutor payout / Stripe Connect surfaces remain **deferred** (schema leftovers only; no tutor payout UI).
- Google Calendar OAuth is implemented; live availability still needs tutor consent.

## Fixed / added in this harden pass

- Reconciled status-doc pricing with the $130 / $1,300 catalog.
- Typecheck, landing copy, payout-mock leftovers, unjournaled SQL, public-site Wix cutover polish (see prior commit).
- **A)** Meet + calendar deep-links on student dashboard (next meeting **and** each roadmap row), tutor dashboard, session pages, course lists, booking card, and admin session cards.
- **B)** Curriculum library + attach-to-session (extends session `curriculum_blocks`, does not rewrite adaptive curriculum).
- **C)** Michelle booking: Xavier **or** Eunice; $130 single-hour or $1,300 / 10-credit package; zero-credit state points at `/sat`. Taito’s self-serve SAT checkout/booking is hidden.
- **D)** Xavier payout tracking still not exposed.

## Done vs owner-only

| Item | Status |
| --- | --- |
| Session Meet + calendar one-click (Taito / Eunice / Nika dashboards) | **Done in code** (live Google event links appear after calendar invites exist / `htmlLink` is stored) |
| Curriculum library + attach to a session date | **Done in code** (Sama authors in admin; no copyrighted SAT PDFs are seeded) |
| Michelle books Xavier or Eunice; $130 or 10-credit package | **Done in code** (live slots still need Google consent) |
| Hide Taito billing; keep Michelle prepaid path | **Done in code** |
| Keep Xavier payout tracking out | **Done** |
| Clerk invites + `ACCEPTED_*_CLERK_USER_IDS` | **Owner-only for admin/viewer.** Tutors/students provisioned under People do not need Railway allowlist updates. |
| `STRIPE_WEBHOOK_SECRET` on the deployment host (not Replit) | **Owner-only** |
| Google Calendar consent: Xavier `xaver.rmz6@gmail.com`, Eunice `eunice_chon@berkeley.edu` from `/tutor` | **Owner-only** |
| Policy copy (cancel / refund / privacy / financial aid) | **Owner-only** |
| Optional publish of live-site phone / Virginia Beach address | **Owner-only** |

Do not invent or commit secrets.

## External services (not labeled live)

- Google Calendar: OAuth is wired. Booking-eligible tutors must complete consent from `/tutor`.
- Stripe: Checkout and signed webhooks are implemented. Configure `STRIPE_WEBHOOK_SECRET` in host secrets (not Replit) before accepting signed events. Set `APP_ORIGIN` to the canonical HTTPS origin.
- Email: not configured. Client requests are stored; no external acknowledgement is sent.
- Otter.ai: disconnected.

## Owner input still required

1. **Clerk access** — keep public sign-up disabled. Administrators and viewers still use `ACCEPTED_ADMIN_*` / `ACCEPTED_VIEWER_*`. Tutors and students should be provisioned from `/admin/curriculum?section=people`; that creates or links the Production Clerk user without an invitation email and does not require a Railway allowlist change.
2. **Stripe webhook signing secret** — set `STRIPE_WEBHOOK_SECRET` on the deployment host and complete a test-mode Checkout / invoice / refund pass before live charges. Michelle cannot receive credits until the webhook marks payment verified.
3. **Google Calendar consent** — Xavier must sign in at `/tutor` with **`xaver.rmz6@gmail.com`** (not `xsfam6@gmail.com`) and complete Google Calendar OAuth. Eunice (`eunice_chon@berkeley.edu`) also needs `/tutor` Google consent before Michelle can see live availability. Eunice’s Clerk invitation/allowlisting is still an owner action if not already done. Taito’s Meet room is the shared Fall URL; calendar **event** links fill in when Google `htmlLink` is stored on the session. Booking and availability reject any slot that would put two sessions on that shared Meet at the same time.
4. **Policy copy** — final cancellation, credit-restoration, invoice, refund, privacy-policy, and financial-aid rules. The public form has a short storage notice only; do not treat that as a legal privacy policy.
5. **Optional publish decisions** — whether to show the live-site phone (`757-332-4244`) and Virginia Beach address on the new footer; whether remaining Wix pages (blog posts, campus-tour product SKUs) should keep inquiry-only redirects.
6. **Curriculum content** — add licensed SAT practice tests / mini-sections in Admin → Library, then attach them to Taito’s October 2 (and later) session dashboards. Do not upload College Board materials the team is not licensed to host.

## Verification

- Workspace typecheck, Accepted Admissions tests, API unit tests that do not need Postgres (`shared-meet-conflict`, session-schedule, access-config, public-team-roster, curriculum-library), journal↔SQL 1:1 (includes `0026`), and both production builds should be run after this pass.
- Database-backed API tests (`booking-credits` including Michelle vs Taito shared-Meet occupancy, `calendar-persistence`, `dashboard-role-flows`, `fall-account-linking`, `login-activity`, `payment-credits`, `tutor-assignment-reconciliation`) require `DATABASE_URL` and were not run in this environment unless a database is provisioned.
- Public media files for the approved roster and nineteen school logos are present in-repo.
