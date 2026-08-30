# Accepted Admissions platform upgrade status

## Implemented in this phase

- Added a durable `viewer` application role and `viewer_links` relationship. Viewer access is deny-by-default, scoped to a linked student, and blocked for every non-read API request with `VIEW_ONLY`.
- Added the public SAT offerings, Our Team, Past Success, and Client Request routes using the existing visual system.
- Added public SAT product records with the requested prices and effective hourly rates:
  - Single SAT session — $175 for 1 hour
  - SAT 10-hour package — $1,500 for 10 hours
  - SAT 20-hour package — $2,400 for 20 hours
- Added administrator-editable foundations for tutor profiles, public content, availability rules, calendar connections, credits, invoices, payments, leads, compensation rates, and private meeting records.
- Added Xavier Morales and Eunice Chon’s tutor records with public content fields empty until approved content is supplied.
- Added Michelle Makarem’s pending client record and one original prepaid SAT hour. The `pending:` Clerk identifier is not an authorization credential; a later allowlisted Clerk identity is reconciled to this record by server-side account provisioning.
- Added server-side client-request validation, phone normalization, consent checks, private lead storage, and a basic per-IP rate limit.
- Added administrator operational and financial snapshot fields, including a clearly labeled gross profit calculation and provider readiness states.
- Added the visible “Back to Home” link on the portal sign-in screen.
- Removed the old enrollment status message from the application and replaced it with the neutral “SAT and IELTS program · Fall 2026” label.
- Added prepaid SAT booking for eligible tutors, including server-validated availability, atomic credit reservation, provider event IDs, cancellation with credit restoration, and rescheduling.
- Added independently scoped Google Calendar OAuth and tutor controls for Xavier Morales and Eunice Chon; booking exposes only free/busy-derived slots and explicit disconnected states.
- Added Stripe-hosted SAT Checkout and invoice creation, raw-body webhook signature verification, event idempotency, payment/refund status tracking, and exactly-once credit fulfillment.
- Added account-scoped client financial history plus administrator controls for hosted invoices, offline payments, invoice states, and audited credit adjustments.

## External services

The following are intentionally not labeled live:

- Google Calendar: workspace development OAuth credentials and callback are configured. Any provisioned non-viewer account can connect its own calendar; only booking-eligible tutor profiles affect student availability. Live availability or booking still requires a successful Google consent and end-to-end test.
- Stripe: connector attached. Hosted payment flows are implemented; the deployment webhook signing secret must be configured before signed events can be accepted.
- Hosted payment redirects use `APP_ORIGIN` in production; configure it to the canonical HTTPS application origin before deployment.
- Email: not configured. Client requests are stored, but acknowledgements are not sent by an external provider.
- Otter.ai: disconnected. Manual meeting-record links are supported by the schema; transcripts are not imported or exposed.

## Owner input still required

- Confirm and invite the intended development or production Clerk accounts before adding their Clerk IDs to allowlists. Existing invitation work remains separately gated.
- Provide approved tutor headshots, biographies, titles, and LinkedIn redirects.
- Provide approved Past Success copy, testimonials, attribution/anonymity choices, logos, and image alt text.
- Configure the Stripe webhook signing secret through Replit Secrets and complete a test-mode Checkout/invoice/refund pass before accepting live payments.
- Xavier’s development account is provisioned under `xsfam6@gmail.com`; he must complete Google consent from `/tutor` for the live provider check. Eunice’s invitation, allowlisting, and Google consent are explicitly deferred by owner direction.
- Define final cancellation, credit-restoration, invoice, refund, and privacy-policy rules.

## Verification completed

- Database migration generated and applied successfully in development.
- Full workspace typecheck passed.
- Accepted Admissions production build passed.
- API server build passed.
- Booking availability, time-zone, buffer, OAuth signing/encryption, and event-payload tests passed.
- Google OAuth configuration resolves to the workspace callback with offline consent and only free/busy plus calendar-event scopes.
- The callback rejects incomplete authorization, calendar routes reject unauthenticated requests, and the running API health check returned HTTP 200.
- Public product, tutor, and SAT content endpoints returned HTTP 200.
- Invalid client-request input returned HTTP 400.
- Unauthenticated credit access returned HTTP 401.
- Public home, SAT offerings, and mobile client-request pages rendered without browser errors.