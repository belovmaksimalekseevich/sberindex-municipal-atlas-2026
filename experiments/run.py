"""One-month experiments with the published kernels, isolated from accepted results.

plan only uses the Python standard library. run writes a new directory outside
the checkout; it never updates the website, reference or accepted model files.
"""
import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import math
import os
from pathlib import Path
import platform
import sys
import time
from datetime import datetime, timezone

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "research"
NATIONAL = RESEARCH / "code/science/national"
ENGINE = NATIONAL / "engine"
ADAPTER = NATIONAL / "engineering/detailed_typology_national_20261007_r00/adapter.py"
MANIFEST_SHA256 = "58191f4144cd5facbc2265a740c06936776d765b7b0ddc47842aa6ba95e8fddd"
SCHEMA = "municipal-experiment-v1"
RUNTIME = {"numpy": "2.4.4", "scipy": "1.17.1", "threadpoolctl": "3.6.0"}
THREAD_VARIABLES = ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS",
                    "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "BLIS_NUM_THREADS")


def utc():
    return datetime.now(timezone.utc).isoformat()


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key: " + key)
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError("non-finite JSON number: " + value)


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"),
                      object_pairs_hook=unique_object, parse_constant=reject_constant)


def fields(value, expected, name):
    if type(value) is not dict or set(value) != set(expected):
        raise ValueError(name + " requires exactly: " + ", ".join(sorted(expected)))


def integer(value, low, high, name):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"{name} must be an integer in [{low}, {high}]")


def real(value, low, high, name):
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{name} must be finite in [{low}, {high}]")


def validate_config(config):
    fields(config, {"schema", "month", "method", "K", "seeds", "graph", "optimizer", "threads"}, "config")
    if config["schema"] != SCHEMA:
        raise ValueError("unsupported config schema")
    months = {f"{year}-{month:02}" for year in (2023, 2024) for month in range(1, 13)}
    if type(config["month"]) is not str or config["month"] not in months:
        raise ValueError("month must be one month from 2023-01 through 2024-12")
    if type(config["method"]) is not str or config["method"] not in ("SSE", "NCut", "Ward"):
        raise ValueError("method must be SSE, NCut or Ward")
    integer(config["K"], 2, 20, "K")
    integer(config["threads"], 1, 8, "threads")
    seeds = config["seeds"]
    if type(seeds) is not list:
        raise ValueError("seeds must be an array")
    if config["method"] == "Ward":
        if seeds or config["optimizer"] is not None:
            raise ValueError("Ward requires seeds=[] and optimizer=null: its tree cut is deterministic")
    else:
        if not 1 <= len(seeds) <= 8:
            raise ValueError("SSE/NCut require 1 to 8 seeds")
        for seed in seeds:
            integer(seed, 0, 2**32 - 1, "seed")
        if len(set(seeds)) != len(seeds):
            raise ValueError("seeds must be unique")
        fields(config["optimizer"], {"max_iterations"}, "optimizer")
        integer(config["optimizer"]["max_iterations"], 1, 1000, "max_iterations")
    graph = config["graph"]
    if config["method"] != "NCut":
        if graph is not None:
            raise ValueError("SSE/Ward require graph=null; a fitting graph does not affect these methods")
    else:
        fields(graph, {"kind", "k", "sigma", "radius"}, "graph")
        real(graph["sigma"], 0.05, 10, "graph.sigma")
        if graph["kind"] == "union":
            integer(graph["k"], 1, 128, "graph.k")
            if graph["radius"] is not None:
                raise ValueError("union graph requires radius=null")
        elif graph["kind"] == "radius":
            real(graph["radius"], 0.05, 10, "graph.radius")
            if graph["k"] is not None:
                raise ValueError("radius graph requires k=null")
        else:
            raise ValueError("graph.kind must be union or radius")
    return config


def load_config(path):
    return validate_config(read_json(path))


