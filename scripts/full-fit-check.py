"""Preflight and read-only 504+28 replay checks. Standard library; never fits."""
import argparse
from collections import Counter
import copy
import ctypes
from datetime import datetime, timezone
import gzip
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path, PurePosixPath
import platform
import shutil
import signal
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CODE = ROOT / "research/code"
# The accepted DT24 readback rule, fixed before this public checker was written.
ATOL, RTOL = 2e-11, 2e-10
KS = (4, 6, 8, 10, 12, 16, 20)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def parse(data):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "duplicate JSON key: " + key)
            result[key] = value
        return result
    def nonfinite(value):
        raise ValueError("nonfinite JSON: " + value)
    def finite_float(value):
        number = float(value)
        require(math.isfinite(number), "nonfinite JSON float: " + value)
        return number
    return json.loads(data, object_pairs_hook=pairs, parse_constant=nonfinite, parse_float=finite_float)


def read(path):
    return parse(Path(path).read_text(encoding="utf-8-sig"))


def digest(path):
    with Path(path).open("rb") as stream:
        return stream_digest(stream)


def stream_digest(stream):
    h = hashlib.sha256()
    for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
        h.update(block)
    return h.hexdigest()


CHECKER_SHA256 = digest(__file__)


def relative_name(name):
    require(isinstance(name, str) and "\\" not in name and ":" not in name,
            "unsafe member path")
    require(name and not PurePosixPath(name).is_absolute()
            and all(part not in ("", ".", "..") for part in name.split("/")),
            "unsafe member path")
    return name


def external(path, fresh=False):
    p = Path(path).resolve()
    require(not p.is_relative_to(ROOT), "output must be outside the checkout")
    if fresh:
        require(not p.exists(), "fresh output path required")
    return p


def verify_package():
    result = subprocess.run([sys.executable, "-B", "-S", str(ROOT / "research/release.py"), "verify"],
                            capture_output=True, text=True, encoding="utf-8", check=False)
    require(result.returncode == 0, "research verification failed: " + result.stderr[-1000:])
    verified = parse(result.stdout)
    require(verified["passed"] is True, "research verification not passed")
    return {"release_manifest_sha256": digest(ROOT / "research/PACKAGE_MANIFEST.json"),
            "code_manifest_sha256": digest(CODE / "PACKAGE_MANIFEST.json"),
            "verification": verified}


def linux_capabilities():
    require(hasattr(os, "pidfd_open") and hasattr(signal, "pidfd_send_signal"), "Linux pidfd API missing")
    fd = os.pidfd_open(os.getpid(), 0)
    try:
        signal.pidfd_send_signal(fd, 0)
    finally:
        os.close(fd)
    # Read capability only. The frozen runner sets/restores subreaper state later.
    libc = ctypes.CDLL(None, use_errno=True)
    value = ctypes.c_int()
    require(libc.prctl(37, ctypes.byref(value), 0, 0, 0) == 0, "PR_GET_CHILD_SUBREAPER unavailable")
    return {"pidfd_open_and_signal_zero": True, "subreaper_query": True,
            "subreaper_set_not_exercised": True}


