# Clear in-session homework for one session

`POST /api/sessions/:sessionId/clear-prework` with no body deletes **before-session** attempts only. In-session homework (`assignments.delivery_phase = during_session`, including “In-session homework completion”) stores Complete / In progress on `attempts` (`status`, `score`, `result` JSON). That is why Clear & redo can report `Cleared 0 attempt(s)` after a diagnostic reset and the in-session card still shows a score and miss count.

The same endpoint now accepts:

| Body | What is deleted |
| --- | --- |
| omitted | Live `before_session` attempts only (previous behavior) |
| `{ "deliveryPhase": "during_session" }` | Every in-session attempt on **this session**, including archived copies |
| `{ "assignmentId": "<id>" }` | Attempts on that one assignment, before or during session |

Responses, timer events, review-queue rows, question reports, adaptive recommendations, weakness groups, and remediation retries that belong to those attempts are deleted with them. The assignment, its questions, and the College Board bank stay. Other sessions are not queried.

## Sama session `1cc3dea5-9532-4dc2-9cea-3d1e5d65d119`

Client: `samapostgrad@gmail.com` (Sama Test). Title: “Sama’s SAT Session with Eunice”.

Do not run this against Michelle, Taito, or any other session. Do not rematerialize question banks.

### After this API is deployed (signed-in administrator)

On `https://app.acceptedadmissions.org`, signed in as an administrator, open the browser console on that origin and run:

```js
fetch("/api/sessions/1cc3dea5-9532-4dc2-9cea-3d1e5d65d119/clear-prework", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ deliveryPhase: "during_session" }),
})
  .then((response) => response.json())
  .then(console.log);
```

Expect `deliveryPhase: "during_session"` and `deletedAttempts` equal to the in-session attempt count. Reload the tutor session. In-session homework should show **Not started** (`attemptId` null, `attemptStatus` null, no score, 0 mistakes). The Oct 2 / before-session diagnostic stays as it was.

The same call is what **Clear & redo** sends from an in-session homework row (it also sends that row’s `assignmentId`). On the attempt review page, Clear & redo sends only `assignmentId`, which clears that assignment whether it is before-session or in-session.

### API host script (needs `DATABASE_URL`, no Clerk token)

Dry-run first. It refuses to write unless the session’s client email matches.

```bash
cd artifacts/api-server
node --experimental-strip-types src/scripts/clear-in-session-homework.ts \
  --session-id=1cc3dea5-9532-4dc2-9cea-3d1e5d65d119 \
  --expect-email=samapostgrad@gmail.com
node --experimental-strip-types src/scripts/clear-in-session-homework.ts \
  --session-id=1cc3dea5-9532-4dc2-9cea-3d1e5d65d119 \
  --expect-email=samapostgrad@gmail.com \
  --apply
```

Confirm the dry-run title is Sama’s session and the email is `samapostgrad@gmail.com` before `--apply`.

### Railway Postgres, before the API deploy

The cloud agent cannot read production `DATABASE_URL` (Railway hides it). An administrator can run this in the Postgres query tab. It aborts unless that session’s client is `samapostgrad@gmail.com` and the title contains `Sama`. It does not update `before_session` rows.

```sql
BEGIN;

DO $$
DECLARE
  client_email text;
  session_title text;
BEGIN
  SELECT u.email, s.title
    INTO client_email, session_title
  FROM sessions s
  JOIN users u ON u.id = s.client_user_id
  WHERE s.id = '1cc3dea5-9532-4dc2-9cea-3d1e5d65d119';

  IF client_email IS DISTINCT FROM 'samapostgrad@gmail.com' THEN
    RAISE EXCEPTION 'Refusing to clear: client email is %', client_email;
  END IF;
  IF session_title IS NULL OR session_title NOT ILIKE '%Sama%' THEN
    RAISE EXCEPTION 'Refusing to clear: session title is %', session_title;
  END IF;
END $$;

CREATE TEMP TABLE sama_in_session_attempts ON COMMIT DROP AS
SELECT att.id
FROM attempts att
JOIN assignments a ON a.id = att.assignment_id
WHERE a.session_id = '1cc3dea5-9532-4dc2-9cea-3d1e5d65d119'
  AND a.delivery_phase = 'during_session';

DELETE FROM question_reports
WHERE attempt_id IN (SELECT id FROM sama_in_session_attempts);
DELETE FROM review_queue_items
WHERE attempt_id IN (SELECT id FROM sama_in_session_attempts);
DELETE FROM timer_events
WHERE attempt_id IN (SELECT id FROM sama_in_session_attempts);
DELETE FROM responses
WHERE attempt_id IN (SELECT id FROM sama_in_session_attempts);
DELETE FROM adaptive_recommendations
WHERE source_attempt_id IN (SELECT id FROM sama_in_session_attempts);
DELETE FROM homework_weakness_groups
WHERE attempt_id IN (SELECT id FROM sama_in_session_attempts);
DELETE FROM remediation_retries
WHERE source_attempt_id IN (SELECT id FROM sama_in_session_attempts);
DELETE FROM attempts
WHERE id IN (SELECT id FROM sama_in_session_attempts);

SELECT a.delivery_phase, a.title, a.status, count(att.id) AS attempts
FROM assignments a
LEFT JOIN attempts att ON att.assignment_id = a.id
WHERE a.session_id = '1cc3dea5-9532-4dc2-9cea-3d1e5d65d119'
GROUP BY a.id, a.delivery_phase, a.title, a.status
ORDER BY a.delivery_phase, a.title;

COMMIT;
```

After commit, `during_session` attempt counts are 0. `before_session` counts are unchanged. Reload the session: in-session homework is Not started.
