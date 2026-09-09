# Taito October 2 SAT diagnostic (usable MCQ)

Owner: Taito Goto (`taito0525@gmail.com`), first Fall SAT with Eunice (Oct 2 JST). Pays off-platform. Curriculum priority is the reusable SAT/PSAT bank.

Figure-primary (PR #57) made garbled math *display* as image + A–D when a crop exists. The linked Oct 2 quiz was still unusable because composition kept:

- True SPR / free-response keys
- Empty or smashed OCR stems with no figure
- Empty A–D shells marked figure-primary but with no image
- A ~106–107 item slice (120 minus SPR) instead of a clean linear SAT form

This path rebuilds the diagnostic from **student-usable MCQ only**.

## Student UX after rebuild

Taito opens the Oct 2 pre-work and sees either:

- A readable text MCQ with A–D copy, or
- A figure-primary item (full question crop including A–D) plus letter buttons

No student-produced-response box. Submit still returns an estimated SAT range (linear scoring-guide method, not official Bluebook adaptive).

## How composition works

1. Prefer official **SAT Practice Test 4** in module order (RW 1 → RW 2 → Math 1 → Math 2).
2. Keep an item only if the official key is A–D **and** it is either:
   - a clean text MCQ (readable stem + usable choice text), or
   - figure-primary **with a renderable image**
3. Drop true SPR and irreparable OCR (empty/garbled stem, no choices, no figure).
4. Deduplicate near-identical prompts so module twins do not appear twice.
5. Fill dropped slots with unused **clean SAT MCQs** from other official SAT packs (same section) so the form stays the linear 33+33+27+27 shape (66 RW + 54 Math).
6. Session-local forks (`generationMethod = session-copy` / `session-copy` tag) are never overwritten.

The reusable bank still stores SPR and incomplete extracts. They are just not composed into student quizzes.

## Production runbook

Needs `DATABASE_URL` on the API host. No Clerk invites. Do not merge this PR from the runbook; deploy first, then run.

### 1. Deploy this branch (media + API)

Figures stay under `/media/sat-bank/...` (PR #50). If new question-region crops landed, deploy those static files with the API.

### 2. Import / rematerialize bank content (optional but recommended)

Admin → Curriculum → SAT/PSAT bank → **Import staged extracts**

or:

```http
POST /api/admin/sat-bank/import
POST /api/admin/sat-bank/refresh-linked
```

Import upserts bank rows and rematerializes every **bank-linked** `questions` row. Session-local forks are skipped.

To refresh only the current Oct 2 assignment without rebuilding it:

```http
POST /api/admin/sat-bank/assignments/:assignmentId/refresh-linked
```

or:

```bash
cd artifacts/api-server
node --experimental-strip-types src/scripts/reset-october2-prework.ts --refresh-linked-only
```

In-place refresh cannot drop SPR / empty items that are already linked. Use the rebuild for that.

### 3. Rebuild and re-link Taito’s Oct 2 diagnostic

```bash
cd artifacts/api-server
node --experimental-strip-types src/scripts/reset-october2-prework.ts
```

or as administrator:

```http
POST /api/admin/sat-bank/reset-first-sat-prework
```

This:

1. Rematerializes the current Oct 2 linked questions (skips forks)
2. Archives that session’s before-session assignments and deletes its attempts
3. Builds a new published diagnostic from the cleaned MCQ bank
4. Points the Oct 2 session pre-work plan at the new assignment

It does **not** move or edit homework on other sessions (Nika IELTS, later Eunice SATs, Xavier capability, session-local tutor forks).

`--no-reassign` archives Oct 2 pre-work and stops (no new quiz).

### 4. Verify

The script prints `composition`. Expect:

| Check | Expected |
| --- | --- |
| `composition.usable` | `true` |
| `questionCount` | 120 (or ≥80 if a pack is thin) |
| `rwCount` / `mathCount` | 66 / 54 on a full rebuild |
| `sprCount` | 0 |
| `duplicatePrompts` | 0 |
| Time limit | ≥134 minutes |
| Title | `Full-length SAT diagnostic — Taito’s SAT Session with Eunice` |

Then as Taito: open the Oct 2 diagnostic → read a text item and a figure-primary item → answer A–D → submit → see an estimated SAT range.

## Parallel work

PR #59 (Taito portal session list / unpaid banner / Nika) is UI-only. This branch only changes diagnostic **content and assignment quality**. Do not rebase onto that portal branch.
