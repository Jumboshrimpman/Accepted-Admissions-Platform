# Pre-work reminders

Students get one short email when a confirmed session starts within 24 hours and they still have recommended before-session pre-work they have not opened.

## Who is emailed

Only the student on the session (`users.role = student` with a non-blank email). Parents, viewers, tutors, and `admin@acceptedadmissions.org` are never recipients.

No email goes out when:

- any attempt already exists for that student and assignment, including an expired one
- the latest attempt is `submitted` or `expired`
- the assignment is in-session work (`delivery_phase = during_session`)
- the session is cancelled or archived
- the session starts in more than 24 hours, or it has already started

The due time uses the same rule as the portal: before the session starts, unless the assignment has an earlier deadline. Times are shown in the student's timezone.

## Idempotency

`prework_reminder_sends` stores one row per `(assignment_id, student_user_id)`. A second run in the same window finds that row and does not send again. A failed or skipped send deletes the claim so a later run can try again.

## How to run it

Set `PREWORK_REMINDER_SECRET` on the API. The route answers 404 when the secret is missing or wrong.

```bash
curl -X POST https://app.acceptedadmissions.org/api/internal/prework-reminders/run \
  -H "Authorization: Bearer $PREWORK_REMINDER_SECRET"
```

A dry run from a host that already has `DATABASE_URL` prints the plan and does not send or write:

```bash
cd artifacts/api-server
node --experimental-strip-types src/scripts/send-prework-reminders.ts --dry-run
```

Omit `--dry-run` to send. The schedule itself is not configured here.
