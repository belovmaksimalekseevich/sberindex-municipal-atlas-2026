"""Read the accepted saved catalogue or explicitly plan a separate full replay."""
from pathlib import Path
import argparse
from collections import Counter, defaultdict
import csv
import gzip
import hashlib
import json
import math
import sys

ROOT = Path(__file__).resolve().parent
KS = [4, 6, 8, 10, 12, 16, 20]
METRICS = ["SW", "CH", "S_Dbw", "AVI", "AVU", "MQ"]
FEATURES = ["log_Total", "h", "CLR_food", "CLR_health", "CLR_restaurants", "CLR_transport", "CLR_marketplaces",
            "RUB_Total", "RUB_food", "RUB_health", "RUB_restaurants", "RUB_transport", "RUB_marketplaces"]


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def emit(value):
    print(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False))


def records():
    for scope in ["national", "context"]:
        for path in sorted((ROOT / "saved" / scope).rglob("*.json.gz")):
            with gzip.open(path, "rt", encoding="utf8") as stream:
                yield json.load(stream)


def validate_record(d):
    ids = d.get("support_IDs", d.get("IDs"))
    n, k = d["N"], d["K"]
    require(d["status"] == "completed" and ids == sorted(set(ids)) and len(ids) == n, "invalid saved support")
    require(len(d["labels"]) == n and all(type(v) is int for v in d["labels"]), "invalid labels")
    require(Counter(d["labels"]) == Counter({i: s for i, s in enumerate(d["sizes"])}), "labels/sizes mismatch")
    require(len(d["sizes"]) == k and set(d["labels"]) == set(range(k)), "empty/missing group")
    require(len(d["pointwise_SW"]) == n and all(math.isfinite(v) and -1 <= v <= 1 for v in d["pointwise_SW"]), "invalid pointwise SW")
    if d["scope"] == "national":
        require(set(d["metrics"]) == set(METRICS), "missing national metric")
        for name, m in d["metrics"].items():
            if m["status"] == "ok":
                require(m["value"] is not None and math.isfinite(m["value"]), "nonfinite successful metric")
            else:
                require(m["value"] is None and bool(m.get("reason")), "undefined metric must retain null and reason")
            if name != "S_Dbw":
                require(m["status"] == "ok", "unexpected missing national metric")
        p = d["semantic_profiles"]
        require(p["feature_names"] == FEATURES and (p["key"], p["method"], p["K"]) == (d["month"], d["method"], k), "semantic axis/cell mismatch")
        require([g["size"] for g in p["profiles"]] == d["sizes"], "semantic profile support mismatch")
        sw = d["metrics"]["SW"]["value"]
    else:
        require(n == 1666 and d["reference_year"] == 2024 and not d["national_full"], "context scope changed")
        sw = d["metrics"]["SW"]["value"]
    require(math.isclose(sw, math.fsum(d["pointwise_SW"]) / n, rel_tol=1e-13, abs_tol=1e-13), "SW arithmetic mismatch")


