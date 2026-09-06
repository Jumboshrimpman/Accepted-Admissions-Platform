#!/usr/bin/env python3
"""Extract College Board SAT/PSAT practice packs into import-ready JSONL + manifest."""

from __future__ import annotations

import json
import os
import re
import hashlib
from collections import OrderedDict
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Optional

import pymupdf

STAGED = Path("/workspace/sat-curriculum-sources/staged")
OUT = Path("/workspace/sat-curriculum-sources/extracted")
OUT.mkdir(parents=True, exist_ok=True)

FOOTER_RE = re.compile(
    r"(Unauthorized copying|CO\s*NTI\s*N\s*U\s*E|CONTINUE|"
    r"STOP|If you finish before time|SAT PRACTICE TEST|"
    r"PSAT.*PRACTICE|ANSWER EXPLANATIONS|"
    r"©\s*\d{4}\s*College Board|GO ON TO THE NEXT PAGE)",
    re.I,
)
QNUM_RE = re.compile(r"^\s*(\d{1,2})(?:\s*[-–—~. _]*)?\s*$")
CHOICE_START_RE = re.compile(r"^([A-D])\)\s*(.*)$")
SECTION_HEADER_RE = re.compile(r"^(Reading and Writing|Math)\s*$", re.I)
MODULE_ONLY_RE = re.compile(r"^Module\s*$", re.I)
MODULE_NUM_RE = re.compile(r"^([12])\s*$")
QUESTIONS_COUNT_RE = re.compile(r"^(\d+)\s*QUESTIONS?\s*$", re.I)


def clean_text(s: str) -> str:
    s = s.replace("\u00a0", " ").replace("\u200b", "")
    s = s.replace("\uf0b7", "•")
    # normalize OCR blank placeholders and currency glyphs
    s = re.sub(r"\bblank\b", "______", s, flags=re.I)
    s = re.sub(r"\bdollar sign\b", "$", s, flags=re.I)
    s = re.sub(r"\bpercent\b", "%", s, flags=re.I)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def pack_meta(pack_name: str) -> dict[str, Any]:
    name = pack_name.lower()
    notes: list[str] = []
    if name.startswith("sat-practice-test-"):
        m = re.search(r"sat-practice-test-(\d+)", name)
        return {
            "packId": pack_name,
            "examFamily": "sat",
            "examVariant": "sat",
            "practiceTestNumber": int(m.group(1)) if m else None,
            "notes": notes,
        }
    if name.startswith("psat-8-9-"):
        m = re.search(r"practice-test-(\d+)", name)
        return {
            "packId": pack_name,
            "examFamily": "psat",
            "examVariant": "psat8_9",
            "practiceTestNumber": int(m.group(1)) if m else None,
            "notes": notes,
        }
    if name.startswith("psat-10-"):
        m = re.search(r"practice-test-(\d+)", name)
        return {
            "packId": pack_name,
            "examFamily": "psat",
            "examVariant": "psat10",
            "practiceTestNumber": int(m.group(1)) if m else None,
            "notes": notes,
        }
    if name.startswith("psat-nmsqt-10-"):
        m = re.search(r"practice-test-(\d+)", name)
        return {
            "packId": pack_name,
            "examFamily": "psat",
            "examVariant": "psat_nmsqt_10",
            "practiceTestNumber": int(m.group(1)) if m else None,
            "notes": ["Combined PSAT/NMSQT & PSAT 10 practice test 3 pack naming"],
        }
    if name.startswith("psat-nmsqt-"):
        m = re.search(r"practice-test-(\d+)", name)
        return {
            "packId": pack_name,
            "examFamily": "psat",
            "examVariant": "psat_nmsqt",
            "practiceTestNumber": int(m.group(1)) if m else None,
            "notes": notes,
        }
    return {
        "packId": pack_name,
        "examFamily": None,
        "examVariant": None,
        "practiceTestNumber": None,
        "notes": ["unrecognized pack name"],
    }


def classify_pdfs(pack_dir: Path) -> dict[str, Optional[str]]:
    files = sorted(os.listdir(pack_dir))
    test = answers = scoring = None
    for f in files:
        if not f.lower().endswith(".pdf"):
            continue
        fl = f.lower()
        path = f
        if "scoring" in fl:
            scoring = path
        elif "answer" in fl or "explanation" in fl:
            answers = path
        else:
            # main test booklet (not scoring/answers)
            test = path
    return {"test": test, "answers": answers, "scoring": scoring}


def stable_id(meta: dict, section: str, module: int, qnum: int) -> str:
    fam = meta["examFamily"] or "unknown"
    var = meta["examVariant"] or fam
    pt = meta["practiceTestNumber"] if meta["practiceTestNumber"] is not None else "x"
    return f"{var}-pt{pt}-{section}-m{module}-q{qnum}"


