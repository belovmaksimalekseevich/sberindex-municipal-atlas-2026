"""Read-only gate for the owner's author/committer identity and commit history."""
from pathlib import Path
import argparse
import json
import re
import subprocess
import sys

NAME = "Maksim"
EMAIL = "288846426+belovmaksimalekseevich@users.noreply.github.com"


def git(repo, *args, required=True):
    result = subprocess.run(["git", "-C", str(repo), *args], text=True, encoding="utf8", capture_output=True)
    if required and result.returncode:
        raise ValueError(result.stderr.strip())
    return result


def check(repo):
    git(repo, "rev-parse", "--show-toplevel")
    for role in ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"]:
        value = git(repo, "var", role).stdout.strip()
        if not value.startswith(f"{NAME} <{EMAIL}> "):
            raise ValueError(role + " does not match the owner's account")
    count = 0
    if git(repo, "rev-parse", "--verify", "HEAD", required=False).returncode == 0:
        history = git(repo, "log", "--all", "--format=%H%x00%an%x00%ae%x00%cn%x00%ce").stdout
        for line in history.splitlines():
            commit, author, email, committer, committer_email = line.split("\0")
            if (author, email, committer, committer_email) != (NAME, EMAIL, NAME, EMAIL):
                raise ValueError("foreign author/committer: " + commit)
            count += 1
        messages = git(repo, "log", "--all", "--format=%B").stdout
        for trailer in re.findall(r"^Co-authored-by:\s*(.+)$", messages, flags=re.MULTILINE | re.IGNORECASE):
            if trailer.strip() != f"{NAME} <{EMAIL}>":
                raise ValueError("foreign coauthor trailer")
    return {"passed": True, "commits_checked": count, "author_and_committer": f"{NAME} <{EMAIL}>", "writes": 0}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(check(Path(args.repo).resolve()), ensure_ascii=False, indent=2))
    except (ValueError, OSError) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        sys.exit(2)