def verify():
    manifest = read(ROOT / "PACKAGE_MANIFEST.json")
    for name, row in manifest["files"].items():
        path = (ROOT / name).resolve()
        require(path.is_relative_to(ROOT) and path.is_file(), "missing/outside package member: " + name)
        require(path.stat().st_size == row["bytes"] and sha(path) == row["sha256"], "package SHA mismatch: " + name)
    actual = {p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*") if p.is_file() and p != ROOT / "PACKAGE_MANIFEST.json"}
    require(actual == set(manifest["files"]), "unexpected or missing delivery files")
    frozen = 0
    for scope in ["national", "context"]:
        original = read(ROOT / "provenance" / (scope + "_original_manifest.json"))
        original = original.get("files", original)
        selected = read(ROOT / "science" / scope / "PACKAGE_MANIFEST.json")
        selected = selected.get("files", selected)
        for name, row in selected.items():
            require(row == original[name] and sha(ROOT / "science" / scope / name) == row["sha256"], "frozen member changed")
            frozen += 1
    keys, counts, availability, supports = set(), Counter(), Counter(), {}
    for d in records():
        validate_record(d)
        key = (d["scope"], d["variant"], d["month"], d["method"], d["K"])
        require(key not in keys, "duplicate cell")
        keys.add(key)
        counts[d["scope"]] += 1
        if d["scope"] == "national":
            previous = supports.setdefault(d["month"], d["support_IDs"])
            require(previous == d["support_IDs"], "unequal within-month supports")
            availability[d["metrics"]["S_Dbw"]["status"]] += 1
    expected = {("national", "mixed", f"{year}-{month:02d}", method, k)
                for year in [2023, 2024] for month in range(1, 13) for method in ["SSE", "Ward", "NCut"] for k in KS}
    expected |= {("context", variant, None, method, k) for variant in ["context6", "spending2"] for method in ["KMeans", "Ward"] for k in KS}
    require(keys == expected, "incomplete 504+28 grid")
    require(sum(len(v) for v in supports.values()) == 50521 and len(set().union(*map(set, supports.values()))) == 2190, "national support changed")
    require(availability["ok"] == 175 and sum(availability.values()) == 504, "S_Dbw availability changed")
    return {"passed": True, "files_checked": len(manifest["files"]), "byte_identical_frozen_members": frozen,
            "partitions": dict(counts), "S_Dbw_status_counts": dict(availability), "new_fits": 0}


def select(scope, variant, month, method, k):
    method = method or ("NCut" if scope == "national" else "KMeans")
    k = k or (10 if scope == "national" else 6)
    require(scope in ["national", "context"] and k in KS, "unknown saved scope/K")
    require(method in (["NCut", "SSE", "Ward"] if scope == "national" else ["KMeans", "Ward"]), "method absent from this scope")
    require(month in [f"{year}-{m:02d}" for year in [2023, 2024] for m in range(1, 13)] if scope == "national" else variant in ["context6", "spending2"], "saved period/variant not found")
    path = ROOT / "saved" / scope / (month if scope == "national" else variant) / f"{method}_K{k:02d}.json.gz"
    with gzip.open(path, "rt", encoding="utf8") as stream:
        d = json.load(stream)
    validate_record(d)
    return d


def metric(d, name):
    value = d["metrics"].get(name)
    return value.get("value") if isinstance(value, dict) else value


def summary():
    grouped = defaultdict(list)
    for d in records():
        validate_record(d)
        grouped[(d["scope"], d["variant"], d["method"], d["K"])].append(d)
    rows = []
    for (scope, variant, method, k), group in sorted(grouped.items()):
        row = {"scope": scope, "variant": variant, "method": method, "K": k, "partitions": len(group),
               "ID_observations": sum(d["N"] for d in group),
               "negative_SW_observations": sum(sum(v < 0 for v in d["pointwise_SW"]) for d in group)}
        row["metrics"] = {}
        for name in (METRICS if scope == "national" else ["SW", "CH", "DB", "inertia"]):
            values = [metric(d, name) for d in group if metric(d, name) is not None]
            row["metrics"][name] = {"mean_over_available_partitions": math.fsum(values) / len(values) if values else None,
                                    "available": len(values), "undefined": len(group) - len(values)}
        rows.append(row)
    return {"aggregation": "unweighted arithmetic mean over saved partitions; null excluded with count; no automatic model ranking; different geometries must not be ranked together", "rows": rows}


def external_output_path(out):
    out = Path(out).resolve()
    protected = [ROOT]
    for parent in ROOT.parents:
        manifest = parent / "PACKAGE_MANIFEST.json"
        member = (ROOT / "PACKAGE_MANIFEST.json").relative_to(parent).as_posix()
        if manifest.is_file() and member in read(manifest).get("files", {}):
            protected.append(parent)
    require(not any(out.is_relative_to(base) for base in protected),
            "output must be outside the delivery and any enclosing portable package")
    return out


def export_summary(out):
    out = external_output_path(out)
    with out.open("x", encoding="utf-8-sig", newline="") as stream:
        fields = ["scope", "variant", "month", "method", "K", "N", "negative_SW_n"]
        fields += [name + suffix for name in METRICS + ["DB", "inertia"] for suffix in ["", "_status", "_reason"]]
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for d in records():
            validate_record(d)
            row = {key: d[key] for key in ["scope", "variant", "month", "method", "K", "N"]}
            row["negative_SW_n"] = sum(v < 0 for v in d["pointwise_SW"])
            for name, m in d["metrics"].items():
                row[name] = m.get("value") if isinstance(m, dict) else m
                row[name + "_status"] = m["status"] if isinstance(m, dict) else "ok"
                row[name + "_reason"] = m.get("reason") if isinstance(m, dict) else ""
            writer.writerow(row)
    return {"rows": 532, "output": str(out), "new_fits": 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="command", required=True)
    subs.add_parser("verify", help="verify delivery hashes, full grid and saved arithmetic")
    subs.add_parser("summary", help="summarize all saved partitions without fitting")
    p = subs.add_parser("export", help="export all 532 metric rows; fresh CSV only")
    p.add_argument("--out", required=True)
    for name in ["show", "labels"]:
        p = subs.add_parser(name, help="inspect one saved cell or export its ID labels")
        p.add_argument("--scope", choices=["national", "context"], default="national")
        p.add_argument("--variant", choices=["context6", "spending2"], default="context6")
        p.add_argument("--month", default="2024-12")
        p.add_argument("--method", choices=["NCut", "SSE", "Ward", "KMeans"])
        p.add_argument("--K", type=int, choices=KS)
        p.add_argument("--id")
        if name == "labels":
            p.add_argument("--out", required=True)
    for name in ["plan", "compute"]:
        p = subs.add_parser(name, help="prepare full compute commands" if name == "plan" else "explicit Linux full compute (never implicit)")
        p.add_argument("--out", required=True)
        p.add_argument("--config", default=str(ROOT / "config/compute.json"))
        if name == "compute":
            p.add_argument("--allow-real-fitting", action="store_true")
            p.add_argument("--exclusive-cpus-confirmed", action="store_true")
    args = parser.parse_args()
    if args.command == "verify":
        emit(verify())
    elif args.command == "summary":
        emit(summary())
    elif args.command == "export":
        emit(export_summary(args.out))
    elif args.command in ["show", "labels"]:
        d = select(args.scope, args.variant, args.month, args.method, args.K)
        ids = d.get("support_IDs", d.get("IDs"))
        if args.command == "labels":
            with external_output_path(args.out).open("x", encoding="utf-8-sig", newline="") as stream:
                writer = csv.writer(stream)
                writer.writerow(["ID", "group", "pointwise_SW"])
                writer.writerows(zip(ids, d["labels"], d["pointwise_SW"]))
            emit({"rows": len(ids), "output": str(Path(args.out).resolve()), "group_numbers_are_month_local": args.scope == "national"})
        elif args.id:
            require(args.id in ids, "ID absent from this partition's observed support")
            index = ids.index(args.id)
            emit({"ID": args.id, "group": d["labels"][index], "pointwise_SW": d["pointwise_SW"][index],
                  "month": d["month"], "method": d["method"], "K": d["K"], "scope": d["scope"],
                  "group_numbers_are_month_local": args.scope == "national"})
        else:
            emit({key: value for key, value in d.items() if key not in ["support_IDs", "IDs", "labels", "pointwise_SW"]})
    else:
        import compute
        if args.command == "plan":
            emit(compute.plan(args.out, args.config))
        else:
            require(args.allow_real_fitting and args.exclusive_cpus_confirmed, "real compute requires explicit fitting and exclusive CPU flags")
            emit(compute.run(args.out, args.config))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        sys.exit(2)
