# IELTS-style English pre-work (original practice)

Owner: Cos (ops) + Nika Raiffe (English tutor). Student: Taito Goto, three Fall 2026 English sessions (Oct 23, Nov 13, Dec 4 JST).

This is **original IELTS-style practice** authored in-repo. It is **not** official IELTS, Cambridge Assessment English, British Council, or IDP material. Do not scrape those sites, upload Cambridge PDFs, or reconstruct published exam items from memory.

## What shipped

- Bank collection `ielts-style-original-practice` (`examFamily: ielts`, `sourceKind: original`).
- 48 Reading MCQs across 8 original passages (complete A–D, answer keys, explanations).
- 2 Writing prompts in the same collection. They are **tutor-review only** and are not auto-scored or auto-assigned.
- Same session pre-work path as SAT: Cos/Nika assign from Curriculum → Sessions, or the seed path attaches homework when Taito English sessions reconcile.
- Admin **Generate questions** on an IELTS/English quiz reuses the existing OpenAI path. Without `OPENAI_API_KEY` the API returns 503 and invents nothing.

## Default assignment (after merge / seed)

| Session | Date (JST) | Kind | Set |
| --- | --- | --- | --- |
| First English with Nika | 2026-10-23 | Diagnostic reading | 24 MCQ (module 1) |
| Second | 2026-11-13 | Routine reading | 12 MCQ (module 2) |
| Third | 2026-12-04 | Routine reading | 12 MCQ (module 3) |

Listening is not in this slice (no audio hosting). Prefer Reading first; Writing stays in the bank for Nika to use in session.

## Cos ops on prod

1. Merge this PR. Restart / redeploy the API so `ensureSeedData` and `/api/admin/sat-bank/collections` can upsert the original collection.
2. Open **Admin → Curriculum → Question bank**. You should see **IELTS-style original practice (not official IELTS)**.
3. Open **Sessions**. Each Taito English row should show homework after seed/reconcile. If a session is empty:
   - Choose **Diagnostic reading** on Oct 23, or **Routine reading** on the later dates.
   - Click **Assign IELTS-style diagnostic** / **Assign IELTS-style pre-work**.
4. Do **not** assign a College Board SAT/PSAT collection to an English session (the API fail-closes with 409).
5. To add more items: open the English quiz → **Generate questions**. Requires `OPENAI_API_KEY` on the API host. Review every stem and A–D key before students see them.
6. Writing tasks: browse the IELTS-style collection and use them as in-session prompts. They have no letter key.

## Quality bar

Fail-closed: only complete, readable Reading MCQs assign. No junk padding to hit a count. Short clean sets are acceptable. This is accuracy practice, not an official IELTS band score.

## Source of truth

Fixtures live in `artifacts/api-server/src/lib/ielts-style-bank-content.ts`. Re-import is idempotent on `sourceKey`.
