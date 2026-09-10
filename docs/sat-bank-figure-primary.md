# Figure-primary SAT / PSAT items

Owner rule: when a math/SAT bank question has complex graphs, smashed OCR, or missing choice text, **do not chase perfect LaTeX**. Serve a screenshot of the **full question including A–D**, and let the student tap A / B / C / D. Keep the official answer key and explanation for check/submit.

## Student UX

`presentation: "figure_primary"` (also stored as `extract_gaps.figurePrimary`):

- Show the composite figure (and any remaining safe images).
- Hide garbled stems and leaked `<!-- sat-bank-figures -->` comments.
- Show A–D **with real choice text**. Never letter-only buttons.
- No student-produced-response text box.
- Grade against the A–D key. Show `officialExplanation` after reveal/submit.

Clean text MCQs with usable A–D copy stay normal text MCQs, even if they have a graph. A bare graph/table crop is **not** enough for letter-only figure-primary — the crop must include the stem and A–D, or the item must carry separate complete choice text.

## When the importer flips an item

Figure-primary now requires a **full-question crop** and **complete readable A–D**. Empty letter keys never unlock an item.

Any of:

- Hard OCR (smashed trig/algebra/fractions) + full-question crop + clean A–D — prefer the official image over repairing tokens
- Explicit `presentation: "figure_primary"` / `extractGaps.figurePrimary` **and** a full-question crop + complete A–D
- Garbled prompt plus a full-question crop and complete A–D

Genuine numeric SPR (`9; 9.0`) stays SPR. A page-neighbor PNG is not a full-question crop.

## JSONL / media convention (ops re-extract)

Extractor scripts are not required to live in this repo. On the ops machine:

1. Open the official test PDF page for the broken item.
2. Crop the **full question block, including choices A–D** (not the formula-sheet snippets alone).
3. Save the PNG next to the other SAT bank media:

   `artifacts/accepted-admissions/public/media/sat-bank/<pack>/<sourceKey>-question.png`

   Example: `.../sat-practice-test-4-digital/sat-pt4-math-m1-q1-question.png`

4. Point JSONL `figures` at the hosted URL and mark the crop as the primary stimulus:

   ```json
   {
     "questionType": "mcq",
     "choices": [
       { "label": "A", "text": "18" },
       { "label": "B", "text": "36" },
       { "label": "C", "text": "72" },
       { "label": "D", "text": "90" }
     ],
     "figures": [
       {
         "url": "https://app.acceptedadmissions.org/media/sat-bank/<pack>/<sourceKey>-question.png",
         "alt": "Question region including choices A–D",
         "role": "question_region",
         "primary": true
       }
     ],
     "extractGaps": { "figurePrimary": true },
     "extractionNotes": ["figure_primary"]
   }
   ```

5. Leave `correctAnswer` and `officialExplanation` unchanged.

If both snippet drawings and a question-region crop are present, the portal uses **only** the composite crop.

## Reimport (including Taito Oct 2 diagnostic)

Figure-primary display is not enough when the linked quiz still contains SPR, empty stems, or items without a crop. Every student quiz — diagnostic, routine pre-work, tutor-built bank quizzes, and lesson retries — uses `isStudentUsableQuizItem`. **Math is a separate, stricter path** (`isStudentUsableMathQuizItem`): a cited table/graph/figure is solvable only from recovered values or a **full-question crop**. Generic page-neighbor PNGs do not count. Hard OCR (trig, systems, smashed fractions) prefers the official question image + clean A–D when that crop exists; text-only smash is dropped, not repaired. Extraction-marker bleed never ships. Incomplete A–D never ships. Composition is **fail-closed**: it will not mark `usable: true` or pad junk to 120. A short clean RW+Math set **is assigned** until the bank can fill a complete form. Assign is blocked only if residual junk remains or RW/Math would be empty. See `docs/sat-diagnostic-october2.md`. `--refresh-linked-only` only unlinks.

**Re-score without import:** `POST /api/admin/sat-bank/rescore-usable` re-runs the live audit on bank rows. Use it when import 502s. Rematerialize already re-evaluates live; skipping import is safe for gates.

Landing a quality-gate PR does **not** change the live Oct 2 assignment. After merge, parent must rematerialize Oct 2 again. Import is recommended; `reset-first-sat-prework` is required.

**Required after merge (Oct 2 live assignment does not change until rematerialize):**

1. `POST /api/admin/sat-bank/import` (recommended; skip if flaky)
2. `POST /api/admin/sat-bank/reset-first-sat-prework`  
   or `node --experimental-strip-types src/scripts/reset-october2-prework.ts`

In-place `--refresh-linked-only` rematerializes bank-linked rows and now unlinks items that fail `isStudentUsableQuizItem`. It still cannot restore wiped choice text or refill dropped slots — use the rebuild for that.

The Oct 2 Taito full-length diagnostic is linked to SAT bank rows. After new crops land in JSONL + `/media/sat-bank/`:

1. Deploy the media files (same Vite/Vercel public path as PR #50).
2. Admin → Curriculum → SAT/PSAT bank → **Import staged extracts**.
   Import upserts bank rows and rematerializes every linked `questions` row (`refreshLinked` defaults on).
   Optional: `POST /api/admin/sat-bank/refresh-linked`.
3. Open the Oct 2 diagnostic. Broken items (volume-figure Q1, graph Q7, ASCII scatterplot Q17, and similar) should render as image + A–D.
4. Existing in-progress attempts keep their attempt rows; they read current question content on the next GET. No need to rebuild the assignment unless questions were removed/replaced.

Do **not** re-OCR the whole 1800-question bank for this path. Heuristics already flip clearly broken letter-key items on import and at assignment GET time, so students stop seeing SPR boxes and leaked HTML comments even before every composite crop exists. Crops are what make those items actually solvable.

## Parallel work

PR #56 may also strip SPR inputs and `sat-bank-figures` comments. This path is additive: figure-primary items always carry A–D choices, so they stay answerable if that branch lands first.
