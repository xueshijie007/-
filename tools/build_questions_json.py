from __future__ import annotations

import json
import re
from pathlib import Path


HEADER_RE = re.compile(r"^===\s*([^（]+)（(科目[一二])）共")
QUESTION_RE = re.compile(r"^\s*(\d+)\.\s*【([^】]+)】\s*(.*)$")
OPTION_RE = re.compile(r"^\s*([A-Z])\.\s*(.*)$")
ANSWER_RE = re.compile(r"正确答案:\s*(.+)\s*$")
SEPARATOR_RE = re.compile(r"^-{10,}\s*$")
TAG_RE = re.compile(r"<[^>]+>")


def parse_file(file_path: Path) -> list[dict]:
    lines = file_path.read_text(encoding="utf-8").splitlines()
    questions: list[dict] = []
    current_subject = "未知"
    current: dict | None = None

    def flush() -> None:
        nonlocal current
        if not current:
            return
        stem = " ".join(s.strip() for s in current["stem_lines"] if s.strip())
        stem = TAG_RE.sub("", stem).strip()
        answer = current.get("answer", "").strip()
        if stem and answer:
            questions.append(
                {
                    "qtype": current["qtype"],
                    "subject": current["subject"],
                    "stem": stem,
                    "options": current["options"],
                    "answer": answer,
                }
            )
        current = None

    for line in lines:
        header_match = HEADER_RE.match(line.strip())
        if header_match:
            flush()
            current_subject = header_match.group(2)
            continue

        question_match = QUESTION_RE.match(line)
        if question_match:
            flush()
            current = {
                "qtype": question_match.group(2).strip(),
                "subject": current_subject,
                "stem_lines": [question_match.group(3).strip()],
                "options": [],
                "answer": "",
            }
            continue

        if current is None:
            continue

        answer_match = ANSWER_RE.search(line)
        if answer_match:
            current["answer"] = answer_match.group(1).strip()
            continue

        option_match = OPTION_RE.match(line)
        if option_match:
            current["options"].append({"key": option_match.group(1), "text": option_match.group(2).strip()})
            continue

        if SEPARATOR_RE.match(line) or not line.strip():
            continue

        current["stem_lines"].append(line.strip())

    flush()
    return questions


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    bank_dir = root / ("\u9ad8\u6821\u6559\u5e08\u8d44\u683c_\u4e24\u79d1\u5408\u5e76_\u6309\u9898\u578b")
    out_file = root / "quiz_site" / "data" / "questions.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)

    all_questions: list[dict] = []
    idx = 1

    for file_path in sorted(bank_dir.glob("*.txt")):
        for q in parse_file(file_path):
            q["id"] = idx
            q["source"] = file_path.name
            all_questions.append(q)
            idx += 1

    out_file.write_text(
        json.dumps(all_questions, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"题库目录: {bank_dir}")
    print(f"输出文件: {out_file}")
    print(f"题目总数: {len(all_questions)}")


if __name__ == "__main__":
    main()
