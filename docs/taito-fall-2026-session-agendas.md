# Fall 2026 Taito complementary session agendas

Owner: Cos (ops). Student: Taito Goto. SAT hours: Eunice (or Xavier if that hour is reassigned). English hours: Nika.

This is **original coaching text**. It is not College Board, Cambridge Assessment English, British Council, or IDP material. Do not paste official exam stems into tutor notes or blocks.

## What tutors see

| Surface | Field | Visibility |
| --- | --- | --- |
| Tutor session page → **Private tutor guidance** | `session_artifacts.kind = tutor_notes` via `PUT /api/sessions/:sessionId/artifacts` | Tutor only (draft) |
| Session curriculum → **Session goals** | `curriculum_blocks.kind = objectives`, `config.seedKey = taito-fall-2026-agenda-objectives` | Student + tutor, published |
| Session curriculum → score callout | `curriculum_blocks.kind = callout`, `config.seedKey = taito-fall-2026-agenda-callout` | Student + tutor, published |

Tutors save Private tutor guidance from the session page. Students never see `tutor_notes`.

## Dates seeded (JST)

| Date | Subject | Agenda title |
| --- | --- | --- |
| 2026-10-02 | SAT | Diagnostic debrief (first SAT) |
| 2026-10-09 | SAT | Routine 40Q #1 |
| 2026-10-16 | SAT | Routine #2 |
| 2026-10-23 | English | Reading diagnostic (24Q) |
| 2026-10-30 | SAT | Mid-Fall checkpoint |
| 2026-11-06 | SAT | Routine |
| 2026-11-13 | English | Routine Reading (12Q) |
| 2026-11-20 | SAT | Routine |
| 2026-11-27 | SAT | Pre–Dec push |
| 2026-12-04 | English | Routine Reading (12Q) + wrap |
| 2026-12-11 | SAT | Routine |
| 2026-12-18 | SAT | Closing SAT session |

Session IDs are **discovered** from the live `Fall 2026 SAT & IELTS` course using `TAITO_FALL_2026_SESSIONS` (date + subject). Xavier’s capability-test session is skipped. IDs are never hardcoded.

## Production path (preferred)

Boot seed (`ensureSeedData`) upserts agendas after Taito session reconcile. After this PR deploys / the API restarts, the next authenticated hit that runs seed (for example **Admin → Curriculum** or `GET /api/courses`) writes the notes.

Idempotent rules:

- Empty `tutor_notes` → write.
- Notes that already contain `[taito-fall-2026-agenda YYYY-MM-DD]` and match the current outline → skip. If the outline in code changed, update in place (unique on `session_id + kind`).
- Handwritten notes without the marker → **skip** (use `--force` only if Cos intends to overwrite).
- Student blocks upsert on `config.seedKey` and skip when already identical. The generic Oct 2 “Review summer progress” objectives row is adopted once, not duplicated.

This does **not** rematerialize SAT/IELTS banks, assign quizzes, or send Clerk invites.

## Cos one-shot script (API host, `DATABASE_URL`)

Same pattern as `reconcile-client-quiz-labels.ts`. No Clerk token. Run on the API host that already has `DATABASE_URL`:

```bash
cd artifacts/api-server
node --experimental-strip-types src/scripts/seed-taito-fall-agendas.ts --dry-run
node --experimental-strip-types src/scripts/seed-taito-fall-agendas.ts
```

Optional:

```bash
node --experimental-strip-types src/scripts/seed-taito-fall-agendas.ts --skip-student-blocks
node --experimental-strip-types src/scripts/seed-taito-fall-agendas.ts --force
```

Dry-run prints each date, discovered `sessionId`, and planned `created` / `updated` / `skipped` / `missing` actions.

If `missingDateKeys` is non-empty, those Fall rows are not in the live course (or were archived). Fix schedule reconcile first; do not invent IDs.

## Cos HTTP API path (if you cannot run the host script)

Use an **administrator** browser session on https://app.acceptedadmissions.org (Clerk cookie). There is no separate admin API token. Do not invent session IDs.

1. Open **Admin → Curriculum → Sessions** and note each Taito Fall row, **or** `GET /api/tutor/curriculum` and match `dateTime` in `Asia/Tokyo` to the table above.
2. For each discovered `sessionId`:
   - `GET /api/sessions/:sessionId/artifacts` — if `tutor_notes` is handwritten and should be kept, skip.
   - `PUT /api/sessions/:sessionId/artifacts` with body:
     ```json
     {
       "kind": "tutor_notes",
       "content": "<outline from src/lib/taito-fall-2026-session-agendas.ts, including the [taito-fall-2026-agenda YYYY-MM-DD] first line>",
       "visibility": "tutor",
       "status": "draft"
     }
     ```
     This upserts on `(sessionId, kind)` and will not create a second notes row.
   - Optional student blocks: `POST /api/sessions/:sessionId/blocks` with `kind: "objectives"` / `"callout"`, `visibility: "both"`, and `config.seedKey` as above. **POST always inserts a draft** — if a seed-keyed block already exists, `PATCH /api/blocks/:blockId` instead (`status: "published"`). Students only see **published** blocks.
3. Confirm on the tutor session page: **Private tutor guidance** shows the outline.

If a seed-keyed block already exists, do not POST again.

## Verify

1. Tutor (Eunice / Xavier / Nika) opens the matching session → Private tutor guidance has the dated outline.
2. Student portal for that session shows Session goals + the “not an official SAT/IELTS” callout.
3. Re-run the script: note counts stay at one `tutor_notes` per session; block counts for the seed keys stay at one each.
4. SAT diagnostic / IELTS pre-work assignments are unchanged.
