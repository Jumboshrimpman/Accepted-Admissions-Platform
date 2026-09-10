# Taito October 2 SAT diagnostic (usable MCQ)

Owner: Taito Goto (`taito0525@gmail.com`), first Fall SAT with Eunice (Oct 2 JST). Pays off-platform. Curriculum priority is the reusable SAT/PSAT bank.

Figure-primary (PR #57) made garbled math *display* as image + A–D when a crop exists. PR #60 rebuilt the Oct 2 form from “usable MCQ,” but that predicate treated **any** renderable figure as enough. Live preview then shipped graph-only crops with empty A–D letter keys, missing tables, and clipped stems.

A student-usable item is now only:

- a clean text MCQ with a readable stem **and** complete A–D choice text (plus a figure if the stem cites a graph/table), or
- a **full-question crop** (stem + choices in the image — not a bare graph/table), with letter keys, or
- a graph/table figure **plus** separate complete A–D text

Dropped: true SPR, empty/missing choice text, graph-only figure-primary, stems that cite a graph/table with no figure, and smashed/truncated OCR.

This path rebuilds the diagnostic from **student-usable MCQ only**.

## Student UX after rebuild

Taito (or a client preview) opens the Oct 2 pre-work and sees either:

- A readable text MCQ with A–D copy, and the graph/table when the stem cites one, or
- A figure-primary item whose crop includes the stem **and** A–D, plus letter buttons

No letter-only buttons next to a bare chart. No student-produced-response box. Submit still returns an estimated SAT range (linear scoring-guide method, not official Bluebook adaptive).

## How composition works

1. Prefer official **SAT Practice Test 4** in module order (RW 1 → RW 2 → Math 1 → Math 2).
2. Keep an item only if the official key is A–D **and** it is either:
   - a clean text MCQ (readable stem + complete A–D choice text; figure required if the stem cites a graph/table), or
   - figure-primary **with a full-question crop** (stem + choices in the image), or
   - a figure plus separate complete A–D text
3. Drop true SPR, empty/truncated choices, graph-only letter-key items, missing cited figures, and irreparable OCR.
4. Deduplicate near-identical prompts so module twins do not appear twice.
5. Fill dropped slots with unused **clean SAT MCQs** from other official SAT packs (same section) so the form stays the linear 33+33+27+27 shape (66 RW + 54 Math).
6. Session-local forks (`generationMethod = session-copy` / `session-copy` tag) are never overwritten.

The reusable bank still stores SPR and incomplete extracts. They are just not composed into student quizzes.

## Production runbook

**Required after merge.** Landing this PR does not change the live Oct 2 assignment. After Code Checker / review merge the PR and the API deploy completes, ops **must** re-import the bank (so figure-primary flags and wiped choice text are recomputed) and then run the rebuild below. In-place rematerialize of already-wiped rows is not enough.

Needs `DATABASE_URL` on the API host. No Clerk invites. Do not merge from this runbook.

### 1. Deploy the merged API (and media if crops changed)

Figures stay under `/media/sat-bank/...` (PR #50). If new question-region crops landed, deploy those static files with the API.

### 2. Re-import bank content (required so graph-only rows are no longer figure-primary)

Admin → Curriculum → SAT/PSAT bank → **Import staged extracts**

or:

```http
POST /api/admin/sat-bank/import
POST /api/admin/sat-bank/refresh-linked
```

Import re-parses JSONL with the tighter figure-primary rules (choice text is kept when it is readable). Then rematerializes every **bank-linked** `questions` row. Session-local forks are skipped.

To refresh only the current Oct 2 assignment without rebuilding it:

```http
POST /api/admin/sat-bank/assignments/:assignmentId/refresh-linked
```

or:

```bash
cd artifacts/api-server
node --experimental-strip-types src/scripts/reset-october2-prework.ts --refresh-linked-only
```

In-place refresh cannot drop SPR / empty / graph-only letter-key items that are already linked, and it cannot restore choice text that a previous import wiped. Re-import JSONL, then use the rebuild.

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
| Graph/table items | Choice text visible, or a crop that includes A–D — never letter keys alone |
| Time limit | ≥134 minutes |
| Title | `Full-length SAT diagnostic — Taito’s SAT Session with Eunice` |

Then as Taito or a client preview: open the Oct 2 diagnostic → a graph item must show the chart **and** A–D copy (or a crop that includes the choices) → tables/stems must not clip → answer A–D → submit → see an estimated SAT range.

## Parallel work

This branch only changes diagnostic **content quality, quiz layout, and assignment composition**. No Clerk invites. Do not merge from this runbook.
