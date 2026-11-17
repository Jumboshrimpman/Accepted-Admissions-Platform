# Asynchronous SAT Math video explanations

Draft feature for Michelle Makarem with Xavier Morales. There is no end date:
requests stay open as long as the student is enabled and has credits.
Students send 3–10 SAT Math questions per request. Within 48 hours the tutor
posts an unlisted YouTube video in the portal; the follow-up practice quiz can
go in with it or be attached later. 1 question credit = 1 question. Unused
credits never expire and are not refunded; the balance stays visible.

## It is off by default

Two switches must both be on before a student sees anything:

1. `ASYNC_MATH_VIDEOS_ENABLED=1` on the API service. Unset means every
   `/api/math-videos*` route answers `{ enabled: false }` or 404, and no panel
   renders for students, tutors, or admins.
2. An **enabled** row in `math_video_enrollments` for that student. The
   migration creates no rows. An admin adds the student (hidden), grants
   credits, then clicks **Show to student**.

Tutors only see the queue when they have an enabled student or a request.
Hiding a student again hides the panel and blocks their file links.

## Turning it on for Michelle (after payment)

1. Set the Drive env vars below (optional; without them students can still
   type questions, just not upload photos).
2. Set `ASYNC_MATH_VIDEOS_ENABLED=1` on the Railway API service and redeploy.
3. Admin dashboard → **SAT Math video requests** → add Michelle's email
   (tutor defaults to Xavier) → **Add credits** (defaults to 15) →
   **Show to student**.

## Flow

- **Student** (portal home): "How it works" + "Logistics" copy, credits left,
  a draft with one card per question. Each question takes a short note and/or
  photos (multi-select, drag-drop, phone camera or library, HEIC/JPG/PNG/WebP/
  PDF, 15 MB each). "Add photos (one per question)" turns a batch of photos
  into separate questions. Submit charges one credit per question and sets
  `due_at = submitted_at + 48h`. Delivered requests show the video (thumbnail,
  plays inline from `youtube-nocookie.com` after a click), an **Open on
  YouTube** link, the tutor's note, and a button to the follow-up quiz once
  one is attached and published (until then: "quiz will appear here soon").
- **Tutor** (tutor dashboard): queue sorted by due time with a countdown /
  overdue badge, question photos, an unlisted-YouTube link field with live
  preview, a picker for quizzes assigned to that student (built in the normal
  quiz builder), optional note, **Mark delivered**. Only the video is required
  to deliver. The quiz can be attached, changed, or cleared after delivery
  (delivered requests without one show a "Quiz to add" badge); a draft quiz
  stays hidden from the student until it is published.
- **Admin** (admin dashboard): everything the tutor sees plus enrollment,
  credit grants/adjustments, Drive links, and **Cancel and refund credits**.
  Each submission adds an admin notification (`math_video_request`). No email
  is sent anywhere in this feature.

## Photos live in Google Drive, not on the site

- Each upload is one HTTP request whose body is streamed straight into a Drive
  resumable upload. Nothing is buffered whole, written to Railway disk, or
  stored in Postgres. The DB keeps only Drive file IDs and links.
- One Drive subfolder per request, e.g. `2026-11-18 Michelle M · 3f2a9c1b`,
  under the root folder.
- Tutors and the student view photos through
  `GET /api/math-videos/requests/:id/files/:fileId`, which checks access and
  streams the bytes from Drive. Nobody needs to be shared on the Drive folder.
  Admins also get direct Drive links.
- Removing a photo from a draft trashes it in Drive.

### Environment variables (none are set yet)

| Variable | Needed | Notes |
| --- | --- | --- |
| `ASYNC_MATH_VIDEOS_ENABLED` | yes, to show the feature | `1`/`true`. Unset = off. |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` | option A | Service-account key JSON, raw or base64. |
| `GOOGLE_DRIVE_IMPERSONATE_SUBJECT` | option A, optional | e.g. `admin@acceptedadmissions.org` with domain-wide delegation for scope `https://www.googleapis.com/auth/drive.file`. |
| `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` | option B | Refresh token for admin@acceptedadmissions.org with `drive.file`. |
| `GOOGLE_DRIVE_OAUTH_CLIENT_ID` / `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET` | option B, optional | Default to the existing `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET`. |
| `GOOGLE_DRIVE_UPLOAD_FOLDER_ID` | optional | Use an existing folder. Needs full `drive` scope (drive.file cannot see folders the app did not create) and, for a service account without impersonation, a **Shared Drive** folder. Unset = the app creates "Accepted Admissions · SAT Math video questions" in My Drive and reuses it. |

If none of the credentials are set, uploads answer 503 with "Photo uploads are
not set up yet", the student panel says so, and text-only questions still work.

### Can the existing Google credential be reused?

Partly. The calendar integration's stored refresh tokens only carry
`calendar.freebusy` + `calendar.app.created`, so they cannot touch Drive. The
calendar OAuth **client** (ID/secret) can be reused for option B, but someone
must sign in as admin@ once to mint a new refresh token with `drive.file`:

1. Google Cloud console, same project as the calendar client: enable the
   **Google Drive API**; add the `.../auth/drive.file` scope to the OAuth
   consent screen. The consent screen must be **In production** (testing-mode
   refresh tokens expire after 7 days).
2. Mint the token (e.g. OAuth 2.0 Playground with "Use your own OAuth
   credentials", after adding `https://developers.google.com/oauthplayground`
   as an authorized redirect URI on the client), signed in as
   admin@acceptedadmissions.org, scope `https://www.googleapis.com/auth/drive.file`.
3. Set `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` on Railway.

Option A (service account) avoids a personal sign-in: create a service account
in that project, enable the Drive API, and either add it as Content manager on
a Shared Drive folder (`GOOGLE_DRIVE_UPLOAD_FOLDER_ID`) or grant domain-wide
delegation for `drive.file` and set `GOOGLE_DRIVE_IMPERSONATE_SUBJECT`.

## Data

Migration `0090_async_math_video_requests.sql` (additive, idempotent):
`math_video_enrollments`, `math_video_requests`, `math_video_request_files`,
`math_video_credit_entries` (ledger; balance = sum of `delta`; unique
`(request_id, kind)` so a request is charged and refunded at most once).
It does not touch `credit_ledger`, hours, Stripe, or any existing table.
