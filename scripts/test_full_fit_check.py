"""Small behavioral tests; no scientific fits or claim of a full replay."""
import copy
from contextlib import ExitStack
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location("full_fit_check", Path(__file__).with_name("full-fit-check.py"))
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


def fixture():
    return {"scope": "national", "variant": "mixed", "month": "2024-12", "method": "SSE", "K": 2,
            "N": 4, "support_IDs": ["1", "2", "3", "4"], "labels": [0, 0, 1, 1], "sizes": [2, 2],
            "status": "completed", "pointwise_SW": [0.5] * 4, "package_manifest_sha256": "saved",
            "metrics": {"SW": {"status": "ok", "value": 0.5},
                        "S_Dbw": {"status": "undefined", "value": None, "reason": "degenerate"}},
            "source_member": "historical", "semantic_profiles": []}


class ReplayCheckerTests(unittest.TestCase):
    def test_duplicate_and_nonfinite_json(self):
        for value in ['{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}', '{"a":1e999}', '{"a":-1e999}']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                CHECK.parse(value)

    def test_float_rule_is_fixed_and_typed(self):
        CHECK.compare(1.0, 1.0 + CHECK.ATOL / 2)
        for value in [1.001, float("nan"), float("inf"), 1, True, None]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                CHECK.compare(1.0, value)

    def test_status_and_reason_are_exact(self):
        a = {"status": "undefined", "value": None, "reason": "original"}
        for key, value in [("status", "ok"), ("value", 0.0), ("reason", "other")]:
            b = dict(a, **{key: value})
            with self.subTest(key=key), self.assertRaises(ValueError):
                CHECK.compare(a, b)

    def test_label_permutation_preserves_membership(self):
        self.assertEqual(CHECK.label_mapping([0, 0, 1, 1], [1, 1, 0, 0], 2), {1: 0, 0: 1})
        for labels in [[0, 1, 0, 1], [0, 0, 0, 0], [False, False, True, True], [0, 0, 1]]:
            with self.subTest(labels=labels), self.assertRaises(ValueError):
                CHECK.label_mapping([0, 0, 1, 1], labels, 2)

    def test_cell_comparison_does_not_mutate(self):
        baseline = fixture()
        actual = copy.deepcopy(baseline)
        actual["package_manifest_sha256"] = "current"
        actual["labels"] = [1, 1, 0, 0]
        before = copy.deepcopy((baseline, actual))
        self.assertEqual(CHECK.compare_cell(baseline, actual, "current"), {1: 0, 0: 1})
        self.assertEqual((baseline, actual), before)

    def test_cell_rejects_wrong_ids_sizes_metrics_and_source(self):
        baseline = fixture()
        for key, value in [("support_IDs", ["1", "2", "3", "5"]), ("sizes", [1, 3]),
                           ("status", "FAILED"), ("pointwise_SW", [0.1] * 4),
                           ("package_manifest_sha256", "wrong")]:
            actual = copy.deepcopy(baseline)
            actual["package_manifest_sha256"] = "current"
            actual[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                CHECK.compare_cell(baseline, actual, "current")

    def test_context_profiles_follow_permutation(self):
        baseline = fixture()
        baseline["scope"] = "context"
        baseline["IDs"] = baseline.pop("support_IDs")
        baseline.pop("semantic_profiles")
        baseline["profiles"] = [{"cluster": 0, "member_IDs": ["1", "2"]},
                                {"cluster": 1, "member_IDs": ["3", "4"]}]
        actual = copy.deepcopy(baseline)
        actual["labels"] = [1, 1, 0, 0]
        actual["profiles"] = [{"cluster": 0, "member_IDs": ["3", "4"]},
                              {"cluster": 1, "member_IDs": ["1", "2"]}]
        self.assertEqual(CHECK.compare_cell(baseline, actual, "unused"), {1: 0, 0: 1})
        actual["profiles"][0]["member_IDs"] = ["1", "2"]
        with self.assertRaises(ValueError):
            CHECK.compare_cell(baseline, actual, "unused")

    def test_output_paths(self):
        with self.assertRaises(ValueError):
            CHECK.external(CHECK.ROOT / "research/not-allowed")
        with tempfile.TemporaryDirectory(prefix="full replay check ") as folder:
            path = Path(folder)
            with self.assertRaises(ValueError):
                CHECK.external(path, fresh=True)
            self.assertEqual(CHECK.external(path / "new", fresh=True), (path / "new").resolve())
            self.assertFalse((path / "new").exists())

    def test_unsafe_member_paths(self):
        for path in ["../escape", "/abs", "a//b", "a/./b", "C:/abs", "a\\b", ""]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                CHECK.relative_name(path)

    def test_directory_inventory_hash_and_extras(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "chunk").mkdir()
            data = root / "chunk/data.json"
            data.write_text('{"value": 1}', encoding="utf-8")
            (root / "chunk/COMMIT.json").write_text("{}", encoding="utf-8")
            inventory = {"data.json": CHECK.digest(data)}
            source = CHECK.Source(out=root)
            source.inventory("chunk/", inventory, "COMMIT.json")
            data.write_text('{"value": 2}', encoding="utf-8")
            with self.assertRaises(ValueError):
                CHECK.Source(out=root).inventory("chunk/", inventory, "COMMIT.json")
            data.write_text('{"value": 1}', encoding="utf-8")
            (root / "chunk/extra.json").write_text("{}", encoding="utf-8")
            with self.assertRaises(ValueError):
                CHECK.Source(out=root).inventory("chunk/", inventory, "COMMIT.json")

    def test_zip_readback_without_extraction(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "out.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("compute/chunk/data.json", '{"value":1}')
                archive.writestr("compute/chunk/COMMIT.json", "{}")
            source = CHECK.Source(archive=path)
            try:
                self.assertEqual(source.read("chunk/data.json"), {"value": 1})
                source.inventory("chunk/", {"data.json": source.sha("chunk/data.json")}, "COMMIT.json")
            finally:
                source.close()
            self.assertEqual(list(Path(folder).iterdir()), [path])

    def test_missing_completed_receipt_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "RECEIPT.json").write_text('{"status":"HELD"}', encoding="utf-8")
            (Path(folder) / "PLAN.json").write_text('{}', encoding="utf-8")
            with patch.object(CHECK, "verify_package", return_value={}), self.assertRaises(ValueError):
                CHECK.check_result(CHECK.Source(out=folder))

    def test_saved_cleanup_is_not_live_check(self):
        owner = {"pid": 1, "start_ticks": 1, "boot_id": "historical"}
        self.assertFalse(CHECK.owner_check([owner], False)["performed"])
        with patch.object(CHECK.platform, "system", return_value="Windows"), self.assertRaises(ValueError):
            CHECK.owner_check([owner], True)

    def test_preflight_does_not_create_output_or_run_fit(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "not created"
            with patch.object(CHECK.platform, "system", return_value="Windows"), self.assertRaises(ValueError):
                CHECK.preflight(target)
            self.assertFalse(target.exists())

    def test_preflight_linux_checks_environment_without_reserving(self):
        dependencies = CHECK.read(CHECK.CODE / "science/context/PLAN.json")["dependencies"]
        original_read = Path.read_text
        def read_text(path, *args, **kwargs):
            if str(path).replace("\\", "/") == "/proc/meminfo":
                return "MemTotal: 16777216 kB\nMemAvailable: 8388608 kB\n"
            return original_read(path, *args, **kwargs)
        with tempfile.TemporaryDirectory() as folder, ExitStack() as stack:
            target = Path(folder) / "not created"
            stack.enter_context(patch.object(CHECK.platform, "system", return_value="Linux"))
            stack.enter_context(patch.object(CHECK.sys, "version_info", (3, 11, 0)))
            cpus = stack.enter_context(patch.object(CHECK.os, "sched_getaffinity", return_value={0, 7}, create=True))
            versions = stack.enter_context(patch.object(CHECK.importlib.metadata, "version", side_effect=dependencies.get))
            disk = stack.enter_context(patch.object(CHECK.shutil, "disk_usage", return_value=type("Disk", (), {"free": 40 * 2**30})()))
            stack.enter_context(patch.object(Path, "read_text", read_text))
            stack.enter_context(patch.object(CHECK, "verify_package", return_value={"passed": True}))
            stack.enter_context(patch.object(CHECK, "linux_capabilities", return_value={"fixture": True}))
            result = CHECK.preflight(target)
            self.assertEqual(result["status"], "PREFLIGHT_PASS")
            self.assertFalse(result["cpus_reserved"])
            self.assertFalse(target.exists())
            cpus.return_value = {0}
            with self.assertRaises(ValueError):
                CHECK.preflight(target)
            cpus.return_value = {0, 7}
            versions.side_effect = lambda _: "wrong"
            with self.assertRaises(ValueError):
                CHECK.preflight(target)
            versions.side_effect = dependencies.get
            disk.return_value = type("Disk", (), {"free": 1})()
            with self.assertRaises(ValueError):
                CHECK.preflight(target)

    def test_registered_grid_has_3721_call_pairs_and_2688_attempts(self):
        tasks = CHECK.read(CHECK.CODE / "science/national/task_catalog.json")
        self.assertEqual(sum(len(CHECK.call_names(t)) for t in tasks), 3721)
        self.assertEqual(sum(len(t["K"]) * 2 * len(t["primary_seeds"]) for t in tasks), 2688)
        self.assertIn("Ward_K4_cut", CHECK.call_names(tasks[1]))


if __name__ == "__main__":
    unittest.main()
