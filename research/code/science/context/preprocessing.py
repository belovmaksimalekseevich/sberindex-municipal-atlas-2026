"""Frozen contextual transformations. NumPy only; no clustering/label/outcome use.

Refit fit_transform(X_raw[draw]) for EACH robustness draw. Full-reference scales
are descriptive artifacts, not scales to reuse for sample-specific clustering.
"""
import numpy as np

VERSION = 'context2024-sixblocks-v1'
BLOCKS = [
    ('spending_level', [0], False),
    ('spending_shape', [1, 2, 3, 4, 5], False),
    ('population_size', [6], False),
    ('market_access', [7], False),
    ('organization_wage', [8], False),
    ('organization_structure', [9, 10], True),
]
FEATURES = [
    'mean_monthly_log_total', 'mean_monthly_clr_food',
    'mean_monthly_clr_health', 'mean_monthly_clr_marketplaces',
    'mean_monthly_clr_restaurants', 'mean_monthly_clr_transport',
    'log_population_jan1_2024', 'log1p_market_access_2024',
    'log_annual_mean_monthly_organization_salary_2024',
    'log1p_organization_workers_per_resident', 'arcsin_sqrt_education_worker_share',
]

def transformed_features(monthly, population, market_access, salary, workers, education):
    a = np.asarray(monthly, dtype=np.float64)
    p, ma, wage, w, e = [np.asarray(x, dtype=np.float64) for x in
                        (population, market_access, salary, workers, education)]
    n = len(p)
    if a.shape != (n, 12, 6) or any(x.shape != (n,) for x in (p, ma, wage, w, e)):
        raise ValueError('axis/shape mismatch')
    if not all(np.isfinite(x).all() for x in (a, p, ma, wage, w, e)):
        raise ValueError('missing or nonfinite input; no imputation')
    if not (np.all(a > 0) and np.all(p > 0) and np.all(wage > 0) and np.all(w > 0)
            and np.all((ma >= 0) & (ma <= 1000)) and np.all((e >= 0) & (e <= w))):
        raise ValueError('input outside preregistered domain')
    logparts = np.log(a[:, :, 1:])
    clr = (logparts - logparts.mean(axis=2, keepdims=True)).mean(axis=1)
    return np.column_stack((np.log(a[:, :, 0]).mean(axis=1), clr, np.log(p),
                            np.log1p(ma), np.log(wage), np.log1p(w / p),
                            np.arcsin(np.sqrt(e / w))))

def fit_transform(x_raw, variant='context6'):
    """All unordered distinct-row pairs; linear NumPy quantile. No clipping.

    CLR retains its natural Euclidean geometry. Organization's two coordinates
    first receive sample IQR scales; each whole block then receives its median
    pair-distance scale. Each block has weight 1/number_of_selected_blocks.
    """
    x = np.asarray(x_raw, dtype=np.float64)
    if x.ndim != 2 or x.shape[1] != len(FEATURES) or len(x) < 3 or not np.isfinite(x).all():
        raise ValueError('invalid X_raw')
    selected = BLOCKS if variant == 'context6' else BLOCKS[:2] if variant == 'spending2' else None
    if selected is None:
        raise ValueError('unknown variant')
    pairs_i, pairs_j = np.triu_indices(len(x), 1)
    blocks, parameters = [], []
    weight = 1.0 / len(selected)
    for name, columns, coordinate_iqr in selected:
        a = x[:, columns]
        center = np.median(a, axis=0)
        scales = np.ones(len(columns), dtype=np.float64)
        if coordinate_iqr:
            q = np.quantile(a, [0.25, 0.75], axis=0, method='linear')
            scales = q[1] - q[0]
            if not np.all(np.isfinite(scales) & (scales > 0)):
                raise ValueError('zero/nonfinite coordinate IQR: ' + name)
        b = (a - center) / scales
        d = b[pairs_i] - b[pairs_j]
        median_pair_squared = float(np.median(np.sum(d * d, axis=1)))
        if not np.isfinite(median_pair_squared) or median_pair_squared <= 0:
            raise ValueError('zero/nonfinite median pair distance: ' + name)
        scale = float(np.sqrt(median_pair_squared))
        blocks.append((b / scale) * np.sqrt(weight))
        parameters.append(dict(name=name, input_columns=columns, center=center.tolist(),
                               coordinate_scale=scales.tolist(), coordinate_iqr=coordinate_iqr,
                               median_pair_squared_distance=median_pair_squared,
                               block_scale=scale, weight=weight))
    result = np.column_stack(blocks)
    if not np.isfinite(result).all():
        raise ValueError('nonfinite transformed output')
    return result, dict(version=VERSION, variant=variant, n=len(x),
                        pair_count=len(pairs_i), quantile_method='linear',
                        refit_on_each_draw=True, blocks=parameters)
