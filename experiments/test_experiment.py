"""Independent contract tests; synthetic checks are not scientific results.

Run with ``python -B -m unittest discover -s experiments -p test_experiment.py``.
The expensive national grid is never executed by this test suite.
"""
import copy
from contextlib import nullcontext
from fractions import Fraction
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent
CHECKOUT = HERE.parent
spec = importlib.util.spec_from_file_location("experiment_runner_under_test", HERE / "run.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def config(method="SSE"):
    return {
        "schema": "municipal-experiment-v1",
        "month": "2024-12",
        "method": method,
        "K": 2,
        "seeds": [] if method == "Ward" else [1000003],
        "graph": {"kind": "union", "k": 3, "sigma": 1.0, "radius": None} if method == "NCut" else None,
        "optimizer": None if method == "Ward" else {"max_iterations": 300},
        "threads": 1,
    }


class ConfigurationTests(unittest.TestCase):
    def test_valid_families_and_graph_variants(self):
        variants = [config(method) for method in ["SSE", "NCut", "Ward"]]
        radius = config("NCut")
        radius["graph"] = {"kind": "radius", "k": None, "sigma": 0.5, "radius": 1.25}
        variants.append(radius)
        for value in variants:
            with self.subTest(method=value["method"], graph=value["graph"]):
                runner.validate_config(value)

    def test_unknown_or_missing_top_level_fields_rejected(self):
        value = config()
        value["surprise"] = 1
        with self.assertRaises(ValueError):
            runner.validate_config(value)
        for key in config():
            value = config()
            del value[key]
            with self.subTest(missing=key), self.assertRaises(ValueError):
                runner.validate_config(value)

    def test_invalid_types_and_ranges(self):
        invalid = {
            "schema": [None, 1, "other-v1"],
            "month": [None, 202412, "2024-13", "2024-1", "2022-12"],
            "method": [None, "kmeans", "SSE ", True],
            "K": [True, 2.0, "2", None, 1, 21],
            "threads": [True, 1.0, "1", None, 0, 9],
            "seeds": [None, [], [True], [1.0], ["1"], [-1], [2**32], [1, 1], list(range(9))],
            "optimizer": [None, {}, {"max_iterations": True}, {"max_iterations": 1.0}, {"max_iterations": 0}, {"max_iterations": 1001}, {"max_iterations": 300, "tol": 1e-6}],
            "graph": [{"kind": "union", "k": 3, "sigma": 1.0, "radius": None}],
        }
        for key, values in invalid.items():
            for bad in values:
                value = config()
                value[key] = bad
                with self.subTest(field=key, bad=bad), self.assertRaises(ValueError):
                    runner.validate_config(value)

    def test_graph_validation(self):
        invalid = [
            None, {},
            {"kind": "union", "k": True, "sigma": 1, "radius": None},
            {"kind": "union", "k": 0, "sigma": 1, "radius": None},
            {"kind": "union", "k": 129, "sigma": 1, "radius": None},
            {"kind": "union", "k": 3.0, "sigma": 1, "radius": None},
            {"kind": "union", "k": 3, "sigma": True, "radius": None},
            {"kind": "union", "k": 3, "sigma": float("nan"), "radius": None},
            {"kind": "union", "k": 3, "sigma": float("inf"), "radius": None},
            {"kind": "union", "k": 3, "sigma": 0.049, "radius": None},
            {"kind": "union", "k": 3, "sigma": 10.001, "radius": None},
            {"kind": "union", "k": 3, "sigma": 1, "radius": 1},
            {"kind": "radius", "k": 3, "sigma": 1, "radius": 1},
            {"kind": "radius", "k": None, "sigma": 1, "radius": True},
            {"kind": "radius", "k": None, "sigma": 1, "radius": 0},
            {"kind": "radius", "k": None, "sigma": 1, "radius": float("inf")},
            {"kind": "radius", "k": None, "sigma": 1, "radius": 11},
            {"kind": "mutual", "k": 3, "sigma": 1, "radius": None},
            {"kind": "union", "k": 3, "sigma": 1, "radius": None, "extra": 1},
        ]
        for graph in invalid:
            value = config("NCut")
            value["graph"] = graph
            with self.subTest(graph=graph), self.assertRaises(ValueError):
                runner.validate_config(value)

    def test_ward_has_no_optimizer_or_seeds(self):
        for key, bad in [("optimizer", {"max_iterations": 300}), ("seeds", [1000003]), ("graph", config("NCut")["graph"])]:
            value = config("Ward")
            value[key] = bad
            with self.subTest(field=key), self.assertRaises(ValueError):
                runner.validate_config(value)

    def test_json_duplicate_and_nonfinite_literals_rejected(self):
        base = json.dumps(config())
        malformed = [base.replace('"K": 2', '"K": 2, "K": 3')]
        malformed += [base.replace('"K": 2', f'"K": {token}') for token in ["NaN", "Infinity", "-Infinity"]]
        with tempfile.TemporaryDirectory(prefix="sber-experiment-json-") as temp:
            path = Path(temp) / "config.json"
            for text in malformed:
                path.write_text(text, encoding="utf-8")
                with self.subTest(text=text), self.assertRaises(ValueError):
                    runner.load_config(path)


class PathAndPlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sber-experiment-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config_path = self.root / "config.json"
        self.config_path.write_text(json.dumps(config()), encoding="utf-8")

    def test_fresh_external_output_allowed(self):
        runner.check_output_path(self.root / "new-result", self.config_path)
        self.assertFalse((self.root / "new-result").exists())

    def test_existing_or_checkout_output_rejected(self):
        protected = [self.root, self.config_path, CHECKOUT, HERE / "must-not-be-created", CHECKOUT / "research" / "must-not-be-created", CHECKOUT / "public-landing" / "i26" / "must-not-be-created"]
        for target in protected:
            with self.subTest(target=target), self.assertRaises(ValueError):
                runner.check_output_path(target, self.config_path)
        self.assertFalse((HERE / "must-not-be-created").exists())

    def test_resolved_symlink_into_checkout_rejected(self):
        link = self.root / "checkout-link"
        try:
            link.symlink_to(CHECKOUT, target_is_directory=True)
        except OSError as error:
            self.skipTest(f"OS does not allow directory symlink: {error}")
        with self.assertRaises(ValueError):
            runner.check_output_path(link / "must-not-be-created", self.config_path)

    def test_plan_cannot_call_geometry_or_fit(self):
        with patch.object(runner, "load_geometry", side_effect=AssertionError("plan loaded fit geometry")), patch.object(runner, "fit_geometry", side_effect=AssertionError("plan fitted")):
            result = runner.plan(self.config_path)
        self.assertEqual(result["new_fits"], 0)
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ["config.json"])

    def test_cli_plan_works_without_site_packages(self):
        completed = subprocess.run([sys.executable, "-I", "-S", "-B", str(HERE / "run.py"), "plan", "--config", str(self.config_path)], cwd=self.root, capture_output=True, text=True, timeout=60)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertEqual(result["new_fits"], 0)
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ["config.json"])

    def test_bad_output_is_rejected_before_geometry(self):
        with patch.object(runner, "load_geometry", side_effect=AssertionError("unsafe output reached fit")) as load:
            with self.assertRaises(ValueError):
                runner.execute(self.config_path, self.root)
        load.assert_not_called()