def parse_answers_pdf(path: Path) -> list[dict[str, Any]]:
    doc = pymupdf.open(path)
    # Keep page headers to track section/module; join with markers
    pieces: list[str] = []
    for page in doc:
        pieces.append(page.get_text())
    text = "\n".join(pieces)

    # Split by QUESTION N
    # Track current section/module from headers appearing before each question
    header_pat = re.compile(
        r"ANSWER EXPLANATIONS\s*[nN]\s*(READING AND WRITING|MATH)\s*:\s*MODULE\s*([12])",
        re.I,
    )
    # Also accept section intros
    intro_pat = re.compile(
        r"(Reading and Writing|Math)\s*\n\s*Module\s*([12])\s*\n\s*\((\d+)\s*questions?\)",
        re.I,
    )

    # Build a position-indexed section map
    events: list[tuple[int, str, int]] = []
    for m in header_pat.finditer(text):
        sec = "rw" if "READING" in m.group(1).upper() else "math"
        events.append((m.start(), sec, int(m.group(2))))
    for m in intro_pat.finditer(text):
        sec = "rw" if "reading" in m.group(1).lower() else "math"
        events.append((m.start(), sec, int(m.group(2))))
    events.sort()

    def section_at(pos: int) -> tuple[Optional[str], Optional[int]]:
        cur = (None, None)
        for p, s, mod in events:
            if p <= pos:
                cur = (s, mod)
            else:
                break
        return cur

    results: list[dict[str, Any]] = []
    q_iter = list(re.finditer(r"\n\s*QUESTION\s+(\d+)\s*\n", text))
    for i, m in enumerate(q_iter):
        qnum = int(m.group(1))
        start = m.end()
        end = q_iter[i + 1].start() if i + 1 < len(q_iter) else len(text)
        body = text[start:end].strip()
        # strip trailing page footers
        body = re.split(r"\n\s*\d+\s+(?:SAT|PSAT).{0,40}ANSWER EXPLANATIONS", body)[0]
        body = re.sub(r"\n\s*\d+\s*$", "", body).strip()

        sec, mod = section_at(m.start())
        correct = None
        qtype = None
        notes: list[str] = []

        m_choice = re.match(
            r"Choice\s+([A-D])\s+is\s+(?:the best answer|correct)\b[.\s]*(.*)",
            body,
            re.S | re.I,
        )
        m_spr = re.match(
            r"The correct answer is\s+([^\n]+?)(?:\.|\n)(.*)",
            body,
            re.S | re.I,
        )
        if m_choice:
            correct = m_choice.group(1).upper()
            explanation = clean_text(m_choice.group(0))
            qtype = "mcq"
        elif m_spr:
            raw_ans = m_spr.group(1).strip().rstrip(".")
            # Sometimes "The correct answer is 361/8 or 45.125"
            correct = clean_text(raw_ans)
            explanation = clean_text(m_spr.group(0))
            qtype = "spr"
        else:
            explanation = clean_text(body)
            notes.append("Could not parse correctAnswer from explanation lead-in")
            qtype = None

        results.append(
            {
                "section": sec,
                "module": mod,
                "questionNumber": qnum,
                "correctAnswer": correct,
                "officialExplanation": explanation if explanation else None,
                "questionType": qtype,
                "answerParseNotes": notes,
            }
        )

    # Deduplicate: keep last occurrence per (section, module, qnum) when headers known;
    # if section/module missing, try sequential assignment using known module sizes.
    cleaned: list[dict[str, Any]] = []
    seen = set()
    # First pass: those with section+module
    unknown = []
    for r in results:
        if r["section"] and r["module"]:
            key = (r["section"], r["module"], r["questionNumber"])
            # later overwrites earlier in OrderedDict fashion — collect then unique keep first good
            cleaned.append(r)
        else:
            unknown.append(r)

    # If any missing section, fall back to sequential buckets 33,33,27,27
    if unknown or any(r["section"] is None for r in cleaned):
        # Rebuild entirely by sequential QUESTION order within document using intro markers
        rebuilt = []
        # Find module ranges by intro_pat
        intros = list(intro_pat.finditer(text))
        if len(intros) >= 4:
            ranges = []
            for i, im in enumerate(intros):
                sec = "rw" if "reading" in im.group(1).lower() else "math"
                mod = int(im.group(2))
                start = im.start()
                end = intros[i + 1].start() if i + 1 < len(intros) else len(text)
                ranges.append((start, end, sec, mod))
            for r_start, r_end, sec, mod in ranges:
                for m in re.finditer(r"\n\s*QUESTION\s+(\d+)\s*\n", text[r_start:r_end]):
                    abs_start = r_start + m.start()
                    # find matching result by proximity — reparse body
                    qnum = int(m.group(1))
                    body_start = r_start + m.end()
                    nxt = re.search(r"\n\s*QUESTION\s+\d+\s*\n", text[body_start:r_end])
                    body_end = body_start + nxt.start() if nxt else r_end
                    body = text[body_start:body_end].strip()
                    body = re.split(r"\n\s*\d+\s+(?:SAT|PSAT).{0,40}ANSWER EXPLANATIONS", body)[0]
                    body = re.sub(r"\n\s*\d+\s*$", "", body).strip()
                    correct = None
                    qtype = None
                    notes = []
                    m_choice = re.match(
                        r"Choice\s+([A-D])\s+is\s+(?:the best answer|correct)\b",
                        body,
                        re.I,
                    )
                    m_spr = re.match(r"The correct answer is\s+([^\n]+?)(?:\.|\n)", body, re.I)
                    if m_choice:
                        correct = m_choice.group(1).upper()
                        qtype = "mcq"
                    elif m_spr:
                        correct = clean_text(m_spr.group(1).strip().rstrip("."))
                        qtype = "spr"
                    else:
                        notes.append("Could not parse correctAnswer from explanation lead-in")
                    rebuilt.append(
                        {
                            "section": sec,
                            "module": mod,
                            "questionNumber": qnum,
                            "correctAnswer": correct,
                            "officialExplanation": clean_text(body) or None,
                            "questionType": qtype,
                            "answerParseNotes": notes,
                        }
                    )
            cleaned = rebuilt

    # Dedupe by key keeping first
    deduped = []
    seen = set()
    for r in cleaned:
        key = (r["section"], r["module"], r["questionNumber"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)
    return deduped


def parse_scoring_answer_key(path: Path) -> dict[tuple, str]:
    """Parse answer key table from scoring PDF. Returns {(section,module,qnum): answer}."""
    doc = pymupdf.open(path)
    best_page = None
    best_score = -1
    for page in doc:
        blocks = page.get_text("blocks")
        # score pages that look like dedicated answer key
        text = page.get_text()
        score = 0
        if re.search(r"Answer Key", text, re.I):
            score += 5
        if "QUESTION #" in text and "CORRECT" in text:
            score += 5
        # prefer pages with many "1 | B" style pairs and less conversion-table noise
        if "Raw Score Conversion" in text:
            score -= 3
        if "Classroom Use" in text:
            score -= 5
        n_pairs = sum(1 for b in blocks if re.match(r"^\s*\d{1,2}\s*\n\s*[A-D0-9]", b[4]))
        score += min(n_pairs, 40)
        if score > best_score:
            best_score = score
            best_page = page

    if best_page is None:
        return {}

    page = best_page
    blocks = [
        b
        for b in page.get_text("blocks")
        if b[4].strip() and not FOOTER_RE.search(b[4])
    ]

    # Collect answer entry blocks: "N\nANSWER" 
    entries = []
    for b in blocks:
        txt = b[4].strip()
        m = re.match(r"^(\d{1,2})\s*\n\s*(.+)$", txt, re.S)
        if not m:
            # sometimes "20 15/17; .8824" without newline
            m = re.match(r"^(\d{1,2})\s+(.+)$", txt, re.S)
        if m:
            qn = int(m.group(1))
            ans = clean_text(m.group(2).replace("\n", " "))
            if qn <= 33 and ans:
                entries.append({"x": b[0], "y": b[1], "q": qn, "ans": ans})

    if not entries:
        return {}

    # Cluster into 4 columns by x
    xs = sorted(set(round(e["x"] / 20) * 20 for e in entries))
    # assign each entry to nearest column center
    # Better: sort unique x and k-means-ish into 4
    unique_x = sorted({round(e["x"]) for e in entries})
    # greedy column clustering
    cols_x: list[list[float]] = []
    for x in unique_x:
        if not cols_x or x - cols_x[-1][-1] > 40:
            cols_x.append([x])
        else:
            cols_x[-1].append(x)
    col_centers = [sum(c) / len(c) for c in cols_x]
    # If more than 4, merge closest; if fewer, keep
    while len(col_centers) > 4:
        # merge two closest
        gaps = [(col_centers[i + 1] - col_centers[i], i) for i in range(len(col_centers) - 1)]
        gaps.sort()
        i = gaps[0][1]
        merged = (col_centers[i] + col_centers[i + 1]) / 2
        col_centers = col_centers[:i] + [merged] + col_centers[i + 2 :]

    def col_index(x: float) -> int:
        return min(range(len(col_centers)), key=lambda i: abs(x - col_centers[i]))

    # Map columns: typically [RW1, RW2, Math1, Math2]
    col_map = {}
    if len(col_centers) >= 4:
        col_map = {0: ("rw", 1), 1: ("rw", 2), 2: ("math", 1), 3: ("math", 2)}
    elif len(col_centers) == 2:
        col_map = {0: ("rw", 1), 1: ("rw", 2)}  # incomplete
    else:
        for i in range(len(col_centers)):
            col_map[i] = ("unknown", i + 1)

    # Verify with header text if present
    header_text = page.get_text()
    # leave default mapping

    out: dict[tuple, str] = {}
    for e in entries:
        ci = col_index(e["x"])
        if ci not in col_map:
            continue
        sec, mod = col_map[ci]
        # skip if math column has q > 27
        if sec == "math" and e["q"] > 27:
            continue
        if sec == "rw" and e["q"] > 33:
            continue
        key = (sec, mod, e["q"])
        # prefer longer answer strings (SPR variants)
        if key not in out or len(e["ans"]) > len(out[key]):
            out[key] = e["ans"]
    return out


def column_lines(page, mid_x: float = 300.0) -> tuple[list[tuple[float, str]], list[tuple[float, str]]]:
    """Return (left_lines, right_lines) as (y, text) sorted."""
    d = page.get_text("dict")
    left_spans = []
    right_spans = []
    for block in d.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            if not spans:
                continue
            text = "".join(s.get("text", "") for s in spans).rstrip()
            if not text.strip():
                continue
            x0 = min(s["bbox"][0] for s in spans)
            y0 = min(s["bbox"][1] for s in spans)
            x1 = max(s["bbox"][2] for s in spans)
            # skip vertical divider dots
            if set(text.strip()) <= {".", "·", "•", "-", "_", " "}:
                continue
            if FOOTER_RE.search(text) and len(text) < 80:
                continue
            # page number alone near bottom
            if y0 > 700 and re.match(r"^\d{1,2}$", text.strip()):
                continue
            target = left_spans if x0 < mid_x else right_spans
            target.append((y0, x0, text))

    def collapse(spans):
        spans.sort(key=lambda t: (round(t[0], 1), t[1]))
        lines = []
        for y, x, text in spans:
            if lines and abs(lines[-1][0] - y) < 3.5:
                # same line — append with space if needed
                prev_y, prev = lines[-1]
                if prev.endswith("-") and text and text[0].islower():
                    lines[-1] = (prev_y, prev[:-1] + text)
                else:
                    sep = "" if prev.endswith((" ", "\n")) or text.startswith((" ", ",", ".", ";", ":")) else " "
                    # avoid double spaces for choice continuations already spaced
                    lines[-1] = (prev_y, (prev + sep + text).replace("  ", " "))
            else:
                lines.append((y, text))
        return lines

    return collapse(left_spans), collapse(right_spans)


def detect_page_context(page_text: str, current: dict) -> dict:
    ctx = dict(current)
    # Section title pages include "N QUESTIONS"; also accept any page header text.
    if re.search(r"Reading and Writing", page_text, re.I) and re.search(
        r"\d+\s*QUESTIONS", page_text, re.I
    ):
        ctx["section"] = "rw"
    # Math title: avoid matching the word Math inside explanations/passages by requiring QUESTIONS nearby
    if re.search(r"(^|\n)\s*Math\s*(\n|$)", page_text) and re.search(
        r"\d+\s*QUESTIONS", page_text, re.I
    ):
        ctx["section"] = "math"
    m = re.search(r"Module\s*\n\s*([12])\b", page_text)
    if m:
        ctx["module"] = int(m.group(1))
    return ctx


def parse_column_questions(
    lines: list[tuple[float, str]], section: Optional[str], module: Optional[int]
) -> list[dict[str, Any]]:
    """Parse questions from one column's lines."""
    items = []
    n = len(lines)

    # Drop module header + following module number at top of column
    cleaned = []
    skip_next_modnum = False
    for y, text in lines:
        ts = text.strip()
        if MODULE_ONLY_RE.match(ts):
            skip_next_modnum = True
            continue
        if skip_next_modnum and MODULE_NUM_RE.match(ts):
            skip_next_modnum = False
            continue
        skip_next_modnum = False
        if SECTION_HEADER_RE.match(ts):
            continue
        if QUESTIONS_COUNT_RE.match(ts):
            continue
        if ts.upper() == "DIRECTIONS":
            continue
        if ts.startswith("The questions in this section address"):
            continue
        if ts.startswith("question includes one or more passages"):
            continue
        if ts.startswith("and question carefully"):
            continue
        if ts.startswith("All questions in this section are multiple-choice"):
            continue
        if ts.startswith("single best answer"):
            continue
        if set(ts) <= {"-", "~", ".", " ", "—"}:
            continue
        # Module number alone near top of page (y<90)
        if y < 90 and MODULE_NUM_RE.match(ts):
            continue
        cleaned.append((y, text))

    lines = cleaned
    n = len(lines)

    starts = []
    for idx, (y, text) in enumerate(lines):
        t = text.strip()
        mq = QNUM_RE.match(t)
        if not mq:
            continue
        qn = int(mq.group(1))
        if not (1 <= qn <= 33):
            continue
        if idx + 1 >= n:
            continue
        nxt = lines[idx + 1][1].strip()
        nqm = QNUM_RE.match(nxt)
        if nqm and 1 <= int(nqm.group(1)) <= 33:
            continue
        if nxt.upper() in {"DIRECTIONS", "MODULE", "MATH", "READING AND WRITING"}:
            continue
        # Require following content to look like a stem (not tiny)
        # and not another header
        if len(nxt) < 3:
            continue
        starts.append(idx)

    for si, idx in enumerate(starts):
        qn = int(QNUM_RE.match(lines[idx][1].strip()).group(1))
        end = starts[si + 1] if si + 1 < len(starts) else n
        body_lines = [lines[j][1] for j in range(idx + 1, end)]
        while body_lines and FOOTER_RE.search(body_lines[-1]):
            body_lines.pop()
        raw = "\n".join(body_lines)
        prompt, choices, qtype, notes = split_prompt_choices(raw)
        # Reject garbage "questions" that are clearly directions remnants
        if prompt and "important reading and writing skills" in prompt.lower():
            continue
        if prompt and prompt.lower().startswith("the questions in this section"):
            continue
        items.append(
            {
                "section": section,
                "module": module,
                "questionNumber": qn,
                "prompt": prompt,
                "choices": choices,
                "questionType": qtype,
                "promptParseNotes": notes,
            }
        )
    return items


def split_prompt_choices(raw: str) -> tuple[Optional[str], Optional[list], Optional[str], list]:
    notes = []
    text = raw.strip()
    if not text:
        return None, None, None, ["empty question body"]

    # Find choice starts A) B) C) D)
    lines = text.split("\n")
    choice_idxs = []
    for i, line in enumerate(lines):
        if CHOICE_START_RE.match(line.strip()):
            choice_idxs.append(i)

    # Valid MCQ if we see A) and at least B)
    labels = []
    for i in choice_idxs:
        m = CHOICE_START_RE.match(lines[i].strip())
        if m:
            labels.append(m.group(1))

    if labels[:2] == ["A", "B"] and "A" in labels and "D" in labels:
        # take from first A)
        first_a = min(i for i, line in enumerate(lines) if CHOICE_START_RE.match(line.strip()) and line.strip().startswith("A)"))
        prompt = clean_text("\n".join(lines[:first_a]))
        choices = []
        cur_label = None
        cur_parts = []
        for line in lines[first_a:]:
            m = CHOICE_START_RE.match(line.strip())
            if m:
                if cur_label:
                    choices.append({"label": cur_label, "text": clean_text(" ".join(cur_parts))})
                cur_label = m.group(1)
                cur_parts = [m.group(2)] if m.group(2) is not None else []
            else:
                if cur_label:
                    cur_parts.append(line.strip())
        if cur_label:
            choices.append({"label": cur_label, "text": clean_text(" ".join(cur_parts))})
        # ensure A-D
        have = {c["label"] for c in choices}
        if have != {"A", "B", "C", "D"}:
            notes.append(f"MCQ choices incomplete: {sorted(have)}")
        return prompt or None, choices, "mcq", notes

    # Possibly SPR (math student-produced response) — no choices
    # Heuristic: contains "student-produced" or no A) choices and section math
    lower = text.lower()
    if "student-produced response" in lower or (
        "A)" not in text and "B)" not in text
    ):
        prompt = clean_text(text)
        if "A)" not in text:
            notes.append("No A)-D) choices recovered; treated as SPR/open if math")
        return prompt or None, None, "spr_or_open", notes

    # Partial choices
    if choice_idxs:
        first = choice_idxs[0]
        prompt = clean_text("\n".join(lines[:first]))
        notes.append("Partial/irregular choices; prompt split at first A)-D) marker")
        choices = []
        cur_label = None
        cur_parts = []
        for line in lines[first:]:
            m = CHOICE_START_RE.match(line.strip())
            if m:
                if cur_label:
                    choices.append({"label": cur_label, "text": clean_text(" ".join(cur_parts))})
                cur_label = m.group(1)
                cur_parts = [m.group(2)]
            else:
                if cur_label:
                    cur_parts.append(line.strip())
        if cur_label:
            choices.append({"label": cur_label, "text": clean_text(" ".join(cur_parts))})
        return prompt or None, choices or None, "mcq_partial", notes

    return clean_text(text) or None, None, "unknown", ["Could not detect choices"]


def page_has_images(page) -> bool:
    return bool(page.get_images()) or any(
        b.get("type") == 1 for b in page.get_text("dict").get("blocks", [])
    )


def parse_test_pdf(path: Path) -> list[dict[str, Any]]:
    doc = pymupdf.open(path)
    ctx = {"section": None, "module": None}
    all_q: list[dict[str, Any]] = []
    for page in doc:
        text = page.get_text()
        # skip front matter without questions
        if "Test begins on the next page" in text and "A)" not in text:
            ctx = detect_page_context(text, ctx)
            continue
        prev = dict(ctx)
        ctx = detect_page_context(text, ctx)
        # If this is a section title page with directions and maybe q1/q2
        left, right = column_lines(page)
        has_img = page_has_images(page)

        # Determine mid dynamically from question number positions if possible
        # already using 300 default which works for these letter PDFs

        for col_lines in (left, right):
            qs = parse_column_questions(col_lines, ctx.get("section"), ctx.get("module"))
            for q in qs:
                if has_img:
                    q.setdefault("promptParseNotes", []).append(
                        "Page contains image(s)/figure(s); figure content not fully extracted as text"
                    )
                all_q.append(q)

    # Fix section/module assignment when question numbers restart
    # Walk in document order; when qnum decreases significantly, may be new module —
    # but ctx should handle it. Still, some pages may miss module header.
    # Post-process: assign expected sequence for digital SAT linear: rw1(1-33), rw2(1-33), math1(1-27), math2(1-27)
    return reconcile_modules(all_q)


def reconcile_modules(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fill missing section/module using expected digital practice order."""
    expected = [
        ("rw", 1, 33),
        ("rw", 2, 33),
        ("math", 1, 27),
        ("math", 2, 27),
    ]
    # Group consecutive runs by increasing question numbers
    if not questions:
        return questions

    # If most already have section+module, just fill gaps
    missing = sum(1 for q in questions if not q.get("section") or not q.get("module"))
    if missing == 0:
        return questions

    # Greedy assign in order
    out = []
    exp_i = 0
    prev_q = 0
    for q in questions:
        qn = q["questionNumber"]
        if exp_i < len(expected):
            sec, mod, limit = expected[exp_i]
            # advance bucket if question number restarted or exceeds limit
            if (qn < prev_q and prev_q > 5) or (qn == 1 and prev_q > 1):
                # likely new module
                if prev_q > 0:
                    exp_i = min(exp_i + 1, len(expected) - 1)
                    sec, mod, limit = expected[exp_i]
            if qn > limit and exp_i + 1 < len(expected):
                exp_i += 1
                sec, mod, limit = expected[exp_i]
            if not q.get("section"):
                q["section"] = sec
            if not q.get("module"):
                q["module"] = mod
        prev_q = qn
        out.append(q)
    return out


def merge_pack(meta: dict, pdfs: dict, pack_dir: Path) -> tuple[list[dict], dict]:
    issues = []
    answers_path = pack_dir / pdfs["answers"] if pdfs.get("answers") else None
    test_path = pack_dir / pdfs["test"] if pdfs.get("test") else None
    scoring_path = pack_dir / pdfs["scoring"] if pdfs.get("scoring") else None

    answers = parse_answers_pdf(answers_path) if answers_path and answers_path.exists() else []
    if not answers:
        issues.append("No answers/explanations parsed")

    scoring_key = {}
    if scoring_path and scoring_path.exists():
        try:
            scoring_key = parse_scoring_answer_key(scoring_path)
        except Exception as e:
            issues.append(f"Scoring answer key parse failed: {e}")

    prompts = parse_test_pdf(test_path) if test_path and test_path.exists() else []
    if not prompts:
        issues.append("No test questions/prompts parsed")

    def prompt_score(p: dict) -> int:
        score = 0
        if p.get("prompt"):
            score += min(len(p["prompt"]), 500) // 10
        ch = p.get("choices") or []
        if isinstance(ch, list) and len(ch) == 4:
            score += 100
        elif ch:
            score += 30
        notes = " ".join(p.get("promptParseNotes") or [])
        if "figure" in notes.lower():
            score -= 5
        if p.get("questionType") == "mcq":
            score += 20
        # penalize direction-like prompts
        pr = (p.get("prompt") or "").lower()
        if "important reading and writing skills" in pr:
            score -= 200
        return score

    # Index prompts — keep best-scoring candidate per key
    prompt_map = {}
    for p in prompts:
        key = (p.get("section"), p.get("module"), p.get("questionNumber"))
        if key not in prompt_map or prompt_score(p) > prompt_score(prompt_map[key]):
            prompt_map[key] = p

    answer_map = {}
    for a in answers:
        key = (a.get("section"), a.get("module"), a.get("questionNumber"))
        if key not in answer_map:
            answer_map[key] = a

    # Authoritative keys from answers/scoring only (prompts may have phantom nums)
    keys = sorted(
        set(answer_map) | set(scoring_key),
        key=lambda k: (
            {"rw": 0, "math": 1, None: 9}.get(k[0], 8),
            k[1] or 9,
            k[2] or 999,
        ),
    )
    if not keys:
        keys = sorted(
            set(prompt_map),
            key=lambda k: (
                {"rw": 0, "math": 1, None: 9}.get(k[0], 8),
                k[1] or 9,
                k[2] or 999,
            ),
        )
        issues.append("Fell back to prompt-derived keys; answers unavailable")

    records = []
    for key in keys:
        sec, mod, qn = key
        if sec is None or mod is None or qn is None:
            issues.append(f"Skipping incomplete key {key}")
            continue
        p = prompt_map.get(key, {})
        a = answer_map.get(key, {})
        scored = scoring_key.get(key)

        correct = a.get("correctAnswer")
        # Prefer scoring key for SPR multi-form answers when richer
        if scored:
            if not correct:
                correct = scored
            elif a.get("questionType") == "spr" or (
                isinstance(correct, str) and correct[:1] not in "ABCD"
            ):
                # scoring often has accepted equivalents
                if len(str(scored)) > len(str(correct)) or ";" in str(scored):
                    correct = scored
            elif correct in "ABCD" and scored in "ABCD" and correct != scored:
                # conflict — trust explanations, note scoring mismatch
                p.setdefault("promptParseNotes", [])
                notes = list(p.get("promptParseNotes") or [])
                notes.append(f"Answer key mismatch: explanation={correct} scoring={scored}; kept explanation")
                p["promptParseNotes"] = notes

        # Prefer answer-key letter vs free-response to classify type
        if correct and isinstance(correct, str) and re.fullmatch(r"[A-D]", correct.strip()):
            qtype = "mcq"
        elif correct:
            qtype = "spr"
        else:
            qtype = a.get("questionType") or p.get("questionType")

        choices = p.get("choices")
        # SPR must not carry neighboring MCQ choices
        if qtype == "spr":
            choices = None
        elif qtype == "mcq" and not choices:
            pass

        notes = []
        notes.extend(a.get("answerParseNotes") or [])
        notes.extend(p.get("promptParseNotes") or [])
        if not p.get("prompt"):
            notes.append("prompt not recovered from test PDF (two-column/OCR limits or figure-only)")
        if qtype == "mcq" and not choices:
            notes.append("choices not recovered from test PDF")
        if not a.get("officialExplanation"):
            notes.append("officialExplanation not recovered")
        if not correct:
            notes.append("correctAnswer not recovered")

        skill = None
        difficulty = None
        notes.append("skill/topic not present in these PDFs (null)")
        notes.append("difficulty not present in these PDFs (null)")

        rec = {
            "id": stable_id(meta, sec, mod, qn),
            "examFamily": meta["examFamily"],
            "examVariant": meta["examVariant"],
            "practiceTestNumber": meta["practiceTestNumber"],
            "section": sec,
            "module": mod,
            "questionNumber": qn,
            "questionType": qtype,
            "prompt": p.get("prompt"),
            "choices": choices,
            "correctAnswer": correct,
            "officialExplanation": a.get("officialExplanation"),
            "skill": skill,
            "topic": None,
            "difficulty": difficulty,
            "source": {
                "packId": meta["packId"],
                "testPdf": pdfs.get("test"),
                "answersPdf": pdfs.get("answers"),
                "scoringPdf": pdfs.get("scoring"),
            },
            "extractionNotes": notes,
        }
        records.append(rec)

    # Deduplicate by stable business key
    dedup = OrderedDict()
    for r in records:
        k = (r["examFamily"], r["practiceTestNumber"], r["section"], r["module"], r["questionNumber"])
        if k in dedup:
            issues.append(f"Duplicate key dropped: {k}")
            continue
        dedup[k] = r
    records = list(dedup.values())

    stats = {
        "questionCount": len(records),
        "withPrompt": sum(1 for r in records if r["prompt"]),
        "withChoices": sum(1 for r in records if r["choices"]),
        "withCorrect": sum(1 for r in records if r["correctAnswer"]),
        "withExplanation": sum(1 for r in records if r["officialExplanation"]),
        "bySectionModule": {},
        "issues": issues,
    }
    for r in records:
        sm = f"{r['section']}-m{r['module']}"
        stats["bySectionModule"][sm] = stats["bySectionModule"].get(sm, 0) + 1
    return records, stats


def main():
    manifest = {
        "generatedAt": "2026-09-06T13:21:00Z",
        "sourceRoot": str(STAGED),
        "outputRoot": str(OUT),
        "packs": [],
        "totals": {"packs": 0, "questions": 0},
        "formatNotes": [
            "skill/topic and difficulty are not printed in these College Board paper/digital-accommodation PDFs; fields are null.",
            "Test booklets are two-column; prompts/choices extracted via PyMuPDF coordinate column split — figures/tables may be incomplete.",
            "SPR correctAnswer may include multiple accepted forms from scoring guide when available (semicolon-separated).",
            "Ids are stable: {examVariant}-pt{N}-{rw|math}-m{1|2}-q{N}.",
        ],
    }

    summary_counts = {}
    sample_questions = []

    packs = sorted([p for p in STAGED.iterdir() if p.is_dir()])
    for pack_dir in packs:
        meta = pack_meta(pack_dir.name)
        pdfs = classify_pdfs(pack_dir)
        print(f"Extracting {pack_dir.name} ...", flush=True)
        records, stats = merge_pack(meta, pdfs, pack_dir)
        out_name = f"{pack_dir.name}.jsonl"
        out_path = OUT / out_name
        with out_path.open("w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

        pack_entry = {
            "packId": pack_dir.name,
            "examFamily": meta["examFamily"],
            "examVariant": meta["examVariant"],
            "practiceTestNumber": meta["practiceTestNumber"],
            "pdfs": pdfs,
            "outputFile": out_name,
            "questionCount": stats["questionCount"],
            "coverage": {
                "withPrompt": stats["withPrompt"],
                "withChoices": stats["withChoices"],
                "withCorrect": stats["withCorrect"],
                "withExplanation": stats["withExplanation"],
            },
            "bySectionModule": stats["bySectionModule"],
            "issues": stats["issues"],
            "notes": meta.get("notes") or [],
        }
        manifest["packs"].append(pack_entry)
        summary_counts[pack_dir.name] = stats["questionCount"]
        manifest["totals"]["questions"] += stats["questionCount"]

        # collect samples from first SAT pack with good data
        if meta["examFamily"] == "sat" and len(sample_questions) < 2:
            for r in records:
                if r.get("prompt") and r.get("correctAnswer") and r.get("officialExplanation"):
                    sample_questions.append(
                        {
                            "id": r["id"],
                            "section": r["section"],
                            "module": r["module"],
                            "questionNumber": r["questionNumber"],
                            "prompt": (r["prompt"] or "")[:400],
                            "choices": r["choices"],
                            "correctAnswer": r["correctAnswer"],
                            "explanationPreview": (r["officialExplanation"] or "")[:300],
                        }
                    )
                    if len(sample_questions) >= 2:
                        break

    manifest["totals"]["packs"] = len(manifest["packs"])
    manifest["sampleQuestions"] = sample_questions

    # Format issues that could block import
    import_blockers = []
    for p in manifest["packs"]:
        if p["questionCount"] == 0:
            import_blockers.append(f"{p['packId']}: zero questions extracted")
        if p["coverage"]["withCorrect"] < p["questionCount"]:
            import_blockers.append(
                f"{p['packId']}: {p['questionCount'] - p['coverage']['withCorrect']} missing correctAnswer"
            )
        if p["coverage"]["withPrompt"] < p["questionCount"] * 0.5:
            import_blockers.append(
                f"{p['packId']}: low prompt recovery ({p['coverage']['withPrompt']}/{p['questionCount']})"
            )
        expected = 120  # all these packs advertise 33+33+27+27
        if p["questionCount"] != expected:
            import_blockers.append(
                f"{p['packId']}: questionCount={p['questionCount']} (expected {expected} for digital linear format)"
            )

    manifest["importArchitectureFlags"] = import_blockers

    with (OUT / "manifest.json").open("w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    # Also write a concise report
    report = {
        "countsPerPack": summary_counts,
        "totalQuestions": manifest["totals"]["questions"],
        "filesWritten": [p["outputFile"] for p in manifest["packs"]] + ["manifest.json"],
        "sampleQuestions": sample_questions,
        "importArchitectureFlags": import_blockers,
    }
    with (OUT / "extraction-report.json").open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(json.dumps(report, indent=2)[:5000])
    print("DONE")


if __name__ == "__main__":
    main()