def preflight(out):
    target = external(out, fresh=True)
    require(target.parent.is_dir(), "create the external parent directory first")
    require(platform.system() == "Linux", "full replay requires Linux")
    require(sys.version_info[:2] == (3, 11), "full replay requires Python 3.11")
    config = read(CODE / "config/compute.json")
    required = {config["national_cpu"], config["context_cpu"]}
    affinity = set(os.sched_getaffinity(0))
    require(required <= affinity, "available CPU affinity must include 0 and 7; no remapping is performed")
    dependencies = read(CODE / "science/context/PLAN.json")["dependencies"]
    installed = {name: importlib.metadata.version(name) for name in dependencies}
    require(installed == dependencies, "dependency versions differ from the frozen requirements")
    free = shutil.disk_usage(target.parent).free
    require(free >= config["minimum_free_disk_bytes"], "less than 12 GiB free on the output filesystem")
    memory = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key, value = line.split(":", 1)
        if key in ("MemTotal", "MemAvailable"):
            memory[key + "_bytes"] = int(value.split()[0]) * 1024
    require(memory.get("MemAvailable_bytes", 0) >= config["RSS_bytes"], "less than 4 GiB currently available RAM")
    return {"status": "PREFLIGHT_PASS", "passed": True, "package": verify_package(),
            "python": platform.python_version(), "dependencies": installed,
            "available_cpus": sorted(affinity), "required_cpus": sorted(required),
            "free_disk_bytes": free, "memory": memory, "capabilities": linux_capabilities(),
            "configuration": config, "out": str(target), "output_created": False,
            "cpus_reserved": False, "resource_snapshot_only": True,
            "warnings": ["Prefer at least 32 GiB free disk and 16 GiB RAM; the documented minimum is not a runtime promise.",
                         "CPU availability is not exclusivity; stop competing jobs yourself.",
                         "Container/cgroup memory limits and later resource changes are not certified.",
                         "PR_SET_CHILD_SUBREAPER is exercised only by the real runner."]}


class Source:
    """A directory or an existing archive; neither is extracted or changed."""
    def __init__(self, out=None, archive=None, prefix="compute/"):
        self.root = Path(out).resolve() if out else None
        self.archive = Path(archive).resolve() if archive else None
        self.zip = None
        self.hashes = {}
        if self.archive:
            require(prefix.endswith("/"), "archive prefix must end with /")
            relative_name(prefix[:-1])
            self.prefix = prefix
            self.zip = zipfile.ZipFile(self.archive)
            all_names = self.zip.namelist()
            require(len(all_names) == len(set(all_names)), "duplicate ZIP member")
            self.names = {n[len(prefix):] for n in all_names if n.startswith(prefix) and not n.endswith("/")}
        else:
            require(self.root.is_dir(), "result directory does not exist")
            require(not any(p.is_symlink() for p in self.root.rglob("*")), "result contains symlinks")
            self.names = {p.relative_to(self.root).as_posix() for p in self.root.rglob("*") if p.is_file()}
        for name in self.names:
            relative_name(name)
        require(len(self.names) == len({n.casefold() for n in self.names}), "case-colliding result members")

    def open(self, name):
        relative_name(name)
        require(name in self.names, "missing result member: " + name)
        return self.zip.open(self.prefix + name) if self.zip else (self.root / name).open("rb")

    def read(self, name):
        with self.open(name) as stream:
            return parse(stream.read())

    def sha(self, name):
        if name not in self.hashes:
            with self.open(name) as stream:
                self.hashes[name] = stream_digest(stream)
        return self.hashes[name]

    def size(self, name):
        return self.zip.getinfo(self.prefix + name).file_size if self.zip else (self.root / name).stat().st_size

    def inventory(self, base, inventory, descriptor):
        require(isinstance(inventory, dict) and bool(inventory), "empty inventory")
        actual = {n[len(base):] for n in self.names if n.startswith(base)} - {descriptor}
        require(actual == set(inventory), "extra/missing committed files: " + base)
        for name, row in inventory.items():
            relative_name(name)
            expected = row["sha256"] if isinstance(row, dict) else row
            require(self.sha(base + name) == expected, "member SHA mismatch: " + base + name)
            if isinstance(row, dict) and "bytes" in row:
                require(self.size(base + name) == row["bytes"], "member size mismatch: " + base + name)

    def close(self):
        if self.zip:
            self.zip.close()


