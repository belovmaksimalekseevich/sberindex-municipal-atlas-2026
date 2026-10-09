"""Arbitrary registered K using unchanged E28 kernels and common-space metrics."""
from fractions import Fraction as F
from math import fsum
import numpy as np

def install_readonly_cache(s,X,W_eval,W_fit,recorded_distances=None):
    original_distance=s.kn.pair_distances;original_dyadic=s.kn.Dyadic
    distances=original_distance(X) if recorded_distances is None else recorded_distances
    if distances.shape!=(len(X),len(X)) or not np.isfinite(distances).all() or not np.array_equal(distances,distances.T) or np.any(np.diag(distances)) or np.any(distances<0):raise ValueError('cached_distance_domain')
    distances.flags.writeable=False
    # Immutable objects, same exact class and same dyadic integers; no arithmetic replacement.
    matrices=[W_eval,W_fit];dyadics=[original_dyadic(a) for a in matrices]
    for a in [X,*matrices]:a.flags.writeable=False
    def distance(rows):return distances if rows is X else original_distance(rows)
    def dyadic(rows):
        for a,d in zip(matrices,dyadics):
            if rows is a:return d
        return original_dyadic(rows)
    s.kn.pair_distances=distance;s.kn.Dyadic=dyadic
    return distances,lambda:(setattr(s.kn,'pair_distances',original_distance),setattr(s.kn,'Dyadic',original_dyadic))

def profiles(s,z,rub,ids,labels,points,month,method,K):
    out=[]
    for g in range(K):
        ix=[i for i,v in enumerate(labels) if v==g];values=rub[ix]
        clr=s.kn.blocks(z[ix])['clr'];mean=np.array([fsum(clr[:,j])/len(ix) for j in range(5)])
        center=np.exp(mean-mean.max());center/=center.sum()
        q=np.quantile(values,[.25,.5,.75],axis=0,method='linear')
        order=sorted(ix,key=lambda i:(points[i],ids[i])) if points is not None else []
        out.append({'cluster_id':f'{month}:{method}:K{K}:G{g}','group_index':g,'n':len(ix),
                    'q25_RUB':q[0].tolist(),'median_RUB':q[1].tolist(),'q75_RUB':q[2].tolist(),
                    'selected5_geometric_center':center.tolist(),'member_IDs_sha256':s.digest([ids[i] for i in ix]),
                    'negative_SW_n':sum(points[i]<0 for i in ix) if points is not None else None,
                    'boundary_IDs':[ids[i] for i in order[:2]],'functional_name':None,'accepted_lineage':False})
    return out

def context(s,geometry,method,K,seeds,engine):
    X=geometry['X'];W=geometry['W_fit'];fit=X;preflight=None;spectral=None
    scale=max(F(1),s.kn.exact_sse(X)) if method=='SSE' else F(K)
    if method=='NCut':
        spectral=engine.spectral(W,K)
        if spectral['status']=='available':fit=spectral.pop('embedding')
        else:preflight=spectral['status'];fit=None
    if fit is not None and len(set(map(tuple,fit)))<K:preflight='preflight_D2_exhausted'
    return {'config':{'id':f'{method}-K{K}','family':method,'K':K,'primary_seeds':seeds},
            'ids':geometry['ids'],'reference':geometry['reference'],'fit':fit,'W':W if method=='NCut' else None,
            'scale':scale,'preflight':preflight,'spectral':spectral}

def result(s,geometry,method,K,attempts,ctx=None,ward_labels=None):
    issues=[];rep=None
    if method=='Ward':
        labels=ward_labels;selector={'applicable':False,'deterministic_tree_cut':True}
        objective=s.kn.exact_sse(geometry['X'],labels,expected_k=K)
        selector['own_SSE_description']=s.fraction(objective)
    else:
        rep=s.own_representative(attempts,ctx['scale'],False);chosen=rep['representative']
        labels=list(chosen['labels']) if chosen else None
        issues=[f'seed{a["seed_index"]}:{a["status"]}' for a in attempts if a['status']!='converged']
        selector={'applicable':True,'q_star':s.fraction(rep['q_star']) if rep['q_star'] is not None else None,
                  'tau':s.fraction(rep['tau']),'tie_seeds':rep['tie_seeds'],
                  'representative_seed_index':chosen['seed_index'] if chosen else None,
                  'rule':'exact own objective minimum, scale/1e10 ties, canonical labels then seed index',
                  'own_objective_cross_graph_comparable':False}
    scores=None;point=None;p=[];sizes=[]
    if labels is None:issues.append('no_converged_representative')
    else:
        labels=list(s.kn.canonical(labels))
        if len(labels)!=len(geometry['ids']) or set(labels)!=set(range(K)):raise ValueError('exact_K_full_assignment_required')
        scores=s.icvi.six(geometry['X'],geometry['Y'],geometry['W_eval'],labels,geometry['ids'],reference_hash=s.digest(geometry['reference']))
        point=scores['SW']['diagnostics'].get('pointwise');sizes=[labels.count(g) for g in range(K)]
        if min(sizes)<2:issues.append('min_group_size_below_2')
        issues.extend('metric:'+name+':'+m['status'] for name,m in scores.items() if m['status']!='ok')
        p=profiles(s,geometry['z'],geometry['rub'],geometry['ids'],labels,point,geometry['month'],method,K)
    r={'schema':'detailed-typology-national-result-v1','study_id':'DT24-MIXED-GRID-v1','month':geometry['month'],
       'method':method,'K':K,'N':len(geometry['ids']),'support_IDs':geometry['ids'],'labels':labels,'sizes':sizes,
       'status':'completed' if labels is not None else 'unavailable','attempts':[s.export_attempt(a) for a in attempts],
       'representative':selector,'spectral':ctx['spectral'] if ctx else None,'metrics':scores,'pointwise_SW':point,'profiles':p,
       'partition_present':labels is not None,
       'all_six_metrics_valid':scores is not None and all(m['status']=='ok' for m in scores.values()),
       'eligible_for_comparison':labels is not None and not issues,'issues':issues,
       'provenance':{k:s.digest(geometry[k]) for k in ['X','Y','W_eval','W_fit']},
       'reference_sha256':s.digest(geometry['reference']),'observed_only':True,'scientific_acceptance':False,'model_promoted':False}
    if labels is not None:
        if len(p)!=K or sum(t['n'] for t in p)!=r['N']:raise ValueError('profile_coverage')
        if point is not None and (len(point)!=r['N'] or abs(fsum(point)/r['N']-scores['SW']['value'])>2e-12):raise ValueError('SW_pointwise_scalar')
    return r