def verify_sources():
    """Check the pinned release manifest and all inputs/code this mode can use."""
    manifest_path = RESEARCH / "PACKAGE_MANIFEST.json"
    if sha(manifest_path) != MANIFEST_SHA256:
        raise ValueError("the accepted research manifest changed")
    manifest = read_json(manifest_path)["files"]
    names = {"code/requirements-compute.txt", "code/science/national/task_catalog.json",
             "code/science/national/data/input2190.npz", "code/science/national/data/reported2190.npz",
             "code/science/national/data/reference.json", ADAPTER.relative_to(RESEARCH).as_posix()}
    # Pin the complete imported engine, including its local transitive imports.
    names.update(name for name in manifest if name.startswith("code/science/national/engine/") and name.endswith(".py"))
    expected_engine = {name.removeprefix("code/science/national/engine/") for name in names if name.startswith("code/science/national/engine/")}
    if {path.relative_to(ENGINE).as_posix() for path in ENGINE.rglob("*.py")} != expected_engine:
        raise ValueError("unexpected or missing engine source")
    bindings = {}
    for name in sorted(names):
        path = (RESEARCH / name).resolve()
        expected = manifest.get(name)
        if not path.is_relative_to(RESEARCH) or not expected or path.stat().st_size != expected["bytes"] or sha(path) != expected["sha256"]:
            raise ValueError("accepted source mismatch: " + name)
        bindings["research/" + name] = {"sha256": expected["sha256"], "bytes": expected["bytes"]}
    bindings["research/PACKAGE_MANIFEST.json"] = {"sha256": MANIFEST_SHA256, "bytes": manifest_path.stat().st_size}
    bindings["experiments/run.py"] = {"sha256": sha(Path(__file__)), "bytes": Path(__file__).stat().st_size}
    return bindings


def plan(config_path):
    config_path = Path(config_path).resolve()
    config = load_config(config_path)
    bindings = verify_sources()
    rows = read_json(NATIONAL / "task_catalog.json")
    task = next(row for row in rows if row["month"] == config["month"])
    if config["K"] >= task["N"] or (config["graph"] and config["graph"]["kind"] == "union" and config["graph"]["k"] >= task["N"]):
        raise ValueError("K and graph.k must be smaller than the observed support")
    return {"schema": SCHEMA, "phase": "plan", "config": config,
            "config_file_sha256": sha(config_path), "config_sha256": digest(config),
            "sources": bindings, "month_index": task["month_index"], "N": task["N"],
            "ordered_IDs_sha256": task["ordered_IDs_sha256"],
            "reference_policy": "unchanged accepted 24-month reference; not refitted",
            "geometry": "accepted X6 LHCLR alpha=.5 beta=.5; equivalent-distance Y7 for S_Dbw",
            "evaluation_graph": {"kind": "radius", "radius": 1.5, "sigma": 1.0, "fixed": True},
            "fit_graph_applies": config["method"] == "NCut",
            "optimizer": "exact Lloyd: stops at unchanged labels; tol is unsupported" if config["method"] != "Ward" else "deterministic Ward tree cut",
            "fit_attempts_planned": len(config["seeds"]) if config["method"] != "Ward" else 1,
            "runtime_required": RUNTIME, "new_fits": 0, "experimental": True,
            "model_promoted": False, "scientific_acceptance": False}


def check_output_path(out, config_path):
    raw = Path(out).expanduser()
    target = raw.resolve()
    if raw.exists() or raw.is_symlink() or target.exists():
        raise ValueError("output must be a fresh directory; no overwrite or resume")
    if target.is_relative_to(ROOT) or target == Path(config_path).resolve():
        raise ValueError("output must be outside the entire checkout and configuration")
    return target


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_scientific_modules():
    for directory in (ENGINE, ENGINE / "vendor"):
        if str(directory) not in sys.path:
            sys.path.insert(0, str(directory))
    science = load_module("municipal_experiment_science", ENGINE / "science.py")
    adapter = load_module("municipal_experiment_adapter", ADAPTER)
    return science, adapter


