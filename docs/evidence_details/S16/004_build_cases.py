"""Deterministic worked examples from frozen labels; no clustering or prediction."""
from pathlib import Path
import csv
import gzip
import hashlib
import importlib.util
import json

import numpy as np

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
CODE = ROOT / "workstreams/local_finalization_20261008_r00/portable/staging/r01/municipal_typology/code"
CONTEXT = CODE / "science/context/input"
NATIONAL = CODE / "science/national"
FACTORS = ["population_jan1_2024", "market_access_2024", "organization_salary_RUB_2024", "organization_workers_per_resident_2024", "education_worker_share_2024"]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def native(value):
    if isinstance(value, dict): return {str(k): native(v) for k,v in value.items()}
    if isinstance(value, (list, tuple)): return [native(v) for v in value]
    if isinstance(value, np.ndarray): return native(value.tolist())
    if isinstance(value, np.generic): return value.item()
    return value


def main():
    files = [OUT / "PROTOCOL.md", OUT / "POST_SELECTION_CHECK.md", CONTEXT / "context2024.npz", CONTEXT / "core_ID_context.csv",
             NATIONAL / "data/input2190.npz", NATIONAL / "data/reported2190.npz", NATIONAL / "data/reference.json",
             NATIONAL / "engine/vendor/kernels.py"]
    files += [CODE / "saved/national/2024-12" / f"{m}_K10.json.gz" for m in ("NCut", "SSE")]
    hashes = {str(p.relative_to(ROOT)).replace("\\", "/"): sha(p) for p in files}
    context = np.load(CONTEXT / "context2024.npz", allow_pickle=False)
    rows = list(csv.DictReader((CONTEXT / "core_ID_context.csv").open(encoding="utf-8-sig", newline="")))
    ids = context["IDs"].astype(str)
    assert len(ids) == len(set(ids)) == len(rows) == 1666
    assert list(ids) == [r["ID"] for r in rows]
    regions = context["regions"].astype(str)
    assert list(regions) == [r["supplier_region"] for r in rows]
    national = np.load(NATIONAL / "data/input2190.npz", allow_pickle=False)
    reported = np.load(NATIONAL / "data/reported2190.npz", allow_pickle=False)
    assert np.array_equal(national["ids"], reported["ids"])
    time = list(national["months"]).index("2024-12")
    lookup = {str(i): j for j,i in enumerate(national["ids"])}
    ix = np.array([lookup[i] for i in ids])
    assert national["mask"][time, ix].all()
    rub = reported["values"][time, ix]
    cat = [str(x) for x in national["categories"]]
    # The published frozen transform is reused; fit_reference is never called.
    path = NATIONAL / "engine/vendor/kernels.py"
    spec = importlib.util.spec_from_file_location("frozen_kernels_use_case", path)
    kernel = importlib.util.module_from_spec(spec); spec.loader.exec_module(kernel)
    reference = json.loads((NATIONAL / "data/reference.json").read_text("utf-8"))
    X = kernel.embed(national["z"][time, ix], reference)
    assert X.shape == (1666, 6) and np.isfinite(X).all()
    assert np.allclose(rub, context["monthly_consumption_RUB"][:, 11, [list(context["categories"]).index(c) for c in cat]])
    total = rub[:, 0]
    C = context["X_raw"][:, 6:11]
    scale = np.quantile(C, .75, axis=0) - np.quantile(C, .25, axis=0)
    assert (scale > 0).all()
    C = C / scale
    labels, sw, partitions = {}, {}, {}
    for method in ("NCut", "SSE"):
        p = json.loads(gzip.decompress((CODE / "saved/national/2024-12" / f"{method}_K10.json.gz").read_bytes()))
        mapping = {str(i): j for j,i in enumerate(p["support_IDs"])}
        subset = [mapping[i] for i in ids]
        labels[method] = np.asarray(p["labels"])[subset]
        sw[method] = np.asarray(p["pointwise_SW"])[subset]
        partitions[method] = p
    assert partitions["NCut"]["support_IDs"] == partitions["SSE"]["support_IDs"]
    eligible = np.array([r["supplier_region"] not in ("Москва", "Санкт-Петербург") for r in rows])
    types = np.array([r["supplier_type"] for r in rows])
    numeric = np.array([int(i) for i in ids])

    def profile(i):
        return {"ID": ids[i], "native_oktmo8": rows[i]["native_oktmo8"], "supplier_name": rows[i]["supplier_name"],
                "supplier_type": rows[i]["supplier_type"], "supplier_region": rows[i]["supplier_region"],
                "december_consumption_RUB": dict(zip(cat, rub[i])),
                "context_2024": {f: float(context[f][i]) for f in FACTORS},
                "NCut_group": int(labels["NCut"][i]), "SSE_group": int(labels["SSE"][i]),
                "NCut_SW": float(sw["NCut"][i]), "SSE_SW": float(sw["SSE"][i])}

    # Case 1: anchor by size, never by observed contrast.
    anchors = np.where(eligible & (types == "городской округ"))[0]
    assert len(anchors)
    anchor = sorted(anchors, key=lambda i: (-context["population_jan1_2024"][i], numeric[i]))[0]
    possible = eligible & (types == types[anchor]) & (np.arange(len(ids)) != anchor)
    population = context["population_jan1_2024"]
    possible &= (population >= population[anchor]/2) & (population <= population[anchor]*2)
    attempts = []
    for tolerance in (.1, .2, .3):
        pool = np.where(possible & (np.abs(total/total[anchor] - 1) <= tolerance))[0]
        attempts.append({"Total_relative_tolerance": tolerance, "candidate_N": int(len(pool))})
        if len(pool) >= 3:
            break
    detail = []
    for i in pool:
        p = profile(i)
        p.update({"Total_relative_absolute_difference": abs(float(total[i]/total[anchor]-1)),
                  "spending_X_distance": float(np.linalg.norm(X[i]-X[anchor])),
                  "context5_IQR_distance": float(np.linalg.norm(C[i]-C[anchor])),
                  "same_NCut_group": bool(labels["NCut"][i] == labels["NCut"][anchor]),
                  "same_SSE_group": bool(labels["SSE"][i] == labels["SSE"][anchor])})
        detail.append(p)
    total_order = sorted(detail, key=lambda p: (p["Total_relative_absolute_difference"], int(p["ID"])))
    context_order = sorted(detail, key=lambda p: (p["context5_IQR_distance"], int(p["ID"])))
    case1 = {"anchor": profile(anchor), "selection_attempts": attempts, "population_eligible_candidate_N": int(possible.sum()),
             "candidate_pool": detail, "Total_order_IDs": [p["ID"] for p in total_order],
             "context_order_IDs": [p["ID"] for p in context_order],
             "completed_action": "Constructed same-administrative-type size/Total candidate pool and two explicit ranked shortlists; no transfer-policy or investment recommendation."}

    # Case 2: closest 200 within fixed filters, then intentional access contrast.
    pairs = []
    zero_access_excluded = 0
    usable = np.where(eligible & (sw["NCut"] >= 0))[0]
    for ii, i in enumerate(usable):
        js = usable[ii+1:]
        if not len(js): continue
        m = (types[js] == types[i]) & (labels["NCut"][js] == labels["NCut"][i])
        m &= np.maximum(total[js], total[i]) / np.minimum(total[js], total[i]) <= 1.02
        for j in js[m]:
            if min(context["market_access_2024"][i], context["market_access_2024"][j]) <= 0:
                zero_access_excluded += 1; continue
            a,b = sorted((i,j), key=lambda x: numeric[x])
            pairs.append({"i": int(a), "j": int(b), "X_distance": float(np.linalg.norm(X[a]-X[b])),
                          "market_access_ratio": float(max(context["market_access_2024"][[a,b]])/min(context["market_access_2024"][[a,b]])),
                          "total_ratio": float(max(total[[a,b]])/min(total[[a,b]]))})
    ordered = sorted(pairs, key=lambda p: (p["X_distance"], numeric[p["i"]], numeric[p["j"]]))
    nearest = ordered[:200]
    assert nearest
    selected = sorted(nearest, key=lambda p: (-p["market_access_ratio"], p["X_distance"], numeric[p["i"]], numeric[p["j"]]))[0]
    a,b = selected["i"], selected["j"]
    case2 = {"eligible_pair_N": len(pairs), "zero_access_pairs_excluded": zero_access_excluded,
             "close_pair_pool_N": len(nearest), "close_pair_pool_max_X_distance": max(p["X_distance"] for p in nearest),
             "pair": [profile(a), profile(b)], "X_distance": selected["X_distance"],
             "market_access_ratio": selected["market_access_ratio"], "Total_ratio": selected["total_ratio"],
             "context5_IQR_distance": float(np.linalg.norm(C[a]-C[b])),
             "close_pool": [{"IDs": [ids[p["i"]], ids[p["j"]]], "X_distance": p["X_distance"], "market_access_ratio": p["market_access_ratio"]} for p in nearest],
             "selection_warning": "Intentionally maximum access contrast within the predeclared 200 closest eligible spending pairs; illustrative, not typical effect or validation.",
             "completed_action": "Flagged selected spending analogues as non-equivalent in market access; retained spending comparison but prohibited unqualified contextual substitution."}

    # Case 3: most negative NCut SW with a positive SSE alternative.
    pool3 = np.where(eligible & (sw["NCut"] < 0) & (sw["SSE"] > 0))[0]
    assert len(pool3)
    point = sorted(pool3, key=lambda i: (sw["NCut"][i], numeric[i]))[0]
    medians = {}
    comparable_medians = {}
    for method in ("NCut", "SSE"):
        group = int(labels[method][point]); mask = labels[method] == group
        medians[method] = {"group": group, "N_common": int(mask.sum()), "N_full": int(partitions[method]["sizes"][group]),
                           "consumption_RUB_median": dict(zip(cat, np.median(rub[mask], axis=0))),
                           "context_2024_median": {f: float(np.median(context[f][mask])) for f in FACTORS},
                           "negative_SW_N_full": int(sum(x < 0 for g,x in zip(partitions[method]["labels"], partitions[method]["pointwise_SW"]) if g == group))}
        comparable = mask & eligible & (types == types[point])
        comparable_medians[method] = {"group": group, "supplier_type": types[point], "N": int(comparable.sum()),
                                      "consumption_RUB_median": dict(zip(cat, np.median(rub[comparable], axis=0))),
                                      "context_2024_median": {f: float(np.median(context[f][comparable])) for f in FACTORS}}
    case3 = {"eligible_negative_NCut_positive_SSE_N": int(len(pool3)), "territory": profile(point), "group_profiles_same_support": medians,
             "post_selection_same_supplier_type_nonfederal_profiles": comparable_medians,
             "completed_action": "Marked NCut assignment as boundary/ambiguous and exposed the saved SSE alternative for scrutiny; neither labels nor economic functions changed."}
    assert all(sha(ROOT/p) == h for p,h in hashes.items())
    facts = {"schema": "worked-economic-cases-20261008-v1", "status": "COMPLETED_DESCRIPTIVE_CASES_NO_FIT",
             "scope": {"common_IDs": 1666, "common_regions": len(set(regions)), "labels_month": "2024-12", "context_year": 2024,
                       "excluding_federal_cities_N": int(eligible.sum()), "new_fit": False, "new_SSH": False, "new_download": False},
             "geometry": {"spending": "Reused kernels.embed with frozen reference.json; fit_reference not called.", "context": "Five transformed coordinates divided by common-support IQR", "context_IQR": scale.tolist(), "categories": cat},
             "case1": case1, "case2": case2, "case3": case3,
             "sources_sha256": hashes, "source_hashes_unchanged_after_read": True,
             "limitations": ["Descriptive examples selected on observed outcomes are not an independent validation or measure of business benefit.", "Conditional exact-code territorial admission is not a certificate of stable physical boundaries.", "Wages cover organizations excluding small businesses, not all resident incomes; workers/residents is not resident employment and can exceed one.", "Annual context and December spending have different temporal aggregation.", "No economic sector, causal role, investment policy or true label inferred.", "Native SW retains the full 2103-ID December reference; group contextual medians use common 1666 IDs."]}
    (OUT / "FACTS.json").write_text(json.dumps(native(facts), ensure_ascii=False, indent=2, allow_nan=False) + "\n", "utf-8")
    print(json.dumps(native({"case1_anchor": case1["anchor"], "case1_attempts": attempts, "case1_total": total_order[:3], "case1_context": context_order[:3], "case2": {k:v for k,v in case2.items() if k!='close_pool'}, "case3":case3}), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
