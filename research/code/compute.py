"""Sequential operational adapter; frozen workers own every scientific operation.

This is a new adapter, not the supervisor used by the accepted October campaign.
The local candidate checks do not establish successful Linux real computation.
"""
from pathlib import Path
from datetime import datetime, timezone
import importlib.metadata
import json
import os
import platform
import shutil
import subprocess
import sys
import time

from typology import ROOT, read, require, sha, verify


def put(path, value):
    path = Path(path)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf8")
    os.replace(temp, path)


def now():
    return datetime.now(timezone.utc).isoformat()


def configuration(path):
    cfg = read(path)
    require(set(cfg) == {"national_cpu", "context_cpu", "national_task_seconds", "context_task_seconds", "session_seconds", "RSS_bytes", "minimum_free_disk_bytes"}, "unknown/missing compute configuration field")
    require(all(type(value) is int and value >= 0 for value in cfg.values()), "compute configuration requires nonnegative integers")
    require(all(cfg[key] > 0 for key in ["national_task_seconds", "context_task_seconds", "RSS_bytes", "minimum_free_disk_bytes"]), "zero compute limit")
    # The sealed context worker explicitly admits CPU7. Do not silently amend its PLAN.
    require(cfg["context_cpu"] == 7, "frozen context PLAN requires CPU7; other CPU layouts need separately reviewed operational amendment")
    require(cfg["national_task_seconds"] <= 7200 and cfg["context_task_seconds"] <= 1800 and cfg["RSS_bytes"] <= 4 * 2**30, "candidate bounds exceed declared worker budgets")
    return cfg


def plan(out, config):
    cfg = configuration(config)
    dest = Path(out).resolve()
    require(not dest.exists() and not dest.is_relative_to(ROOT), "fresh output outside delivery required")
    national = ROOT / "science/national"
    context = ROOT / "science/context"
    tasks = read(national / "task_catalog.json")
    require(len(tasks) == 25 and tasks[0]["task_id"] == "DT24-PILOT", "pilot must precede January cache reuse")
    steps = []
    for task in tasks:
        task_dest = dest / "national" / task["task_id"]
        command = [sys.executable, "-B", str(national / "engineering/detailed_typology_national_20261007_r00/run_month.py"),
                   "--task-id", task["task_id"], "--manifest", str(national / "PACKAGE_MANIFEST.json"),
                   "--catalog", str(national / "task_catalog.json"), "--out", str(task_dest), "--cpu", str(cfg["national_cpu"])]
        if task["task_id"] == "DT24-M0001":
            command += ["--cache-from", str(dest / "national/DT24-PILOT")]
        steps.append({"id": task["task_id"], "scope": "national", "command": command,
                      "out": str(task_dest), "limit_seconds": cfg["national_task_seconds"],
                      "expected_partitions": 3 * len(task["K"])})
    steps.append({"id": "context28", "scope": "context", "command": [sys.executable, "-B", str(context / "runner.py"),
                  "run", "--out", str(dest / "context"), "--cpus", str(cfg["context_cpu"]), "--plan-sha", sha(context / "PLAN.json")],
                  "out": str(dest / "context"), "limit_seconds": cfg["context_task_seconds"], "expected_partitions": 28})
    return {"status": "plan_only", "new_fits": 0, "configuration": cfg, "steps": steps,
            "session_budget_status": "unbound_requires_root_measurements" if cfg["session_seconds"] == 0 else "explicit_bound",
            "national_partitions": sum(step["expected_partitions"] for step in steps if step["scope"] == "national"),
            "context_partitions": 28, "parallel_workers": 1, "automatic_retry": False,
            "note": "Fresh sequential replay. Historical source PLAN deadline is provenance; this adapter uses relative limits. New adapter has no accepted real-compute receipt."}


