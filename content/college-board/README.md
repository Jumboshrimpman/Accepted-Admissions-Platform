# College Board extracts

Official digital SAT practice tests 4–11 and PSAT packs (Chief of Staff, 2026-09-06).

15 JSONL packs × 120 questions = **1800** canonical rows. Every row has `correctAnswer` and `officialExplanation`. Official wording is not AI-recreated.

## Layout

```
content/college-board/
  manifest.json
  extraction-report.json
  sat-practice-test-4-digital.jsonl
  …
  sat-practice-test-11-digital.jsonl
  psat-8-9-practice-test-1.jsonl
  …
  psat-nmsqt-practice-test-1.jsonl
  pdfs/                         # expected linked PDF filenames from the manifest (may be staged separately)
  fixtures/sample-extract.jsonl # test fixture only — never a production seed; importer skips fixtures/
```

Stable id: `{examVariant}-pt{N}-{rw|math}-m{1|2}-q{N}`  
Example: `sat-pt11-rw-m1-q3`

Dedup key includes exam variant so PSAT 8/9 PT1 and PSAT 10 PT1 do not collide:  
`(examFamily, examVariant, practiceTestNumber, section, module, questionNumber)`

## Honest gaps (do not invent)

1. **skill / topic / difficulty** are null. These paper/digital-accommodation PDFs do not print Bluebook skill tags.
2. **Figures/tables** were not extracted as structured assets. Some prompts and MCQ choices are null on figure-heavy pages. Those rows stay in the bank with official answers/explanations and are **not** selected for 60-minute pre-work until enriched.
3. **SPR** items have `choices: null` and `correctAnswer` may list multiple accepted forms, semicolon-separated (`9; 9.0`).
4. These **PSAT packs use the same 120-item linear layout** as the SAT PDFs (33+33+27+27), not shorter adaptive Bluebook lengths.

Admin import: **Import staged extracts**. The importer is idempotent on the stable id.
