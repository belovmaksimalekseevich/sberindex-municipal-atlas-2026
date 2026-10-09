"""Verify the portable release or explicitly start its separate full fit."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify():
    manifest = json.loads((ROOT / "PACKAGE_MANIFEST.json").read_text(encoding="utf-8"))
    expected = manifest["files"]
    actual = {p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*") if p.is_file() and p != ROOT / "PACKAGE_MANIFEST.json"}
    if actual != set(expected):
        raise ValueError("The release has missing or unexpected files")
    for name, bound in expected.items():
        path = (ROOT / name).resolve()
        if not path.is_relative_to(ROOT) or path.stat().st_size != bound["bytes"] or sha(path) != bound["sha256"]:
            raise ValueError("Release member mismatch: " + name)
    receipt = subprocess.run([sys.executable, "-B", str(ROOT / "code/typology.py"), "verify"], check=True, capture_output=True, text=True, encoding="utf-8")
    saved = json.loads(receipt.stdout)
    if not saved.get("passed") or saved.get("new_fits") != 0:
        raise ValueError("Saved-result verifier did not pass")
    return {"passed": True, "release_members": len(expected), "saved_verification": saved, "new_fits": 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("verify", help="check all release hashes and 532 saved partitions; no fitting")
    full = commands.add_parser("full-fit", help="start a separate full computation on Linux")
    full.add_argument("--out", required=True)
    full.add_argument("--allow-real-fitting", action="store_true", required=True)
    full.add_argument("--exclusive-cpus-confirmed", action="store_true", required=True)
    args = parser.parse_args()
    result = verify()
    if args.command == "verify":
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    target = Path(args.out).resolve()
    if target.is_relative_to(ROOT) or target.exists():
        raise ValueError("Full fit needs a fresh output directory outside the entire release")
    command = [sys.executable, "-B", str(ROOT / "code/typology.py"), "compute", "--out", str(target), "--allow-real-fitting", "--exclusive-cpus-confirmed"]
    return subprocess.run(command, check=False).returncode


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        sys.exit(2)