class ScientificContractTests(unittest.TestCase):
    """Tiny T-ID fixtures and call doubles, never accepted research results."""

    @classmethod
    def setUpClass(cls):
        import numpy as np
        cls.np = np
        cls.science, cls.adapter = runner.load_scientific_modules()

    def fixture(self):
        np = self.np
        rng = np.random.default_rng(81451)
        z = np.repeat(np.asarray([[1, 1.3, 1.2, 0.8, 1.1, 0.9], [3, 2.9, 3.2, 3.4, 2.8, 3.1], [5, 4.8, 5.1, 4.7, 5.3, 5.2]]), 6, axis=0)
        z = z + rng.normal(0, 0.05, size=z.shape)
        reference = {"scales": {"L": 1.0, "h": 1.0, "R": 1.0, "Hel": 1.0}}
        return {"month": "2024-12", "ids": [f"T{i:03}" for i in range(len(z))], "z": z,
                "rub": np.exp(z), "reference": reference,
                "X": self.science.kn.embed(z, reference), "Y": self.science.kn.symmetric_coordinates(z, reference)}

    def test_parameters_reach_graph_and_optimizer(self):
        for method, graph in [("SSE", None), ("NCut", {"kind": "union", "k": 5, "sigma": 0.75, "radius": None}), ("NCut", {"kind": "radius", "k": None, "sigma": 2.0, "radius": 4.0})]:
            cfg = config(method)
            cfg.update(K=3, seeds=[5, 19], graph=graph, optimizer={"max_iterations": 7})
            geometry = self.fixture()
            n = len(geometry["ids"])
            native = {"status": "converged", "labels": tuple(i % 3 for i in range(n)), "objective": Fraction(2)}
            ctx = {"preflight": None, "fit": geometry["X"], "spectral": None, "scale": Fraction(3)}
            with self.subTest(method=method, graph=graph), patch.object(runner, "load_scientific_modules", return_value=(self.science, self.adapter)), patch.object(self.science.kn, "graph", wraps=self.science.kn.graph) as graph_call, patch.object(self.adapter, "context", return_value=ctx) as context, patch.object(self.science.kn, "lloyd", return_value=native) as lloyd, patch.object(self.science.kn, "ncut_exact", return_value=Fraction(1)) as ncut, patch.object(self.adapter, "result", return_value={"provenance": {"W_fit": "unused-double"}}) as result_call:
                result, attempts = runner.fit_geometry(cfg, geometry)
                self.assertEqual(graph_call.call_args_list[0].kwargs, {"kind": "radius", "radius": 1.5, "sigma": 1})
                self.assertEqual(graph_call.call_count, 2 if method == "NCut" else 1)
                if method == "NCut":
                    self.assertEqual(graph_call.call_args_list[1].kwargs, {key: val for key, val in graph.items() if val is not None})
                    self.assertEqual(ncut.call_count, 2)
                else:
                    ncut.assert_not_called()
                self.assertEqual(context.call_args.args[2:5], (method, 3, [5, 19]))
                self.assertEqual([call.args[1:] for call in lloyd.call_args_list], [(3, 5), (3, 19)])
                self.assertEqual([call.kwargs for call in lloyd.call_args_list], [{"max_iterations": 7}] * 2)
                self.assertEqual([attempt["seed"] for attempt in attempts], [5, 19])
                self.assertEqual(result_call.call_args.args[2:4], (method, 3))
                self.assertEqual(result["effective_config"], cfg)
                self.assertFalse(result["model_promoted"])

    def test_capped_attempt_is_not_a_success(self):
        geometry = self.fixture()
        capped = {"status": "capped_underresolved", "labels": tuple(i % 2 for i in range(len(geometry["ids"]))), "objective": Fraction(1)}
        with patch.object(runner, "load_scientific_modules", return_value=(self.science, self.adapter)), patch.object(self.science.kn, "lloyd", return_value=capped):
            result, attempts = runner.fit_geometry(config(), geometry)
        self.assertEqual(attempts[0]["status"], "capped_underresolved")
        self.assertEqual(result["status"], "unavailable")
        self.assertIsNone(result["labels"])
        self.assertFalse(result["partition_present"])
        self.assertFalse(result["scientific_acceptance"])

    def test_deterministic_tiny_sse_fixture(self):
        # Repeated synthetic execution checks determinism; it is not a new model.
        cfg = config()
        cfg["K"] = 3
        first, first_attempts = runner.fit_geometry(cfg, self.fixture())
        second, second_attempts = runner.fit_geometry(copy.deepcopy(cfg), self.fixture())
        self.assertEqual(first["status"], "completed")
        self.assertEqual(first["labels"], second["labels"])
        self.assertEqual(first["sizes"], [6, 6, 6])
        self.assertEqual(first["metrics"], second["metrics"])
        self.assertEqual(first_attempts, second_attempts)
        self.assertEqual(len(first["support_IDs"]), 18)
        self.assertTrue(all(ID.startswith("T") for ID in first["support_IDs"]))
        self.assertTrue(first["experimental"])
        self.assertFalse(first["model_promoted"])

    def test_ward_does_not_use_lloyd(self):
        with patch.object(runner, "load_scientific_modules", return_value=(self.science, self.adapter)), patch.object(self.science.kn, "lloyd", side_effect=AssertionError("Ward invoked stochastic optimizer")):
            result, attempts = runner.fit_geometry(config("Ward"), self.fixture())
        self.assertEqual(result["status"], "completed")
        self.assertEqual(len(result["sizes"]), 2)
        self.assertEqual(sum(result["sizes"]), 18)
        self.assertEqual(attempts, [])

    def test_tiny_ncut_fixture(self):
        cfg = config("NCut")
        cfg["K"] = 3
        cfg["graph"]["k"] = 17
        result, attempts = runner.fit_geometry(cfg, self.fixture())
        self.assertEqual(result["status"], "completed")
        self.assertEqual(set(result["labels"]), {0, 1, 2})
        self.assertEqual(sum(result["sizes"]), 18)
        self.assertEqual(attempts[0]["status"], "converged")
        self.assertTrue(result["fit_diagnostics"]["fitting_graph_applies"])
        self.assertTrue(result["experimental"])
        self.assertFalse(result["model_promoted"])

    def test_execute_forwards_threads_and_seals_fresh_output(self):
        cfg = config()
        cfg["threads"] = 3
        result_double = {"support_IDs": ["T001", "T002"], "labels": [0, 1], "partition_present": True, "status": "completed"}
        with tempfile.TemporaryDirectory(prefix="sber-experiment-threads-") as temp:
            root = Path(temp)
            config_path = root / "config.json"
            config_path.write_text(json.dumps(cfg), encoding="utf-8")
            output = root / "fresh-output"
            with patch.dict(os.environ), patch.object(runner, "load_geometry", return_value={"test_fixture": True}) as load, patch.object(runner, "fit_geometry", return_value=(result_double, [])) as fit, patch("threadpoolctl.threadpool_limits", side_effect=lambda **kwargs: nullcontext()) as limit, patch("threadpoolctl.threadpool_info", return_value=[{"num_threads": 3}]):
                summary = runner.execute(config_path, output)
                self.assertEqual([call.kwargs for call in limit.call_args_list], [{"limits": 3}, {"limits": 3}])
                self.assertTrue(all(os.environ[name] == "3" for name in runner.THREAD_VARIABLES))
                self.assertEqual(load.call_args.args[0], cfg)
                self.assertEqual(fit.call_args.args[0], cfg)
            self.assertEqual(summary["status"], "completed")
            commit = json.loads((output / "COMMIT.json").read_text(encoding="utf-8"))
            self.assertFalse(commit["model_promoted"])
            self.assertFalse(commit["scientific_acceptance"])
            for name, entry in commit["files"].items():
                self.assertEqual(runner.sha(output / name), entry["sha256"])
                self.assertEqual((output / name).stat().st_size, entry["bytes"])
            with self.assertRaises(ValueError):
                runner.execute(config_path, output)


if __name__ == "__main__":
    unittest.main()
