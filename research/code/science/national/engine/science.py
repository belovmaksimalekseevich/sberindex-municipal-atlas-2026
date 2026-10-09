"""Pure scientific adapters. Operational runner/target resource admission are separate.

Uses original exact Lloyd, graph, metric formulas and representative selection.
No reference fitting, seed extension, masking by external Y or automatic retries.
"""
from pathlib import Path
from fractions import Fraction as F
from math import fsum
import hashlib,json,sys
import numpy as np

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'vendor'));sys.path.insert(0,str(HERE))
import kernels as kn
import metrics as icvi
from representative import own_representative
from spectral_support import SpectralEngine,SupportGraph,matrix_key
import cosine

SCHEMA='e28-scientific-result-v1'

def digest(v):
    if isinstance(v,np.ndarray):return hashlib.sha256(v.astype('<f8').tobytes()).hexdigest()
    return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def fraction(f):return {'numerator':str(f.numerator),'denominator':str(f.denominator),'approximate':float(f)}

def export_attempt(a):
    return {k:None if v is None else fraction(v) if isinstance(v,F) else list(v) if isinstance(v,tuple) else v
            for k,v in a.items() if k!='trace'}

def prepare(z,rub,ids,reference,config,engine=None,evaluator=None):
    z=np.asarray(z,dtype=np.float64);rub=np.asarray(rub,dtype=np.float64)
    if list(ids)!=sorted(set(ids)) or z.shape!=(len(ids),6) or rub.shape!=z.shape or not np.isfinite(z).all() or not np.isfinite(rub).all() or np.any(rub<=0):
        raise ValueError('published_input_domain')
    if config['family'] not in ('NCut','SSE') or config['K'] not in (2,3,4):raise ValueError('registered_config_domain')
    if evaluator is None and not all(str(i).startswith('T') for i in ids):raise ValueError('accepted_common_evaluator_required_for_real_IDs')
    if evaluator is not None:
        if evaluator['ids']!=list(ids) or evaluator['reference_sha256']!=digest(reference):raise ValueError('evaluator_ID_or_reference_mismatch')
        X,Y,evaluation_W=(np.asarray(evaluator[k],dtype=np.float64) for k in ['X','Y','W'])
        if X.shape!=(len(ids),6) or Y.shape!=(len(ids),7) or evaluation_W.shape!=(len(ids),len(ids)) or not all(np.isfinite(a).all() for a in [X,Y,evaluation_W]) or np.any(evaluation_W<0) or not np.array_equal(evaluation_W,evaluation_W.T) or np.any(np.diag(evaluation_W)):
            raise ValueError('evaluator_matrix_domain')
    K=config['K'];ctx=dict(config=config,ids=list(ids),reference=reference,preflight=None,scale=F(max(1,K)),
        W=None,fit=None,fit_graph=None,spectral=None)
    if not 1<K<len(ids):ctx['preflight']='preflight_K_domain';return ctx
    try:
        if config.get('axis')=='L-only':fit=kn.blocks(z)['L']/reference['scales']['L']
        else:fit=kn.embed(z,reference,config.get('geometry') if config.get('geometry') in ('LHCLR','LHHellinger') else 'LHCLR',
                          config.get('alpha',.5),config.get('beta',.5))
        if config['family']=='NCut':
            if config.get('edge_rule')=='union15_largest_positive_cosine':g=cosine.graph(rub[:,1:],config['k'])
            else:g=kn.graph(fit,kind='union',k=config['k'],sigma=config.get('sigma',1))
            W=np.asarray(g['W'],dtype=np.float64,order='C')
            graphmeta=dict(rule=g.get('rule','Gaussian union kNN with all exact kth distance ties'),
                W_sha256=digest(W),edges=int(np.count_nonzero(np.triu(W>0,1))),
                density=2*np.count_nonzero(np.triu(W>0,1))/(len(ids)*(len(ids)-1)),
                isolated_IDs=[ids[i] for i in g['isolates']],components=len(SupportGraph(W).connected_components()),
                ordered_IDs_sha256=digest(list(ids)),extra_tied_neighbors=g.get('extra_tied_neighbors'),
                rule_parameters={k:config[k] for k in ('k','sigma','alpha','beta','geometry','edge_rule') if k in config})
            ctx.update(W=W,fit_graph=graphmeta)
            if g['F']!=list(range(len(ids))):ctx['preflight']='preflight_not_full_published_support';return ctx
            spectral=(engine or SpectralEngine()).spectral(W,K)
            ctx['spectral']={k:v for k,v in spectral.items() if k!='embedding'}
            if spectral['status']!='available':ctx['preflight']=spectral['status'];return ctx
            fit=spectral['embedding']
        else:ctx['scale']=max(F(1),kn.exact_sse(fit))
        if len(set(map(tuple,fit)))<K:ctx['preflight']='preflight_D2_exhausted';return ctx
        ctx['fit']=fit
        # The common evaluator never follows an alternative alpha or cosine graph.
        if evaluator is None:
            ctx['X']=kn.embed(z,reference);ctx['Y']=kn.symmetric_coordinates(z,reference)
            ctx['anchor']=kn.graph(ctx['X'],kind='radius',radius=1.5,sigma=1)['W']
            ctx['evaluator_source']='artificial fixture evaluator'
        else:
            ctx['X']=X;ctx['Y']=Y;ctx['anchor']=evaluation_W
            ctx['evaluator_source']=evaluator['source']
        ctx['z']=z;ctx['rub']=rub
    except (kn.DomainError,ValueError,OverflowError,FloatingPointError) as e:
        ctx['preflight']='numeric_or_adapter_unresolved';ctx['error']=str(e)
    return ctx