def compare(reference, actual, path="record"):
    require(type(reference) is type(actual), "type differs: " + path)
    if isinstance(reference, dict):
        require(reference.keys() == actual.keys(), "keys differ: " + path)
        for key in reference:
            compare(reference[key], actual[key], path + "/" + key)
    elif isinstance(reference, list):
        require(len(reference) == len(actual), "length differs: " + path)
        for index, (a, b) in enumerate(zip(reference, actual)):
            compare(a, b, path + "/" + str(index))
    elif isinstance(reference, float):
        require(math.isfinite(reference) and math.isfinite(actual), "nonfinite value: " + path)
        require(abs(reference - actual) <= ATOL + RTOL * max(abs(reference), abs(actual)), "float differs: " + path)
    else:
        require(reference == actual, "value differs: " + path)


def label_mapping(reference, actual, k):
    require(len(reference) == len(actual), "label length differs")
    require(all(type(x) is int for x in reference + actual), "labels must be integers")
    require(set(reference) == set(actual) == set(range(k)), "labels must contain every group 0..K-1")
    mapping = {}
    for old, new in zip(reference, actual):
        require(new not in mapping or mapping[new] == old, "co-membership differs")
        mapping[new] = old
    require(len(set(mapping.values())) == k, "label mapping is not bijective")
    return mapping


def compare_cell(baseline, actual, package_sha):
    scope = baseline["scope"]
    ids_key = "support_IDs" if scope == "national" else "IDs"
    ids = actual[ids_key]
    require(ids == baseline[ids_key] == sorted(set(ids)), "ordered IDs differ or are duplicated")
    require(actual["status"] == "completed" and actual["N"] == len(ids), "incomplete partition")
    mapping = label_mapping(baseline["labels"], actual["labels"], baseline["K"])
    require(Counter(actual["labels"]) == Counter(dict(enumerate(actual["sizes"]))), "sizes disagree with labels")
    pointwise = actual["pointwise_SW"]
    require(len(pointwise) == len(ids) and all(type(v) in (int, float) and math.isfinite(v) and -1 <= v <= 1 for v in pointwise), "invalid pointwise SW")
    require(math.isclose(math.fsum(pointwise) / len(ids), actual["metrics"]["SW"]["value"], rel_tol=1e-13, abs_tol=1e-13), "SW arithmetic differs")
    omitted = {"scope", "variant", "source_member", "semantic_profiles"} if scope == "national" else {"scope", "method", "month", "source_member"}
    expected = {k: v for k, v in baseline.items() if k not in omitted}
    observed = {k: copy.deepcopy(actual[k]) for k in expected}
    observed["labels"] = [mapping[v] for v in actual["labels"]]
    observed["sizes"] = [0] * baseline["K"]
    for current, saved in mapping.items():
        observed["sizes"][saved] = actual["sizes"][current]
    if scope == "national":
        require(actual["package_manifest_sha256"] == package_sha, "cell scientific package differs")
        # The public compact baseline retains its original source-package identity.
        observed["package_manifest_sha256"] = expected["package_manifest_sha256"]
        observed["metrics"] = {name: {field: actual["metrics"][name][field] for field in metric}
                               for name, metric in expected["metrics"].items()}
        require(set(actual["metrics"]) == set(expected["metrics"]), "six-metric set differs")
    else:
        profiles = observed["profiles"]
        require(len(profiles) == baseline["K"] and {p["cluster"] for p in profiles} == set(mapping), "context profile groups differ")
        for profile in profiles:
            profile["cluster"] = mapping[profile["cluster"]]
        observed["profiles"] = sorted(profiles, key=lambda p: p["cluster"])
    compare(expected, observed)
    return mapping


def call_names(task):
    result = {"prepare"}
    for k in task["K"]:
        for method in task["methods"]:
            suffixes = ["cut" if method == "Ward" else "prepare", "evaluate"]
            suffixes += [f"seed{i:02d}" for i in range(1, len(task["primary_seeds"]) + 1)] if method != "Ward" else []
            result.update(f"{method}_K{k}_{suffix}" for suffix in suffixes)
    return result


