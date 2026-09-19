# Transactional email (guidance form → admin inbox)

The public **Get guidance** page (`/client-request`) posts to `POST /api/public/client-requests` on the Railway API. On a valid submit the API emails **`admin@acceptedadmissions.org`** (canonical lowercase) with the form fields, then stores the row for the admin dashboard.

This is not a Clerk invite path. The submitter is never added as a `To` recipient. `Reply-To` is the contact email they entered so Sama can reply from the admin inbox.

## Fail-closed contract

Success (`201`) means a real transport accepted the message. There is no silent “received” when mail cannot be sent.

If `RESEND_API_KEY` is missing, or Resend rejects the send, the API returns **`503`** with `code: EMAIL_DELIVERY_UNAVAILABLE` and an honest error. The public form shows that error and keeps the answers. The request is **not** inserted. The API logs `event=guidance_request.email_failed`.

Question reports still use the same Resend helper but **skip** mail when the key is unset (the admin queue row is enough there). The guidance form does not skip.

## Cos: Railway (required)

Set these on the **Accepted-Admissions-Platform** API service in Railway **production**. Do not put them on Vercel (the browser app never sends mail).

| Name | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | **Yes** for live guidance mail | Resend server API key (`re_…`). Without it, `/client-request` submits fail closed. |
| `RESEND_FROM_EMAIL` | No | Verified sender. Default: `Accepted Admissions <noreply@acceptedadmissions.org>`. |

`SMTP_*` is not wired. Do not add SMTP variables expecting them to send this form.

### Owner steps

1. Create or open the Accepted Admissions [Resend](https://resend.com) account.
2. Verify the `acceptedadmissions.org` domain (or another domain you control). Until the domain is verified, Resend will reject production sends and the form will `503`.
3. Confirm a sending address exists that matches `RESEND_FROM_EMAIL` or the default `noreply@acceptedadmissions.org`.
4. In Railway → **Accepted-Admissions-Platform** → Variables, set `RESEND_API_KEY` to the production key. Optionally set `RESEND_FROM_EMAIL`.
5. Redeploy or restart the API service so it loads the variable.
6. Submit a real `/client-request` from production. Confirm mail arrives at **admin@acceptedadmissions.org** (not a personal Gmail unless that inbox is forwarded there).
7. If the form shows the unavailable-email error, check Railway logs for `guidance_request.email_failed` and the Resend dashboard for domain/API errors.

Do not set a different `To` address in env. The recipient is hardcoded to `admin@acceptedadmissions.org`.

## Vercel

Do **not** set `RESEND_API_KEY` (or Clerk/Stripe secrets) on the Vercel frontend project. `/client-request` is a static page; `fetch('/api/public/client-requests')` is rewritten to Railway. See `docs/vercel-frontend.md`.

## Local / preview

Copy `.env.example`. Without `RESEND_API_KEY`, guidance submits return `503`. Tests use a mock transport and never claim `sent` unless that transport is injected.
