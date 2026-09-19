# Transactional email (guidance form → optional admin inbox)

The public **Get guidance** page (`/client-request`) posts to `POST /api/public/client-requests` on the Railway API. A valid submit **always persists** a `client_requests` row first. That row is the source of truth for the admin portal (**`/admin`**, Guidance requests card / `#guidance-requests`).

Email to **`admin@acceptedadmissions.org`** (canonical lowercase) is **best-effort only**. `Reply-To` is the contact email they entered so Sama can reply from the admin inbox if mail happens to send. The submitter is never a `To` recipient. This is not a Clerk invite path.

## Portal-first contract

Success (`201`) means the request was **saved for administrators**. It does **not** mean mail was delivered.

If `RESEND_API_KEY` is missing, or Resend rejects the send (for example the domain is not verified), the API still returns **`201`**, inserts the row, and logs `event=guidance_request.email_failed`. The public form shows “we received your request.” It must not claim that email was sent.

Question reports use the same Resend helper and already skip mail when the key is unset (the admin queue row is enough there). Guidance now matches that portal-first pattern.

## Cos: Railway (optional mail)

Set these on the **Accepted-Admissions-Platform** API service in Railway **production** only if you want inbox copies. Do not put them on Vercel (the browser app never sends mail). **Do not block form success on these variables.**

| Name | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | No for submit success | Resend server API key (`re_…`). Optional. Without it, submits still save; the API logs a skip/failure and admins read the portal. |
| `RESEND_FROM_EMAIL` | No | Verified sender. Default: `Accepted Admissions <noreply@acceptedadmissions.org>`. |

`SMTP_*` is not wired. Do not add SMTP variables expecting them to send this form.

### Owner steps (optional inbox copies)

1. Create or open the Accepted Admissions [Resend](https://resend.com) account.
2. Verify the `acceptedadmissions.org` domain (or another domain you control). Until the domain is verified, Resend will reject production sends — **submits still succeed** and appear under **Admin overview → Guidance requests**.
3. Confirm a sending address exists that matches `RESEND_FROM_EMAIL` or the default `noreply@acceptedadmissions.org`.
4. In Railway → **Accepted-Admissions-Platform** → Variables, set `RESEND_API_KEY` to the production key. Optionally set `RESEND_FROM_EMAIL`.
5. Redeploy or restart the API service so it loads the variable.
6. Submit a real `/client-request` from production. Confirm the row appears at **`/admin#guidance-requests`**. Mail to **admin@acceptedadmissions.org** is extra, not required.
7. If inbox copies are missing, check Railway logs for `guidance_request.email_failed` and the Resend dashboard for domain/API errors. Do not treat that as a lost submission.

Do not set a different `To` address in env. The recipient is hardcoded to `admin@acceptedadmissions.org`.

## Vercel

Do **not** set `RESEND_API_KEY` (or Clerk/Stripe secrets) on the Vercel frontend project. `/client-request` is a static page; `fetch('/api/public/client-requests')` is rewritten to Railway. See `docs/vercel-frontend.md`.

## Local / preview

Copy `.env.example`. Without `RESEND_API_KEY`, guidance submits still return `201` and store the row. Tests use a mock transport and never claim `sent` unless that transport is injected.
