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

Any of:

- Explicit `presentation: "figure_primary"`, `extractGaps.figurePrimary`, or an extraction note containing `figure_primary`
- Garbled / ASCII-art prompt or stimulus and an A–D official key
- Missing/empty choice text (or “(see figure)”) plus figures and an A–D key
- SPR whose official key is actually a letter (`A`–`D`), especially with figures or parse-failure notes
- Extract notes / `figuresIncomplete` on a letter-key item with a missing stem or choices

Genuine numeric SPR (`9; 9.0`) stays SPR.

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
       { "label": "A", "text": "" },
       { "label": "B", "text": "" },
       { "label": "C", "text": "" },
       { "label": "D", "text": "" }
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

Figure-primary display is not enough when the linked quiz still contains SPR, empty stems, or items without a crop. Every student quiz — diagnostic, routine pre-work, and tutor-built bank quizzes — uses the same `isStudentUsableQuizItem` gate for composition, rematerialize, and student GET. Incomplete A–D (A/B only) and empty choice sets are dropped so students never see “Multiple-choice options unavailable.” Rebuild Oct 2 from usable MCQ rows: `docs/sat-diagnostic-october2.md`.

**Required after merge (Oct 2 live assignment does not change until rematerialize):**

1. `POST /api/admin/sat-bank/import`
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
