# College Board extracts

This directory is the import root for the SAT/PSAT question bank.

Official College Board digital SAT practice tests 4–11 and PSAT packs were staged by Chief of Staff. Structured extracts (JSON or JSONL) should land here in a follow-up. The importer is idempotent by source key:

`{examFamily}:{testOrForm}:{section}:{module}:{questionNumber}`

Example: `sat:11:rw:1:3`

## Expected layout

```
content/college-board/
  sat/practice-test-11/test.pdf
  sat/practice-test-11/answers.pdf
  sat/practice-test-11/scoring.pdf
  sat/practice-test-11/questions.jsonl
  psat/8-9/...
  fixtures/sample-extract.jsonl   # seed only, not official items
```

Each extract row should include:

- `examFamily` (`sat` | `psat`)
- `practiceTestNumber` (SAT 4–11) or `formCode` (PSAT pack)
- `section` (`rw` | `math`)
- `module`, `questionNumber`
- `prompt`, `choices`, `correctAnswer`
- `officialExplanation` (official only — never put AI text here)
- optional: `skill`, `domain`, `difficulty`, `stimulus`, `figures`, `scoring`
- optional `sourceFiles.testPdf` / `answersPdf` / `scoringGuide` paths or URLs

## Current seed

`fixtures/sample-extract.jsonl` is a **seed fixture** of original practice items used to exercise import, assign, and lesson flows. It is **not** College Board official content. Official explanation fields stay empty unless a real extract supplies them.

Full PDF OCR is still pending if extracts are incomplete. The admin bank lists SAT Practice Test 4–11 and PSAT pack collections so PDFs can be linked when files arrive.

Do not AI-recreate official questions to fill gaps.