def guarded(command, log, wall_seconds, RSS_bytes):
    from owned_processes import OwnedProcesses
    began = time.monotonic()
    peak = 0
    stop = None
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    for name in ["OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS", "BLIS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"]:
        env[name] = "1"
    tree = OwnedProcesses()
    cleanup = None
    try:
        with Path(log).open("x", encoding="utf8") as stream:
            process = subprocess.Popen(command, cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT,
                                       env=env, start_new_session=(platform.system() == "Linux"))
            try:
                tree.attach(process)
                while process.poll() is None:
                    peak = max(peak, tree.refresh())
                    if peak >= RSS_bytes:
                        stop = "sampled_aggregate_RSS_cap"
                        break
                    if time.monotonic() - began >= wall_seconds:
                        stop = "wall_deadline"
                        break
                    time.sleep(0.1)
            finally:
                cleanup = tree.stop()
    finally:
        tree.close()
    return {"exit_code": process.returncode, "stop_reason": stop,
            "seconds": time.monotonic() - began, "peak_sampled_RSS_bytes": peak,
            "poll_seconds": 0.1, "RSS_is_sampled_not_kernel_enforced": True, "cleanup": cleanup}


def check_closed(step):
    dest = Path(step["out"])
    if step["scope"] == "national":
        commit = read(dest / "COMMIT.json")
        require(commit["status"] == "completed" and commit["task_id"] == step["id"], "national chunk incomplete")
        require(commit["package_manifest_sha256"] == sha(ROOT / "science/national/PACKAGE_MANIFEST.json"), "new run package binding mismatch")
        require(not commit["call_audit"]["unknown"] and commit["call_audit"]["starts"] == commit["call_audit"]["ends"] == commit["expected_call_pairs"], "national calls unclosed")
        for name, digest in commit["files"].items():
            require(sha(dest / name) == digest, "national output SHA mismatch")
        cells = list((dest / "cells").glob("*/result.json"))
        require(len(cells) == step["expected_partitions"], "national output grid incomplete")
        for path in cells:
            d = read(path)
            require(d["status"] == "completed" and d["partition_present"], "national partition absent")
    else:
        summary = read(dest / "summary.json")
        require(summary["status"] == "completed_all_partitions" and summary["tasks_completed"] == 28, "context grid incomplete")
        for name, row in read(dest / "OUTPUT_MANIFEST.json").items():
            require(sha(dest / name) == row["sha256"], "context output SHA mismatch")


def run(out, config):
    release = read(ROOT / "config/release.json")
    require(release["real_compute"] == "ACCEPTED_AFTER_LINUX_CLEANUP_REVIEW", "HELD: real compute awaits actual Linux detached-worker cleanup acceptance; saved-result commands and plan remain available")
    require(platform.system() == "Linux", "real fitting is Linux-only")
    import psutil
    spec = plan(out, config)
    cfg = spec["configuration"]
    require(cfg["session_seconds"] > 0, "session time budget must be bound by root from prior measured runtimes")
    verify()
    deps = read(ROOT / "science/context/PLAN.json")["dependencies"]
    require({name: importlib.metadata.version(name) for name in deps} == deps, "frozen dependency versions required")
    require({cfg["national_cpu"], cfg["context_cpu"]} <= set(psutil.Process().cpu_affinity()), "reserved CPUs unavailable")
    dest = Path(out).resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)
    require(shutil.disk_usage(dest.parent).free >= cfg["minimum_free_disk_bytes"], "insufficient free disk")
    dest.mkdir(exist_ok=False)
    (dest / "logs").mkdir()
    put(dest / "PLAN.json", spec)
    state = {"status": "running", "started_UTC": now(), "new_operational_adapter": True,
             "scientific_acceptance": False, "automatic_retry": False, "steps": []}
    put(dest / "RECEIPT.json", state)
    began = time.monotonic()
    try:
        for step in spec["steps"]:
            remaining = cfg["session_seconds"] - (time.monotonic() - began)
            require(remaining >= step["limit_seconds"], "session budget cannot admit next complete task")
            require(shutil.disk_usage(dest).free >= cfg["minimum_free_disk_bytes"], "free disk admission failed")
            state["active_step"] = step["id"]
            put(dest / "RECEIPT.json", state)
            result = guarded(step["command"], dest / "logs" / (step["id"] + ".log"), step["limit_seconds"], cfg["RSS_bytes"])
            state["steps"].append({"id": step["id"], **result})
            put(dest / "RECEIPT.json", state)
            require(result["exit_code"] == 0 and result["stop_reason"] is None, "stage stopped: " + step["id"])
            check_closed(step)
        state.update(status="completed_504_plus_28", active_step=None, completed_UTC=now())
    except BaseException as error:
        state.update(status="HELD", error=repr(error), stopped_UTC=now())
        raise
    finally:
        state["elapsed_seconds"] = time.monotonic() - began
        put(dest / "RECEIPT.json", state)
    return state
