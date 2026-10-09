"""Read-only comparison of one December SSE6 replay with the published model."""
import argparse
from collections import Counter
from fractions import Fraction
import gzip
import importlib.util
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "experiments/configs/replay-sse6-december.json"
# Frozen DT24 tolerance: research/code/provenance/replay_parity.json, float_rule.
ATOL, RTOL = 2e-11, 2e-10
MEMBERS = {"PLAN.json", "config.json", "attempts.json", "result.json", "provenance.json", "labels.json"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fraction(value):
    require(isinstance(value, dict), "missing exact objective")
    require(type(value.get("numerator")) is str and type(value.get("denominator")) is str,
            "exact objective must use integer strings")
    require(int(value["denominator"]) > 0, "nonpositive fraction denominator")
    return Fraction(int(value["numerator"]), int(value["denominator"]))


def compare_number(actual, expected, name):
    require(type(actual) is type(expected), name + ": type changed")
    if isinstance(expected, float):
        require(math.isfinite(actual) and math.isfinite(expected), name + ": nonfinite")
        difference = abs(actual - expected)
        require(difference <= ATOL + RTOL * max(abs(actual), abs(expected)), name + ": outside tolerance")
        return difference
    require(actual == expected, name + ": changed")
    return 0.0


def check(out):
    spec = importlib.util.spec_from_file_location("sse6_replay_plan", ROOT / "experiments/run.py")
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)  # Only standard-library definitions; no fit is called.
    plan = runner.plan(CONFIG)
    manifest = runner.read_json(ROOT / "research/PACKAGE_MANIFEST.json")["files"]

    def bound(relative):
        path = ROOT / "research" / relative
        record = manifest[relative]
        require(path.stat().st_size == record["bytes"] and runner.sha(path) == record["sha256"],
                "published source mismatch: " + relative)
        return path

    catalogue = runner.read_json(bound("code/science/national/task_catalog.json"))
    task = next(row for row in catalogue if row["month"] == "2024-12")
    expected_config = {"schema": "municipal-experiment-v1", "month": "2024-12", "method": "SSE", "K": 6,
                       "seeds": task["primary_seeds"], "graph": None,
                       "optimizer": {"max_iterations": 300}, "threads": 1}
    require(plan["config"] == expected_config and len(expected_config["seeds"]) == 8,
            "this checker requires the published eight-seed December SSE6 configuration")
    policy = runner.read_json(bound("code/provenance/replay_parity.json"))["float_rule"]
    require(policy == {"atol": ATOL, "rtol": RTOL, "formula": "abs(a-b)<=atol+rtol*max(abs(a),abs(b))"},
            "accepted tolerance policy changed")
    saved_path = bound("code/saved/national/2024-12/SSE_K06.json.gz")
    with gzip.open(saved_path, "rt", encoding="utf-8") as stream:
        saved = json.load(stream)
    anchors = runner.read_json(bound("code/science/national/PLAN.json"))["common_anchor_hash_checks"]["2024-12"]

    out = Path(out).resolve()
    require(out.is_dir() and not out.is_relative_to(ROOT), "result must be a separate experiment directory")
    require({p.name for p in out.iterdir()} == MEMBERS | {"COMMIT.json"}, "incomplete or unexpected result files")
    for name in MEMBERS | {"COMMIT.json"}:
        path = out / name
        require(path.is_file() and not path.is_symlink(), "result member is not a regular file: " + name)
    commit = runner.read_json(out / "COMMIT.json")
    require(set(commit["files"]) == MEMBERS, "COMMIT member set changed")
    for name, record in commit["files"].items():
        path = out / name
        require(path.stat().st_size == record["bytes"] and runner.sha(path) == record["sha256"], "result SHA mismatch: " + name)
    data = {name: runner.read_json(out / name) for name in MEMBERS}
    require(data["PLAN.json"] == plan, "source/configuration plan differs from this checkout")
    config, result, provenance, labels, attempts = (data[name] for name in
        ("config.json", "result.json", "provenance.json", "labels.json", "attempts.json"))
    require(config == expected_config == result["effective_config"] == provenance["effective_config"], "effective configuration mismatch")
    require(provenance["sources"] == plan["sources"], "source bindings mismatch")
    require(provenance["config_file_sha256"] == runner.sha(CONFIG)
            and provenance["config_sha256"] == runner.digest(config), "configuration SHA mismatch")
    require(provenance["runtime"] == plan["runtime_required"] and provenance["python"].startswith("3.11."), "runtime differs")
    require(provenance["threadpools"] and all(p["num_threads"] == 1 for p in provenance["threadpools"]), "thread limit mismatch")
    for record in (commit, result):
        require(record["status"] == "completed" and record["partition_present"] is True, "result is not completed")
    for record in (commit, result, provenance):
        require(record["experimental"] is True and record["model_promoted"] is False
                and record["scientific_acceptance"] is False, "experiment scope markers changed")
    require(provenance["automatic_retry"] is False, "unexpected retry")
    require((result["month"], result["method"], result["K"], result["N"]) == ("2024-12", "SSE", 6, 2103), "wrong cell")
    require((labels["month"], labels["method"], labels["K"]) == ("2024-12", "SSE", 6), "labels cell mismatch")
    require(result["support_IDs"] == saved["support_IDs"] == labels["IDs"], "ordered IDs differ")
    require(result["labels"] == labels["labels"] and labels["partition_present"] is True
            and labels["experimental"] is True and labels["model_promoted"] is False, "labels file mismatch")
    actual = result["labels"]
    require(len(actual) == 2103 and all(type(v) is int for v in actual) and set(actual) == set(range(6)), "invalid complete partition")
    require(runner.digest(result["support_IDs"]) == provenance["support_IDs_sha256"] == plan["ordered_IDs_sha256"], "ID digest mismatch")
    require(runner.digest(actual) == provenance["labels_sha256"], "labels digest mismatch")
    mapping = {}
    for value, reference in zip(actual, saved["labels"]):
        require(mapping.setdefault(value, reference) == reference, "group membership differs from the published model")
    require(len(set(mapping.values())) == 6, "group mapping is not bijective")
    counts = Counter(actual)
    require(result["sizes"] == [counts[k] for k in range(6)], "sizes differ from labels")
    require(all(counts[k] == saved["sizes"][mapping[k]] for k in counts), "sizes differ from the published model")
    require(len(result["profiles"]) == 6
            and all(type(p["group_index"]) is int for p in result["profiles"])
            and {p["group_index"] for p in result["profiles"]} == set(range(6))
            and all(type(p["n"]) is int and p["n"] == counts[p["group_index"]] for p in result["profiles"]), "profile coverage mismatch")
    require(result["reference_sha256"] == saved["reference_sha256"] and result["reference_refitted"] is False, "reference changed")
    require(result["provenance"]["X"] == anchors["X"] and result["provenance"]["Y"] == anchors["Y"], "geometry changed")
    require(result["evaluation_graph"] == {"kind": "radius", "radius": 1.5, "sigma": 1.0, "fixed": True}
            and result["fitting_graph"] is None and result["provenance"]["W_fit"] is None, "SSE graph policy changed")
    require(len(attempts) == len(result["attempts"]) == 8, "eight recorded attempts required")
    scale = max(Fraction(1), fraction(attempts[0]["SST"]))
    for index, (attempt, summary, seed) in enumerate(zip(attempts, result["attempts"], expected_config["seeds"]), 1):
        require(attempt["seed_index"] == index and attempt["seed"] == seed and attempt["status"] == "converged", "seed attempt mismatch")
        require(len(attempt["labels"]) == 2103 and all(type(v) is int for v in attempt["labels"])
                and set(attempt["labels"]) == set(range(6)), "incomplete seed partition")
        require(max(Fraction(1), fraction(attempt["SST"])) == scale and fraction(attempt["M"]) == scale, "seed scale mismatch")
        require(all(summary[k] == attempt[k] for k in ("seed_index", "seed", "status", "labels"))
                and fraction(summary["objective"]) == fraction(attempt["objective"]), "attempt summary differs")
    q_star = min(fraction(a["objective"]) for a in attempts)
    tau = scale / 10**10
    tied = [a for a in attempts if fraction(a["objective"]) - q_star <= tau]
    chosen = min(tied, key=lambda a: (tuple(a["labels"]), a["seed_index"]))
    representative = result["representative"]
    require(fraction(representative["q_star"]) == q_star and fraction(representative["tau"]) == tau
            and representative["tie_seeds"] == [a["seed_index"] for a in tied]
            and representative["representative_seed_index"] == chosen["seed_index"]
            and actual == chosen["labels"], "representative selection mismatch")
    require(set(result["metrics"]) == set(saved["metrics"]), "metric set changed")
    require(all(result[k] == saved[k] for k in ("all_six_metrics_valid", "eligible_for_comparison", "issues")), "result metric flags changed")
    require(result["metrics"]["SW"]["diagnostics"]["pointwise"] == result["pointwise_SW"], "SW diagnostic vector mismatch")
    maximum = 0.0
    for name, reference in saved["metrics"].items():
        metric = result["metrics"][name]
        for field in ("status", "reason", "formula", "direction"):
            require(type(metric[field]) is type(reference[field]) and metric[field] == reference[field], name + ": metadata changed")
        maximum = max(maximum, compare_number(metric["value"], reference["value"], name))
        source = metric["provenance"]
        require(source["ordered_IDs_hash"] == provenance["support_IDs_sha256"] and source["partition_hash"] == provenance["labels_sha256"]
                and source["N"] == 2103 and source["K"] == 6
                and source["graph_hash"] == result["provenance"]["W_eval"], name + ": provenance mismatch")
    require(len(result["pointwise_SW"]) == len(saved["pointwise_SW"]) == 2103, "pointwise SW support mismatch")
    for index, (value, reference) in enumerate(zip(result["pointwise_SW"], saved["pointwise_SW"])):
        maximum = max(maximum, compare_number(value, reference, "pointwise SW " + str(index)))
    return {"passed": True, "status": "SSE6_DECEMBER_READBACK_PASS", "new_fits": 0,
            "scope": "one published December 2024 SSE6 partition; not the full 532-cell replay",
            "N": 2103, "K": 6, "seeds_checked": 8, "actual_to_saved_labels": mapping,
            "all_2103_pointwise_SW_checked": True, "six_scalar_metrics_checked": True,
            "float_rule": policy, "maximum_absolute_numeric_difference": maximum,
            "commit_sha256": runner.sha(out / "COMMIT.json"), "config_sha256": runner.sha(CONFIG),
            "published_result_sha256": runner.sha(saved_path), "representative_seed_index": chosen["seed_index"],
            "W_eval_byte_identity_required": False, "full_replay_acceptance": False,
            "note": "Reads supplied artifacts only. It does not prove a fresh process ran, assess practical value or replace accepted model files."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path, help="completed experiment directory")
    parser.add_argument("--receipt", type=Path, help="new optional receipt outside the checkout and result")
    args = parser.parse_args()
    result = check(args.out)
    if args.receipt:
        target = args.receipt.resolve()
        require(not target.is_relative_to(ROOT) and not target.is_relative_to(args.out.resolve()), "receipt must be outside checkout and result")
        with target.open("x", encoding="utf-8", newline="\n") as stream:
            json.dump(result, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write("\n")
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError, ZeroDivisionError) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        sys.exit(2)
