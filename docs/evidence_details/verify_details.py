"""Check frozen evidence and guide links without fitting or executing historical code."""
from pathlib import Path
import hashlib
import json
import re
import urllib.parse

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "docs/evidence_details/MANIFEST.json"


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    failures = []
    file_count = 0
    for row in manifest["files"] + manifest["preexisting_bindings"]:
        path = (ROOT / row["path"]).resolve()
        file_count += 1
        if not path.is_relative_to(ROOT) or not path.is_file():
            failures.append({"path": row["path"], "reason": "missing_or_outside"})
            continue
        if hashlib.sha256(path.read_bytes()).hexdigest() != row["sha256"]:
            failures.append({"path": row["path"], "reason": "sha_mismatch"})

    # The report may be edited: only the declared frozen source identities are bound.
    # Do not freeze creation times, manuscript_sha256 or the entire claims document.
    claim_count = 0
    try:
        claims = json.loads((ROOT / "docs/claim_sources.json").read_text(encoding="utf-8"))
        for source_id, expected in manifest["claim_source_bindings"].items():
            claim_count += 1
            actual = claims["sources"].get(source_id, {})
            for field in ("portable_path", "sha256"):
                if actual.get(field) != expected[field]:
                    failures.append({"source_id": source_id, "field": field,
                                     "reason": "source_entry_mismatch"})
    except (OSError, ValueError, KeyError, TypeError) as error:
        failures.append({"path": "docs/claim_sources.json", "reason": "unreadable_sources",
                         "error_type": type(error).__name__})

    guide = ROOT / "docs/EVIDENCE_GUIDE.md"
    link_count = 0
    for raw in re.findall(r"\[[^\]]*\]\(([^)]+)\)", guide.read_text(encoding="utf-8")):
        target = urllib.parse.unquote(raw.strip("<>").split("#", 1)[0])
        if not target or re.match(r"^[A-Za-z]+:", target):
            continue
        link_count += 1
        path = (guide.parent / target).resolve()
        if not path.is_relative_to(ROOT) or not path.is_file():
            failures.append({"link": raw, "reason": "guide_target_missing_or_outside"})

    print(json.dumps({"passed": not failures, "file_bindings_checked": file_count,
                      "claim_source_entries_checked": claim_count,
                      "claim_document_metadata_frozen": False,
                      "guide_links_checked": link_count, "failures": failures,
                      "new_fits": 0,
                      "execution_scope": "frozen source identities, hashes and guide links only"},
                     ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
