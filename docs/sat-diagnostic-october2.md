# Taito October 2 SAT diagnostic (usable MCQ)

Owner: Taito Goto (`taito0525@gmail.com`), first Fall SAT with Eunice (Oct 2 JST). Pays off-platform. Curriculum priority is the reusable SAT/PSAT bank.

Figure-primary (PR #57) made garbled math *display* as image + A–D when a crop exists. PR #60 rebuilt the Oct 2 form from “usable MCQ,” but that predicate treated **any** renderable figure as enough. Live preview then shipped graph-only crops with empty A–D letter keys, missing tables, and clipped stems.

## Why regex gates failed (root cause)

PRs #71–#73 added live-audit detectors (extraction markers, missing figures, smashed algebra, smashed π, junk-bleed D, table-cite-without-values, smashed trig, flattened fractions). Composition still reported `usable: true` and 120/66/54 while students got trash. That was an architecture problem, not a missing regex.

1. **Rematerialize already re-runs live gates.** `reset-first-sat-prework` rematerializes from current **bank DB rows**, then `dropUnusableAssignmentQuestions` calls `isStudentUsableQuizItem` on every candidate. It does **not** trust a stored `usable` column. There is no student-usable flag on the row — only a weak import-time `assignable` (`isAssignableBankItem`: has a prompt, 2+ choices, or figure-primary + letter key).
2. **Import vs reset.** `POST /api/admin/sat-bank/import` re-parses JSONL, applies figure-primary heuristics, upserts bank content, then rematerializes every linked quiz. Reset copies **whatever is already in the bank**. A prod 502 on import leaves stale OCR/crops/choice text. New regexes still run live on that stale content — then composition **refills** dropped slots from other official packs that failed the same leaky gate.
3. **Fail-open fill.** `selectUsableDiagnosticItems` filtered by the same incomplete regex, then padded to 120 from SAT 5–11. `usable` was `true` at ≥80 items if every selected row passed that leaky gate. After each harden PR, rematerialize dropped newly-detected junk and immediately filled with the next smash pattern the blacklist had not seen yet.
4. **Figure-primary was optional window-dressing.** `shouldUseFigurePrimary` required a full-question crop *and* a still-readable cleaned stem, so smashed trig/algebra stayed as text. `mathHasRequiredVisual` treated **any** renderable PNG (`p35-draw1.png`, “Diagram from page 35”) as enough for a graph/triangle cite. Table cites were tightened in #73; graphs/scatterplots/triangles were not.

## New approach (this PR)

Stop shipping a “usable 120” built from junk. Policy, not another blacklist increment:

| Change | Behavior |
| --- | --- |
| **Fail-closed composition** | `usable: true` only for a complete clean 120 (66/54, all four modules full) with zero residual junk. Cross-pack fill may use only items that pass the live audit. Leftover slots are **not** padded with failures. Shortfall counts + reasons are returned. |
| **Math figure/table policy** | A cited table/graph/figure/scatterplot/triangle is solvable only from recovered table values **or** a real full-question / figure-primary crop. Generic page-neighbor PNGs do not count. |
| **Prefer figure-primary for hard OCR** | Smashed trig/systems/fractions + official question image + clean A–D → serve the crop. Text-only smash is dropped, not “repaired.” |
| **Pre-assign audit** | Before linking a rematerialized diagnostic, `auditStudentQuizItem` rejects the whole assign if residual junk remains or RW/Math would be empty. `reset-first-sat-prework` rematerializes the current quiz (unlinks junk) but **does not archive/replace** when assign is blocked. |
| **Re-score without import** | `POST /api/admin/sat-bank/rescore-usable` re-runs the live audit on every bank row (writes `extractGaps.studentUsable`). Skipping a flaky import is safe for gates; import is only needed for new JSONL/crops. |

## Math usability bar (every student quiz)

Sama’s 2026-09-09 bar applies to **all** quizzes — Oct 2 diagnostic, routine SAT pre-work, tutor-built bank quizzes, and lesson retries — via `isStudentUsableQuizItem`. **Math uses a stricter path than RW** (`isStudentUsableMathQuizItem`): do not polish broken OCR into a student stem.

- **Figure-primary data, not OCR salvage:** if the stem depends on a graph, table, dot plot, or geometric figure, require recovered table values **or** a full-question crop. Generic page-neighbor PNGs are not enough. Hard OCR (trig, systems, smashed fractions) prefers the official question image + clean A–D when that crop exists; otherwise drop. Clean stem + full crop + complete A–D may stay text + figure.
- **Extraction-marker bleed:** `Start referenced content` / `End referenced content` (any casing or mid-word line break) never ships. Do not polish the wrappers off — drop/replace.
- **Cited visual without a usable figure:** `Note: Figures not drawn to scale`, `in the figure`, `dat plot`/`dot plot`, similar-triangle vertex labels, or a graph/table cite with no hosted figure (and no recovered table) → drop. Axis ticks OCR’d into the stem (`22 23 24 25 26`) are bleed even when a page crop URL exists. **Math table cites** (`the table shows` / `the table gives`) require recovered table values (or a full-question crop). A generic page diagram is not the table.
- **Pure algebra/function:** reject character-spaced garbage, smashed exponents (`2 2`, `ax2`, `12x3`, `66 = 66 x x`, `2 x = −841`), incomplete parentheses (`x 16( + 15)`, `6( − ) t w`), smashed π tokens (`π 144`, `24 π` vs `π 48`), spaced decimals (`.0 60`), stacked-fraction dumps (`12 −2 = −2` / `n t w`), smashed radicals (`radius of n 3`), flattened xy-table choices (`x y 3 21 5 47 8 86`), smashed trig tokens (`cosQ`, `sinQ 18 18`), glued inequalities (`x>0y>0`), flattened fractions (`42a(k+1)k`), junk-bleed choices (`The given equation relates…` / `The function f gives the monthly fee…` after a numeric answer), leading bare `=` mid-stem (`the =12 teolength`), and unreadable choices (`y x p = 57 +`, `y px = + 57`, `y = 57 px px`). Ship only when stem + full A–D read as real SAT math.
- **If unsure whether a student can solve the math as shown, drop/replace at materialize.** Math never uses the RW fallback “has a crop, so keep.”
- Full usable A–D — never “Multiple-choice options unavailable” or incomplete A–C
- Fewer perfect math items beat 120 with junk. English/RW stays on the existing readable-stem path except extraction-marker bleed, which is rejected for every section.

Composition (`selectUsableDiagnosticItems` / routine bank pool), rematerialize (`dropUnusableAssignmentQuestions`), student/viewer GET (`isStudentUsableServedQuestion`), tutor-built select (`selectBankQuestionsForTutorQuiz`), lesson retries, and quiz chrome (`isStudentAnswerableQuizQuestion`) all call that same gate.

A student-usable item is only:

- a clean text MCQ with a **readable stem** (no extraction-marker wrappers) and complete A–D choice text (plus a figure if the stem cites a graph/table, or a recovered data table), or
- a graph/table figure **plus** separate complete, non-garbage A–D text, **without** axis/vertex OCR bleed in the stem

Figure-primary never unlocks letter-only A–D. Empty choice text, OCR garbage (`~`, `----`, leftover tildes), a missing stem, or orphan/duplicate figure fragments are dropped. Smashed `x f(x)` / `0 29` lines are recovered as a table when possible.

Math must render with the exponents, radicals, and fractions the student needs, or the item must be an intact full-question crop that includes complete A–D. Missing carets (`ax2`, `2x2`, `12x3`, `(1.034)x`), stripped radicals (`2 2`, `6 2`, `8 2 + 80`), spaced products (`b h`, `45 k`), stacked-fraction dumps (`⎜ ⎟ | \ /`), missing operators (`x 16 = 30`, `t 10 ≤75`, `5x ? 3`), `(, x y)` corruption, scrambled `What The function` / `= (…) f(x)` stems, empty `f(x)( )`, and smashed `h x` / exploded `1/9` vertex OCR are rejected. Juxtaposition `21px` (21·p·x) and slash fractions (`x/4`, `7/4`) stay. Run-on inequality systems (`x > 0 y > 0`) stay and render as separate lines. A partial figure-region crop is never paired with that broken OCR or with letter-only buttons. Dot-plot stems keep their figure and require comparison A–D text — never letter keys alone.

A figure that the stem never cites (page-neighbor crop on a word problem, unlabeled equation list, inequality dump) is dropped. Stems with clear OCR corruption (`PQ QR` missing `=`, `value = of`, `Xu123456`, axis-tick dumps, `^ h` / `y f(x)` / `point,0 5`, pipe/backslash graph residue, leaked next-question choices) are rejected. Bare A–D never ships. Unlabeled choice lists plus letter buttons never ship.

Dropped: true SPR, empty/missing/garbage choice text, missing stems, graph-only letter-key shells, duplicate/orphan figure fragments, stems that cite a graph/table with no figure and no recovered table, irreparable OCR, math OCR that is missing exponents or operators or is a failed fraction/layout dump, unlabeled A–D lists, pipe/backslash graph residue, mangled `( , x y )` stems, incomplete table crops, leaked geometry leftover in a numeric choice, scrambled `= (…) f(x)` / empty `f(x)( )`, exploded vertex-fraction OCR, character-spaced garbage (`T h e g r a p h`), junk choice D module boilerplate (`Module 2`, `GO ON TO THE NEXT PAGE`), exploded contingency / OCR-as-table dumps, smashed `%` / pipe tables (Q15-style), similar-triangle stems with no figure (`Figuresnotdrawntoscale`), scatterplots with axis-tick OCR (`y U12345678910`), smashed slope/choices (`1–3`, `y=-+103x`), stacked `14x = 2 w + 19 7y` / stray `f(x)` (Q77), stripped-radical triangle area with no A–D (Q78), smashed `2 4x` factoring (Q79), mashed `2x2` / `( , x y)` systems (Q80), incomplete A/B-only sets such as `2/29` `2/58` (Q81), stray `? following` / `ax2` parabola stems (Q82), figure-only triangle/graph shells with wiped A–D (Q83–Q85), smashed `16+30=190 x` (Q88), surfboard stems with no A–D (Q91), `^ h` / `y f(x)` / `point0,0 5` stems (Q92), chipmunk graph-only shells (Q94), smashed `12x3 −5x ? 3` (Q96), `( , x y)` run-on systems (Q97), scrambled `h x` / `x2` table stems (Q99), `270(0.1)x` / `WhatThe function` stems (Q100), incomplete A–C library items (Q104), leading `=(x-10)(x+13) f(x)` stems (Q106), exploded vertex-form `metal 9` / `(-7) 3` OCR (Q107), smashed circle squares `2 2 x` (Q109), garbled prism `92 K 2 cm . 47` stems (Q110), `f X -2 2` graph junk (Q112), character-spaced `x x y 6 5 4 ? + +` (Q113), axis-bleed `12345678910` / missing scatterplot (Q114), dot-plot axis labels bled into the stem (`16 17 18 19 20 Diameter`) (Q115), smashed `x 16( + 15) ?` algebra (Q117), exploded two-way-table OCR under a cropped figure (Q119), and any item whose A–D copy is unavailable. Intact slash-fraction items (Q89 `x/4 + 1 = 33`, Q103 `7/4`) stay. Readable run-on systems (Q93 `s + 7 = 27 r = 3`) stay and render with equation breaks. Inequality systems (Q98) stay. Juxtaposition `21px` (Q105) stays. Students never see “Multiple-choice options unavailable” — those rows are unlinked at rematerialize and hidden at serve time.

The same student-usable gate (`isStudentUsableQuizItem`) is shared platform code for composition, rematerialize, and student GET. Routine SAT pre-work, tutor-built bank quizzes, and lesson retries inherit it — not Oct 2 only. Tutor-built select passes `section` (and figures) so math items hit `isStudentUsableMathQuizItem`. Incomplete A–D (only A/B) is rejected. Prefer fewer perfect items over a full form of broken OCR.

## Student UX after rebuild

Taito (or a client preview) opens the Oct 2 pre-work and sees either:

- A readable text MCQ with A–D copy, and the graph/table when the stem cites one

No letter-only buttons next to a bare chart, scatterplot, or triangle crop. No student-produced-response box. Submit still returns an estimated SAT range (linear scoring-guide method, not official Bluebook adaptive).

## How composition works

1. Prefer official **SAT Practice Test 4** in module order (RW 1 → RW 2 → Math 1 → Math 2).
2. Keep an item only if the live audit (`auditStudentQuizItem`) returns no failure reasons.
3. Drop true SPR, incomplete A–D, leaked choices, extraction-marker bleed, table-cite-without-values, cited visuals without a full-question crop or recovered table, smashed trig/algebra, and the other live-audit classes in `sat-bank-live-audit.test.ts`.
4. Deduplicate near-identical prompts so module twins do not appear twice.
5. Fill dropped slots only with unused items that **also pass the live audit**. If a module cannot be filled cleanly, leave it short and record `shortfall` (counts + reasons). Do **not** pad with junk to hit 120.
6. `usable: true` only for a complete clean 120 with `residualJunk === 0`. A thin clean set can still be inspected; it cannot be labeled a usable full diagnostic.
7. Session-local forks (`generationMethod = session-copy` / `session-copy` tag) are never overwritten.

The reusable bank still stores SPR and incomplete extracts. They are just not composed into student quizzes.

## Production runbook

**Required after merge.** Landing this PR does not change the live Oct 2 assignment. After Code Checker / review merge and the API deploy, ops may rematerialize. This PR **will refuse to reassign** a new “usable 120” if the bank cannot compose a clean RW+Math set. That is intentional. Do **not** rematerialize production from this cloud agent.

**Correct prod sequence (skip import if it 502s):**

1. Deploy the merged API (and `/media/sat-bank` if new full-question crops landed).
2. Optional: `POST /api/admin/sat-bank/import` — only needed to pick up new JSONL/crops. A 502 leaves stale bank **content** but does **not** freeze usable flags; rematerialize and composition always re-run the live audit.
3. Optional: `POST /api/admin/sat-bank/rescore-usable` — cheap live re-score of `extractGaps.studentUsable` with no JSONL parse.
4. `POST /api/admin/sat-bank/reset-first-sat-prework`
   - Rematerializes the current Oct 2 quiz and unlinks items that fail the live audit.
   - Previews the new composition.
   - If `assignBlocked: true`, the current assignment stays (junk already unlinked). Read `composition.shortfall` — add full-question crops, do not add regexes.
   - If assignable, archives the old quiz and links the new one.

Needs `DATABASE_URL` on the API host. No Clerk invites. Do not merge from this runbook.

### In-place refresh (no rebuild)

```http
POST /api/admin/sat-bank/assignments/:assignmentId/refresh-linked
POST /api/admin/sat-bank/rescore-usable
```

or:

```bash
cd artifacts/api-server
node --experimental-strip-types src/scripts/reset-october2-prework.ts --refresh-linked-only
```

In-place refresh rematerializes bank-linked rows and unlinks items that fail the live audit. It cannot restore wiped choice text or invent full-question crops. Re-import JSONL only when new crops landed.

### Full rebuild (blocked if the bank is dirty)

```bash
cd artifacts/api-server
node --experimental-strip-types src/scripts/reset-october2-prework.ts
```

or:

```http
POST /api/admin/sat-bank/reset-first-sat-prework
```

If `assignBlocked` is true, the current assignment is still the live one (junk already unlinked). Do not force a 120. `--no-reassign` rematerializes/unlinks and stops.

It does **not** move or edit homework on other sessions (Nika IELTS, later Eunice SATs, Xavier capability, session-local tutor forks).

### Verify

The script prints `composition` and `assignBlocked`. Expect:

| Check | Expected |
| --- | --- |
| `composition.usable` | `true` only for a complete clean 120 with `residualJunk === 0`. Otherwise `false` plus `shortfall`. |
| `assignBlocked` | `true` if RW or Math would be empty or residual junk remains — do not treat that as a successful rebuild. |
| `questionCount` | 120 when usable; otherwise the clean short set (never padded with junk) |
| `rwCount` / `mathCount` | 66 / 54 on a usable rebuild |
| `sprCount` | 0 |
| `duplicatePrompts` | 0 |
| `shortfall.reasons` | Explicit live-audit classes (table_cite_without_values, smashed_trig, …) |
| Graph/table items | Recovered table values or a full-question crop — never a page-neighbor PNG alone |
| Extraction markers | No `Start referenced content` / `End referenced content` in any stem |
| Algebra | No smashed trig/algebra as student-facing text unless a full-question crop + clean A–D is served |
| Title | `Full-length SAT diagnostic — Taito’s SAT Session with Eunice` (only after a successful reassign) |

Then as Taito or a client preview: open the Oct 2 diagnostic → a graph item must show the chart **and** A–D copy (or a crop that includes the choices) → tables/stems must not clip → no “Multiple-choice options unavailable” → answer A–D → submit → see an estimated SAT range. Flagged (and reported) items are excluded from the score denominator. Students can **Report question** from the quiz chrome; Sama sees the queue on Admin home and mail goes to `admin@acceptedadmissions.org`.

## Parallel work

This branch changes **shared quiz quality gates, quiz layout, and assignment composition** (diagnostic + routine + tutor-built). No Clerk invites. Leave merge to Code Checker / Chief of Staff.
