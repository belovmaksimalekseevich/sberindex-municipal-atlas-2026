"""No-fit acceptance and corruption tests against an existing SSE6 experiment."""
import argparse
from collections import Counter
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("sse6_checker", HERE / "check-sse6-replay.py")
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)
SOURCE = None
SCRATCH = None


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


class ReplayChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if SOURCE is None or SCRATCH is None:
            raise unittest.SkipTest("requires --out with a real replay and --scratch; no scientific acceptance from discovery")

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="sse6-check-", dir=SCRATCH)
        self.folder = Path(self.temporary.name).resolve()
        self.assertTrue(self.folder.is_relative_to(SCRATCH))
        self.out = self.folder / "result"
        shutil.copytree(SOURCE, self.out)

    def tearDown(self):
        self.assertTrue(self.folder.is_relative_to(SCRATCH))
        self.temporary.cleanup()

    def rehash(self):
        commit = load(self.out / "COMMIT.json")
        for name in commit["files"]:
            path = self.out / name
            commit["files"][name] = {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size}
        save(self.out / "COMMIT.json", commit)

    def rejected(self, fragment):
        with self.assertRaisesRegex(ValueError, fragment):
            checker.check(self.out)

    def test_real_result_passes(self):
        result = checker.check(self.out)
        self.assertTrue(result["passed"])
        self.assertEqual(result["new_fits"], 0)
        self.assertFalse(result["full_replay_acceptance"])

    def test_incomplete_result_rejected(self):
        (self.out / "labels.json").unlink()
        self.rejected("incomplete")

    def test_unbound_change_rejected(self):
        result = load(self.out / "result.json")
        result["metrics"]["SW"]["value"] += 1
        save(self.out / "result.json", result)
        self.rejected("SHA mismatch")

    def test_rehashed_false_metric_rejected(self):
        result = load(self.out / "result.json")
        result["metrics"]["SW"]["value"] += 1
        save(self.out / "result.json", result)
        self.rehash()
        self.rejected("outside tolerance")

    def test_rehashed_membership_change_rejected(self):
        result = load(self.out / "result.json")
        values = result["labels"]
        other = next(i for i, value in enumerate(values) if value != values[0])
        values[0], values[other] = values[other], values[0]
        labels = load(self.out / "labels.json")
        labels["labels"] = values
        provenance = load(self.out / "provenance.json")
        provenance["labels_sha256"] = digest(values)
        for metric in result["metrics"].values():
            metric["provenance"]["partition_hash"] = digest(values)
        for name, data in [("result.json", result), ("labels.json", labels), ("provenance.json", provenance)]:
            save(self.out / name, data)
        self.rehash()
        self.rejected("membership differs")

    def test_rehashed_wrong_sources_rejected(self):
        provenance = load(self.out / "provenance.json")
        provenance["sources"]["experiments/run.py"]["sha256"] = "0" * 64
        save(self.out / "provenance.json", provenance)
        self.rehash()
        self.rejected("source bindings")

    def test_duplicate_profile_rejected(self):
        result = load(self.out / "result.json")
        result["profiles"] = [copy.deepcopy(result["profiles"][0]) for _ in range(6)]
        save(self.out / "result.json", result)
        self.rehash()
        self.rejected("profile coverage")

    def test_artificial_IDs_rejected(self):
        result = load(self.out / "result.json")
        result["support_IDs"] = ["T" + str(i) for i in range(2103)]
        save(self.out / "result.json", result)
        self.rehash()
        self.rejected("ordered IDs")

    def test_changed_seed_scale_rejected(self):
        attempts = load(self.out / "attempts.json")
        attempts[1]["SST"]["numerator"] = str(int(attempts[1]["SST"]["numerator"]) + 1)
        save(self.out / "attempts.json", attempts)
        self.rehash()
        self.rejected("seed scale")

    def test_consistent_label_permutation_passes(self):
        result = load(self.out / "result.json")
        remap = lambda values: [(v + 1) % 6 for v in values]
        result["labels"] = remap(result["labels"])
        counts = Counter(result["labels"])
        result["sizes"] = [counts[k] for k in range(6)]
        for profile in result["profiles"]:
            profile["group_index"] = (profile["group_index"] + 1) % 6
        for attempt in result["attempts"]:
            attempt["labels"] = remap(attempt["labels"])
        attempts = load(self.out / "attempts.json")
        for attempt in attempts:
            attempt["labels"] = remap(attempt["labels"])
        labels = load(self.out / "labels.json")
        labels["labels"] = result["labels"]
        provenance = load(self.out / "provenance.json")
        provenance["labels_sha256"] = digest(result["labels"])
        for metric in result["metrics"].values():
            metric["provenance"]["partition_hash"] = digest(result["labels"])
        for name, value in [("result.json", result), ("attempts.json", attempts), ("labels.json", labels), ("provenance.json", provenance)]:
            save(self.out / name, value)
        self.rehash()
        self.assertTrue(checker.check(self.out)["passed"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="existing real replay; never modified")
    parser.add_argument("--scratch", type=Path, required=True, help="external directory for temporary test copies")
    args = parser.parse_args()
    SOURCE = args.out.resolve()
    SCRATCH = args.scratch.resolve()
    if SCRATCH.is_relative_to(checker.ROOT) or SCRATCH.is_relative_to(SOURCE) or SOURCE.is_relative_to(SCRATCH):
        parser.error("scratch must be outside the checkout and separate from the source result")
    SCRATCH.mkdir(parents=True, exist_ok=True)
    outcome = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ReplayChecks))
    raise SystemExit(0 if outcome.wasSuccessful() else 1)