def load_geometry(config):
    import numpy as np
    science, _ = load_scientific_modules()
    with np.load(NATIONAL / "data/input2190.npz", allow_pickle=False) as source, np.load(NATIONAL / "data/reported2190.npz", allow_pickle=False) as reported:
        months = source["months"].tolist()
        index = months.index(config["month"])
        mask = source["mask"][index]
        if not np.array_equal(source["months"], reported["months"]) or not np.array_equal(source["ids"], reported["ids"]) or not np.array_equal(source["mask"], reported["mask"]):
            raise ValueError("monthly latent/reported input alignment mismatch")
        ids = source["ids"][mask].tolist()
        z = source["z"][index, mask].copy()
        rub = reported["values"][index, mask].copy()
    if ids != sorted(set(ids)) or z.shape != (len(ids), 6) or rub.shape != z.shape or not np.isfinite(z).all() or not np.isfinite(rub).all() or np.any(rub <= 0):
        raise ValueError("observed input domain mismatch")
    task = next(row for row in read_json(NATIONAL / "task_catalog.json") if row["month"] == config["month"])
    if len(ids) != task["N"] or science.digest(ids) != task["ordered_IDs_sha256"]:
        raise ValueError("observed support differs from accepted input")
    reference = read_json(NATIONAL / "data/reference.json")
    return {"month": config["month"], "ids": ids, "z": z, "rub": rub, "reference": reference,
            "X": science.kn.embed(z, reference), "Y": science.kn.symmetric_coordinates(z, reference)}


def fit_geometry(config, geometry):
    """Scientific core; tests may supply a tiny explicit artificial geometry."""
    validate_config(config)
    science, adapter = load_scientific_modules()
    method, K = config["method"], config["K"]
    if not 1 < K < len(geometry["ids"]):
        raise ValueError("K must be smaller than the geometry support")
    g = dict(geometry)
    g["W_eval"] = science.kn.graph(g["X"], kind="radius", radius=1.5, sigma=1)["W"]
    fit_graph = None
    if method == "NCut":
        parameters = {key: value for key, value in config["graph"].items() if value is not None}
        fit_graph = science.kn.graph(g["X"], **parameters)
        g["W_fit"] = fit_graph["W"]
    else:
        # The existing result adapter expects this slot; these methods never fit a graph.
        g["W_fit"] = g["W_eval"]
    engine = science.SpectralEngine()
    attempts, context, labels = [], None, None
    if method == "Ward":
        from scipy.cluster.hierarchy import linkage, cut_tree
        labels = list(science.kn.canonical(cut_tree(linkage(g["X"], method="ward", metric="euclidean", optimal_ordering=False), n_clusters=[K]).ravel()))
    else:
        context = adapter.context(science, g, method, K, config["seeds"], engine)
        for index, seed in enumerate(config["seeds"], 1):
            attempt = {"seed_index": index, "seed": seed, "labels": None, "objective": None}
            if context["preflight"]:
                attempt["status"] = context["preflight"]
            else:
                native = science.kn.lloyd(context["fit"], K, seed, max_iterations=config["optimizer"]["max_iterations"])
                attempt.update(native)
                if method == "NCut" and native["status"] == "converged":
                    attempt["rounding_SSE"] = native["objective"]
                    attempt["objective"] = science.kn.ncut_exact(g["W_fit"], native["labels"])
            attempts.append(attempt)
    result = adapter.result(science, g, method, K, attempts, context, labels)
    result.update(schema=SCHEMA, study_id="user-configured-one-month-experiment", experimental=True,
                  effective_config=config, scientific_acceptance=False, model_promoted=False,
                  fitting_graph=config["graph"], reference_refitted=False,
                  evaluation_graph={"kind": "radius", "radius": 1.5, "sigma": 1.0, "fixed": True})
    if method != "NCut":
        result["provenance"]["W_fit"] = None
    result["fit_diagnostics"] = {"actual_eigensolves": engine.counts["actual_eigensolves"],
                                  "isolated_IDs": [g["ids"][i] for i in fit_graph["isolates"]] if fit_graph else [],
                                  "fitting_graph_applies": method == "NCut"}
    return result, attempts