def fit_seed(ctx,seed_index,seed):
    if not isinstance(seed_index,int) or not 1<=seed_index<=8:raise ValueError('primary_seed_index_domain')
    if ctx['preflight']:
        return dict(seed_index=seed_index,seed=int(seed),status=ctx['preflight'],error=ctx.get('error'),labels=None,objective=None)
    try:
        run=kn.lloyd(ctx['fit'],ctx['config']['K'],int(seed),max_iterations=300)
        if ctx['config']['family']=='NCut' and run['status']=='converged':
            run=dict(run,rounding_SSE=run['objective'],objective=kn.ncut_exact(ctx['W'],run['labels']))
        return dict(seed_index=seed_index,seed=int(seed),status=run['status'],objective=run.get('objective'),labels=run.get('labels'),
                    rounding_SSE=run.get('rounding_SSE'),trace=run.get('trace'),initial_indices=run.get('initial_indices'))
    except (kn.DomainError,ValueError,OverflowError,FloatingPointError) as e:
        return dict(seed_index=seed_index,seed=int(seed),status='numeric_or_adapter_unresolved',error=str(e),labels=None,objective=None)

def finish(ctx,attempts,task,source_bindings,execution_scope):
    expected=list(ctx['config']['primary_seeds'])
    if len(attempts)!=8 or [(a['seed_index'],a['seed']) for a in attempts]!=list(enumerate(expected,1)):
        raise ValueError('exact_first8_attempts_required')
    rep=own_representative(attempts,ctx['scale'],False);chosen=rep['representative']
    issues=[]
    for a in attempts:
        if a['status']!='converged':issues.append(f'seed{a["seed_index"]}:{a["status"]}')
    scores=None;labels=None;profiles=[];points=None;sizes=[]
    if chosen is not None:
        labels=list(chosen['labels']);K=ctx['config']['K']
        if set(labels)!=set(range(K)) or len(labels)!=len(ctx['ids']):raise ValueError('representative_full_assignment_domain')
        scores=icvi.six(ctx['X'],ctx['Y'],ctx['anchor'],labels,ctx['ids'],reference_hash=digest(ctx['reference']))
        points=scores['SW']['diagnostics'].get('pointwise');sizes=[labels.count(g) for g in range(K)]
        if min(sizes)<2:issues.append('min_group_size_below_2')
        for name,s in scores.items():
            if s['status']!='ok':issues.append('metric:'+name+':'+s['status'])
        for g in range(K):
            ix=[i for i,v in enumerate(labels) if v==g];values=ctx['rub'][ix]
            clr=kn.blocks(ctx['z'][ix])['clr'];mean=np.array([fsum(clr[:,j])/len(ix) for j in range(5)])
            center=np.exp(mean-mean.max());center/=center.sum()
            q=np.quantile(values,[.25,.5,.75],axis=0,method='linear')
            order=sorted(ix,key=lambda i:(points[i],ctx['ids'][i])) if points is not None else []
            profiles.append(dict(cluster_id=f'{task["month"]}:G{g}',group_index=g,n=len(ix),
                q25_RUB=q[0].tolist(),median_RUB=q[1].tolist(),q75_RUB=q[2].tolist(),
                selected5_geometric_center=center.tolist(),member_IDs_sha256=digest([ctx['ids'][i] for i in ix]),
                negative_SW_n=sum(points[i]<0 for i in ix) if points is not None else None,
                boundary_IDs=[ctx['ids'][i] for i in order[:2]],functional_name=None,accepted_lineage=False))
    else:issues.append('no_eligible_first8_representative')
    provenance=dict(source_bindings=source_bindings,ordered_IDs_sha256=digest(ctx['ids']),reference_sha256=digest(ctx['reference']),
        primary_coordinate_sha256=digest(ctx['X']) if 'X' in ctx else None,
        symmetric_coordinate_sha256=digest(ctx['Y']) if 'Y' in ctx else None,
        common_anchor_sha256=digest(ctx['anchor']) if 'anchor' in ctx else None,
        fitting_graph_sha256=digest(ctx['W']) if ctx['W'] is not None else None,
        evaluator='fixed original LHCLR alpha=.5 beta=.5 / symmetric7 / radius1.5 sigma1',
        evaluator_source=ctx.get('evaluator_source'),
        reference_refitted=False,fitting_graph_rebuilt=True if ctx['W'] is not None else None,
        selector_changed=False,all8_attempts_recorded=True,automatic_native_retry=False)
    result=dict(schema=SCHEMA,study_id='E28-PAIRED-QUARTER-v1',execution_scope=execution_scope,
        task=task,config=ctx['config'],status='completed' if chosen is not None else 'unavailable',
        N=len(ctx['ids']),K=ctx['config']['K'],support_IDs=ctx['ids'],labels=labels,sizes=sizes,
        full_assignment=labels is not None,attempts=[export_attempt(a) for a in attempts],
        representative_seed_index=chosen['seed_index'] if chosen else None,
        representative_rule='original exact own-objective minimum, scale/1e10 ties then canonical labels and seed index',
        q_star=fraction(rep['q_star']) if rep['q_star'] is not None else None,tau=fraction(rep['tau']),
        representative_tie_seeds=rep['tie_seeds'],metrics=scores,pointwise_SW=points,
        profiles=profiles,fit_graph=ctx['fit_graph'],spectral=ctx['spectral'],
        scientific_admission={'eligible_for_comparison':chosen is not None and not issues,'issues':issues,
                              'economic_names_accepted':False,'national_acceptance':False},provenance=provenance)
    # Scientific result carries summaries; the operational runner must persist complete lossless traces.
    result['trace_storage_required']=True
    return result

def run_fixture(z,rub,ids,reference,config,task,bindings=None,engine=None,evaluator=None):
    if len(ids)>64 or not all(str(i).startswith('T') for i in ids):raise ValueError('local_artificial_fixture_only')
    ctx=prepare(z,rub,ids,reference,config,engine,evaluator)
    attempts=[fit_seed(ctx,i,s) for i,s in enumerate(config['primary_seeds'],1)]
    return finish(ctx,attempts,task,bindings or {},'artificial_fixture'),ctx,attempts