def owner_check(owners, live):
    require(bool(owners), "no process ownership receipts")
    for owner in owners:
        require(type(owner.get("pid")) is int and owner["pid"] > 0
                and type(owner.get("start_ticks")) is int and isinstance(owner.get("boot_id"), str), "invalid owner identity")
    if not live:
        return {"performed": False, "reason": "readback only; saved cleanup is not a current process inspection"}
    require(platform.system() == "Linux", "live owner check requires Linux")
    boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    require(all(o["boot_id"] == boot for o in owners), "live check requires the original host boot and PID namespace")
    for owner in owners:
        stat = Path("/proc", str(owner["pid"]), "stat")
        try:
            fields = stat.read_text().rsplit(")", 1)[1].split()
            require(int(fields[19]) != owner["start_ticks"], "owned process identity remains present, including zombie")
        except FileNotFoundError:
            pass
    return {"performed": True, "all_recorded_owners_absent": True, "records": len(owners),
            "scope": "recorded identities in this PID namespace; not a global job inventory"}


def check_result(source, live=False):
    package = verify_package()
    national = CODE / "science/national"
    tasks = read(national / "task_catalog.json")
    expected_steps = [t["task_id"] for t in tasks] + ["context28"]
    receipt, plan = source.read("RECEIPT.json"), source.read("PLAN.json")
    require(receipt["status"] == "completed_504_plus_28" and receipt["automatic_retry"] is False
            and receipt["new_operational_adapter"] is True, "queue is not completed")
    require([s["id"] for s in receipt["steps"]] == [s["id"] for s in plan["steps"]] == expected_steps, "exact 26 steps required")
    compare(read(CODE / "config/compute.json"), plan["configuration"], "configuration")
    require(plan["national_partitions"] == 504 and plan["context_partitions"] == 28
            and plan["parallel_workers"] == 1 and plan["automatic_retry"] is False, "plan counts/policy differ")
    owners = []
    for step in receipt["steps"]:
        require(step["exit_code"] == 0 and step["stop_reason"] is None
                and step["cleanup"]["all_owned_absent"] is True
                and step["cleanup"]["Linux_pidfds_and_subreaper"] is True, "unsuccessful or unclean step: " + step["id"])
        owners.extend(step["cleanup"]["owners"])
    pack_sha = digest(national / "PACKAGE_MANIFEST.json")
    catalog_sha, plan_sha = digest(national / "task_catalog.json"), digest(national / "PLAN.json")
    cells = {}
    attempts = calls = 0
    for task in tasks:
        base = "national/" + task["task_id"] + "/"
        commit = source.read(base + "COMMIT.json")
        require(commit["status"] == "completed" and commit["task_id"] == task["task_id"] and commit["month"] == task["month"], "chunk completion/identity differs")
        require(commit["package_manifest_sha256"] == pack_sha and commit["catalog_sha256"] == catalog_sha and commit["plan_sha256"] == plan_sha, "chunk source binding differs")
        source.inventory(base, commit["files"], "COMMIT.json")
        registration = source.read(base + "registration.json")
        compare(task, registration["task"], "registered task and seeds")
        require(registration["cpu"] == plan["configuration"]["national_cpu"] and registration["automatic_retry"] is False,
                "national CPU/retry registration differs")
        keys = call_names(task)
        starts = {n[len(base + "calls/"):-11] for n in source.names if n.startswith(base + "calls/") and n.endswith(".start.json")}
        ends = {n[len(base + "calls/"):-9] for n in source.names if n.startswith(base + "calls/") and n.endswith(".end.json")}
        require(starts == ends == keys and commit["expected_call_pairs"] == len(keys), "named call pairs differ")
        require(commit["call_audit"] == {"starts": len(keys), "ends": len(keys), "unknown": []}, "call audit differs")
        for key in sorted(keys):
            start, end = [source.read(base + "calls/" + key + suffix) for suffix in (".start.json", ".end.json")]
            require(start["key"] == end["key"] == key and start["owner"] == end["owner"] and end["time_ns"] >= start["time_ns"], "call identity/timing differs")
            require(source.sha(base + relative_name(end["result_file"])) == end["sha256"], "call result binding differs")
        native = {n for n in source.names if n.startswith(base + "cells/") and "/native_returns/" in n and n.endswith(".json")}
        expected_native = {base + f"cells/{method}_K{k}/native_returns/{i:02d}.json"
                           for method in ("NCut", "SSE") for k in task["K"]
                           for i in range(1, len(task["primary_seeds"]) + 1)}
        require(native == expected_native, "native seed slots differ")
        count = len(task["K"]) * 2 * len(task["primary_seeds"])
        require(len(native) == commit["attempt_count"] == count, "native attempt count differs")
        for name in native:
            attempt = source.read(name)
            require(attempt["entered"] is True and attempt["exception"] is None and attempt["return"] is not None, "failed native attempt")
            converted = source.read(name.replace("/native_returns/", "/attempts/"))
            index = int(PurePosixPath(name).stem)
            require(converted["seed_index"] == index and converted["seed"] == task["primary_seeds"][index - 1],
                    "seed differs from the published task catalog")
        require(source.sha(base + "result.json") == commit["result_sha256"], "chunk result SHA differs")
        for method in task["methods"]:
            for k in task["K"]:
                key = ("national", "mixed", task["month"], method, k)
                require(key not in cells, "duplicate scientific cell")
                cells[key] = base + f"cells/{method}_K{k}/result.json"
        attempts += count
        calls += len(keys)
    require((len(cells), attempts, calls) == (504, 2688, 3721), "national totals differ")
    context = source.read("context/summary.json")
    require(context["status"] == "completed_all_partitions" and context["tasks_expected"] == context["tasks_completed"] == 28, "context incomplete")
    require(context["plan_sha256"] == digest(CODE / "science/context/PLAN.json"), "context plan binding differs")
    context_run = source.read("context/RUN.json")
    compare(read(CODE / "science/context/PLAN.json")["dependencies"], context_run["environment"]["versions"], "runtime versions")
    require(context_run["cpus"] == [plan["configuration"]["context_cpu"]], "context CPU differs")
    source.inventory("context/", source.read("context/OUTPUT_MANIFEST.json"), "OUTPUT_MANIFEST.json")
    require(source.read("context/SUPERVISION.json")["stop_reason"] is None, "context stopped")
    for variant in ("context6", "spending2"):
        for method in ("KMeans", "Ward"):
            for k in KS:
                cells[("context", variant, None, method, k)] = f"context/{variant}_{method}_K{k:02d}/result.json"
    actual_cells = {n for n in source.names if (n.startswith("national/") and "/cells/" in n and n.endswith("/result.json")
                    and "/native_returns/" not in n) or (n.startswith("context/") and n.count("/") == 2 and n.endswith("/result.json"))}
    require(actual_cells == set(cells.values()), "extra or missing scientific cells")
    baseline_files = sorted((CODE / "saved").rglob("*.json.gz"))
    require(len(baseline_files) == 532, "saved baseline count differs")
    checked = set()
    permutations, metric_statuses, supports = [], Counter(), {}
    for path in baseline_files:
        baseline = parse(gzip.decompress(path.read_bytes()))
        key = (baseline["scope"], baseline["variant"], baseline["month"], baseline["method"], baseline["K"])
        require(key in cells and key not in checked, "baseline grid differs")
        actual = source.read(cells[key])
        mapping = compare_cell(baseline, actual, pack_sha)
        if any(a != b for a, b in mapping.items()):
            permutations.append({"cell": cells[key], "actual_to_saved": mapping})
        checked.add(key)
        if key[0] == "national":
            metric_statuses[actual["metrics"]["S_Dbw"]["status"]] += 1
            old = supports.setdefault(key[2], actual["support_IDs"])
            require(old == actual["support_IDs"], "within-month support differs")
    require(checked == set(cells), "not every baseline compared")
    require(metric_statuses == {"ok": 175, "undefined": 329}, "S_Dbw availability differs")
    live_result = owner_check(owners, live)
    result = {"status": "READBACK_AND_RECORDED_OWNERS_PASS" if live else "READBACK_PASS", "passed": True,
              "package": package, "national_partitions": 504, "context_partitions": 28,
              "steps": 26, "native_Lloyd_entries": attempts, "closed_call_pairs": calls,
              "input_and_output_manifests_verified": True, "saved_cleanup_receipts": True,
              "live_owners": live_result, "label_rule": "exact ordered IDs and co-membership, bijective group renumbering permitted",
              "label_permutations": permutations, "float_rule": {"atol": ATOL, "rtol": RTOL, "formula": "abs(a-b)<=atol+rtol*max(abs(a),abs(b))"},
              "float_rule_source": "research/code/provenance/replay_parity.json#float_rule",
              "S_Dbw_status_counts": dict(metric_statuses), "IDs_union": len(set().union(*map(set, supports.values()))),
              "ID_month_observations": sum(map(len, supports.values())), "scientific_acceptance": False,
              "limits": ["No fitting, mathematical recomputation, or new model selection.",
                         "532 public compact results, not the private 897-record native projection.",
                         "Internal manifests and receipts are checked, not cryptographically signed execution evidence.",
                         "Readback alone cannot certify current process absence or a new runtime on another host."]}
    if source.archive:
        result["archive"] = {"sha256": digest(source.archive), "bytes": source.archive.stat().st_size,
                             "prefix": source.prefix, "checked_member_hashes": len(source.hashes), "extracted": False}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    pre = sub.add_parser("preflight", help="check the local Linux environment; no fitting or output creation")
    pre.add_argument("--out", required=True)
    check = sub.add_parser("check", help="read-only comparison against the published 532 saved results")
    group = check.add_mutually_exclusive_group(required=True)
    group.add_argument("--out")
    group.add_argument("--archive")
    check.add_argument("--prefix", default="compute/")
    check.add_argument("--expected-sha256", help="optional trusted SHA256 of the entire archive")
    check.add_argument("--live-owners", action="store_true", help="same Linux host boot AND PID namespace only")
    for command in (pre, check):
        command.add_argument("--receipt", help="optional fresh JSON file outside checkout and checked result")
    args = parser.parse_args()
    source = None
    target = None
    try:
        if args.receipt:
            candidate = external(args.receipt, fresh=True)
            if args.out:
                require(not candidate.is_relative_to(Path(args.out).resolve()), "receipt must be outside checked/planned output")
            require(candidate.parent.is_dir(), "receipt parent does not exist")
            target = candidate
        if args.command == "preflight":
            result = preflight(args.out)
        else:
            if args.expected_sha256:
                require(args.archive is not None, "expected SHA requires --archive")
                require(digest(args.archive) == args.expected_sha256.lower(), "archive differs from expected SHA256")
            source = Source(args.out, args.archive, args.prefix)
            result = check_result(source, args.live_owners)
            if args.archive:
                result["archive"]["external_expected_SHA_verified"] = args.expected_sha256 is not None
    except (ValueError, OSError, KeyError, TypeError, zipfile.BadZipFile, importlib.metadata.PackageNotFoundError) as error:
        result = {"status": "HELD", "passed": False, "error": str(error)}
    finally:
        if source:
            source.close()
    result.update(UTC=datetime.now(timezone.utc).isoformat(), new_fits=0, checker_sha256=CHECKER_SHA256)
    text = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if target:
        with target.open("x", encoding="utf-8") as stream:
            stream.write(text)
    print(text, end="")
    return 0 if result["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