def encode(value):
    """Lossless fractions/traces, with no non-finite JSON numbers."""
    from fractions import Fraction
    if isinstance(value, Fraction):
        return {"numerator": str(value.numerator), "denominator": str(value.denominator)}
    if isinstance(value, dict):
        return {str(key): encode(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [encode(item) for item in value]
    if type(value).__module__.startswith("numpy"):
        return encode(value.tolist())
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("non-finite output must have an explicit scientific status")
    return value


def write_json(path, value):
    temporary = path.with_name(path.name + ".tmp")
    if path.exists() or temporary.exists():
        raise ValueError("refusing to overwrite experiment artifact: " + path.name)
    payload = json.dumps(encode(value), ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    with temporary.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def execute(config_path, out):
    target = check_output_path(out, config_path)
    registration = plan(config_path)
    config = registration["config"]
    versions = {name: importlib.metadata.version(name) for name in RUNTIME}
    if versions != RUNTIME:
        raise ValueError("runtime versions differ; install research/code/requirements-compute.txt outside the checkout")
    for variable in THREAD_VARIABLES:
        os.environ[variable] = str(config["threads"])
    from threadpoolctl import threadpool_limits, threadpool_info
    target.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    write_json(target / "PLAN.json", registration)
    write_json(target / "config.json", config)
    try:
        with threadpool_limits(limits=config["threads"]):
            geometry = load_geometry(config)
            # Libraries imported by the geometry loader also receive the explicit limit.
            with threadpool_limits(limits=config["threads"]):
                pools = threadpool_info()
                if any(pool["num_threads"] > config["threads"] for pool in pools):
                    raise ValueError("threadpool limit was not applied")
                result, attempts = fit_geometry(config, geometry)
        if sha(config_path) != registration["config_file_sha256"] or verify_sources() != registration["sources"]:
            raise ValueError("configuration or accepted sources changed during the run")
        provenance = {"schema": SCHEMA, "UTC": utc(), "experimental": True, "model_promoted": False,
                      "scientific_acceptance": False, "sources": registration["sources"],
                      "config_file_sha256": registration["config_file_sha256"], "config_sha256": registration["config_sha256"],
                      "effective_config": config, "python": platform.python_version(), "platform": platform.platform(),
                      "runtime": versions, "threadpools": [{key: p.get(key) for key in ("user_api", "internal_api", "version", "num_threads")} for p in pools],
                      "seconds": time.monotonic() - started, "support_IDs_sha256": digest(result["support_IDs"]),
                      "labels_sha256": digest(result["labels"]), "automatic_retry": False,
                      "note": "Experimental output only; no automatic promotion or equivalence claim for the accepted models."}
        write_json(target / "attempts.json", attempts)
        write_json(target / "result.json", result)
        write_json(target / "provenance.json", provenance)
        write_json(target / "labels.json", {"month": config["month"], "method": config["method"], "K": config["K"],
                                           "IDs": result["support_IDs"], "labels": result["labels"],
                                           "partition_present": result["partition_present"], "experimental": True, "model_promoted": False})
        status = "completed" if result["partition_present"] else "unavailable"
        commit = {"schema": SCHEMA, "status": status, "partition_present": result["partition_present"],
                  "result_status": result["status"], "experimental": True, "scientific_acceptance": False,
                  "model_promoted": False, "files": {p.name: {"sha256": sha(p), "bytes": p.stat().st_size} for p in sorted(target.iterdir()) if p.is_file()}}
        write_json(target / "COMMIT.json", commit)
        return {"status": status, "output": str(target), "partition_present": result["partition_present"],
                "result_status": result["status"], "experimental": True, "model_promoted": False,
                "commit_sha256": sha(target / "COMMIT.json")}
    except BaseException as error:
        write_json(target / "FAILED.json", {"status": "failed", "UTC": utc(), "error_type": type(error).__name__,
                                            "error": str(error), "experimental": True, "model_promoted": False,
                                            "automatic_retry": False})
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("plan", "run"):
        command = commands.add_parser(name)
        command.add_argument("--config", required=True, type=Path)
        if name == "run":
            command.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    result = plan(args.config) if args.command == "plan" else execute(args.config, args.out)
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    return 3 if args.command == "run" and not result["partition_present"] else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, ImportError, KeyError) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        sys.exit(2)
