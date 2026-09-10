# Taito October 2 SAT diagnostic (usable MCQ)

Owner: Taito Goto (`taito0525@gmail.com`), first Fall SAT with Eunice (Oct 2 JST). Pays off-platform. Curriculum priority is the reusable SAT/PSAT bank.

Figure-primary (PR #57) made garbled math *display* as image + A–D when a crop exists. PR #60 rebuilt the Oct 2 form from “usable MCQ,” but that predicate treated **any** renderable figure as enough. Live preview then shipped graph-only crops with empty A–D letter keys, missing tables, and clipped stems.

A student-usable item is now only:

- a clean text MCQ with a **readable stem** and complete A–D choice text (plus a figure if the stem cites a graph/table, or a recovered data table), or
- a graph/table figure **plus** separate complete, non-garbage A–D text

Figure-primary never unlocks letter-only A–D. Empty choice text, OCR garbage (`~`, `----`, leftover tildes), a missing stem, or orphan/duplicate figure fragments are dropped. Smashed `x f(x)` / `0 29` lines are recovered as a table when possible.

Math must render with the exponents, radicals, and fractions the student needs, or the item must be an intact full-question crop that includes complete A–D. Missing carets (`ax2`, `2x2`, `12x3`, `(1.034)x`), stripped radicals (`2 2`, `6 2`, `8 2 + 80`), spaced products (`b h`, `45 k`), stacked-fraction dumps (`⎜ ⎟ | \ /`), missing operators (`x 16 = 30`, `t 10 ≤75`, `5x ? 3`), `(, x y)` corruption, scrambled `What The function` / `= (…) f(x)` stems, empty `f(x)( )`, and smashed `h x` / exploded `1/9` vertex OCR are rejected. Juxtaposition `21px` (21·p·x) and slash fractions (`x/4`, `7/4`) stay. Run-on inequality systems (`x > 0 y > 0`) stay and render as separate lines. A partial figure-region crop is never paired with that broken OCR or with letter-only buttons. Dot-plot stems keep their figure and require comparison A–D text — never letter keys alone.

A figure that the stem never cites (page-neighbor crop on a word problem, unlabeled equation list, inequality dump) is dropped. Stems with clear OCR corruption (`PQ QR` missing `=`, `value = of`, `Xu123456`, axis-tick dumps, `^ h` / `y f(x)` / `point,0 5`, pipe/backslash graph residue, leaked next-question choices) are rejected. Bare A–D never ships. Unlabeled choice lists plus letter buttons never ship.

Dropped: true SPR, empty/missing/garbage choice text, missing stems, graph-only letter-key shells, duplicate/orphan figure fragments, stems that cite a graph/table with no figure and no recovered table, irreparable OCR, math OCR that is missing exponents or operators or is a failed fraction/layout dump, unlabeled A–D lists, pipe/backslash graph residue, mangled `( , x y )` stems, incomplete table crops, leaked geometry leftover in a numeric choice, scrambled `= (…) f(x)` / empty `f(x)( )`, exploded vertex-fraction OCR, character-spaced garbage (`T h e g r a p h`), junk choice D module boilerplate (`Module 2`, `GO ON TO THE NEXT PAGE`), exploded contingency / OCR-as-table dumps, smashed `%` / pipe tables (Q15-style), similar-triangle stems with no figure (`Figuresnotdrawntoscale`), scatterplots with axis-tick OCR (`y U12345678910`), smashed slope/choices (`1–3`, `y=-+103x`), and items whose A–D copy is unavailable.

The same student-usable gate (`isStudentUsableQuizItem`) is shared platform code. Routine SAT pre-work, tutor-built bank quizzes, and lesson retries inherit it — not Oct 2 only. Prefer fewer perfect items over a full form of broken OCR.

## Student UX after rebuild

Taito (or a client preview) opens the Oct 2 pre-work and sees either:

- A readable text MCQ with A–D copy, and the graph/table when the stem cites one

No letter-only buttons next to a bare chart, scatterplot, or triangle crop. No student-produced-response box. Submit still returns an estimated SAT range (linear scoring-guide method, not official Bluebook adaptive).

## How composition works

1. Prefer official **SAT Practice Test 4** in module order (RW 1 → RW 2 → Math 1 → Math 2).
2. Keep an item only if the official key is A–D **and** it has a readable stem **and** complete non-garbage A–D text (plus a figure or recovered table if the stem cites a graph/table).
3. Drop true SPR, empty/truncated/OCR-garbage choices, missing stems, graph-only letter-key items, orphan/duplicate figure fragments, missing cited figures, irreparable OCR, math items whose OCR lost exponents/radicals/fractions/operators (unless a full-question crop includes complete A–D), corrupt stems (`value = of`, axis ticks, `^ h`, pipe/backslash residue), leaked/merged A–D lists, unlabeled choice lists, and figures that do not match the stem.
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

In-place refresh now rematerializes bank-linked rows **and unlinks items that fail `isStudentUsableQuizItem`**. It still cannot restore choice text a previous import wiped. Re-import JSONL, then use the rebuild so dropped slots can be filled from other official packs.

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

1. Rematerializes the current Oct 2 linked questions (skips forks) and unlinks remaining unusable items
2. Archives that session’s before-session assignments, including older duplicate diagnostics, and deletes its attempts
3. Builds a new published diagnostic from the cleaned MCQ bank
4. Points the Oct 2 session pre-work plan at the new assignment
5. Dedupes any leftover published full-length diagnostics on the course so only the live copy stays visible

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
| Graph/table items | Choice text visible — never letter keys alone. Tables render as tables, not smashed `x f(x)` lines. Duplicate/orphan figure fragments are gone. No partial crop stacked on broken OCR; long choice D wraps instead of clipping |
| Time limit | ≥134 minutes |
| Title | `Full-length SAT diagnostic — Taito’s SAT Session with Eunice` |

Then as Taito or a client preview: open the Oct 2 diagnostic → a graph item must show the chart **and** A–D copy (or a crop that includes the choices) → tables/stems must not clip → no “Multiple-choice options unavailable” → answer A–D → submit → see an estimated SAT range. Flagged (and reported) items are excluded from the score denominator. Students can **Report question** from the quiz chrome; Sama sees the queue on Admin home and mail goes to `admin@acceptedadmissions.org`.

## Parallel work

This branch changes **shared quiz quality gates, quiz layout, and assignment composition** (diagnostic + routine + tutor-built). No Clerk invites. Leave merge to Code Checker / Chief of Staff.
