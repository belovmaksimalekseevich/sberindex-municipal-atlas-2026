"""One bounded externally supervised month chunk; fresh outputs, no native retry."""
import os
for key in ['OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','NUMEXPR_NUM_THREADS','VECLIB_MAXIMUM_THREADS','BLIS_NUM_THREADS']:os.environ[key]='1'
import argparse,importlib.util,sys,time,platform,traceback
from pathlib import Path
from util import *
import adapter

def load_science(root):
    engine=root/'engine';sys.path.insert(0,str(engine/'vendor'));sys.path.insert(0,str(engine))
    spec=importlib.util.spec_from_file_location('detailed_original_science',engine/'science.py');s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
    return s

def verify_package(manifest,catalog):
    m=read(manifest);root=manifest.parent
    for name,row in m['files'].items():
        p=(root/name).resolve()
        if not p.is_relative_to(root) or sha(p)!=row['sha256'] or p.stat().st_size!=row['bytes']:raise ValueError('package_member_changed:'+name)
    if sha(catalog)!=m['files']['task_catalog.json']['sha256']:raise ValueError('catalog_changed')
    return root,m,read(root/'PLAN.json')

def geometry(root,task,s):
    import numpy as np
    with np.load(root/'data/input2190.npz',allow_pickle=False) as a,np.load(root/'data/reported2190.npz',allow_pickle=False) as b:
        t=task['month_index'];mask=a['mask'][t]
        if str(a['months'][t])!=task['month'] or not np.array_equal(mask,b['mask'][t]) or not np.array_equal(a['ids'],b['ids']):raise ValueError('raw_reported_alignment')
        ids=a['ids'][mask].tolist();z=a['z'][t,mask].copy();rub=b['values'][t,mask].copy()
    if len(ids)!=task['N'] or ids!=sorted(set(ids)) or s.digest(ids)!=task['ordered_IDs_sha256']:raise ValueError('registered_support_changed')
    if not np.isfinite(z).all() or not np.isfinite(rub).all() or np.any(rub<=0):raise ValueError('observed_RUB_domain')
    ref=read(root/'data/reference.json');X=s.kn.embed(z,ref);Y=s.kn.symmetric_coordinates(z,ref)
    return {'month':task['month'],'ids':ids,'z':z,'rub':rub,'reference':ref,'X':X,'Y':Y}

def prepare_geometry(g,s,cache_from,manifest):
    import numpy as np
    from scipy.cluster.hierarchy import linkage
    if cache_from:
        previous=Path(cache_from).resolve();commit=read(previous/'COMMIT.json')
        if commit['package_manifest_sha256']!=sha(manifest) or commit['month']!=g['month'] or commit['task_id']!='DT24-PILOT' or commit['call_audit']['unknown']:raise ValueError('pilot_cache_binding')
        for name in ['monthly_cache.npz','spectral_factor.npz']:
            if sha(previous/name)!=commit['files'][name]:raise ValueError('pilot_cache_SHA')
        with np.load(previous/'monthly_cache.npz',allow_pickle=False) as a:
            if a['ids'].tolist()!=g['ids'] or not np.array_equal(a['X'],g['X']) or not np.array_equal(a['Y'],g['Y']):raise ValueError('pilot_cache_geometry_changed')
            g.update({k:a[k].copy() for k in ['W_eval','W_fit','ward_tree','recorded_distances']})
        with np.load(previous/'spectral_factor.npz',allow_pickle=False) as a:
            g['factor']={k:a[k].copy() for k in a.files}
    else:
        g['W_eval']=s.kn.graph(g['X'],kind='radius',radius=1.5,sigma=1)['W']
        graph=s.kn.graph(g['X'],kind='union',k=15,sigma=1)
        if graph['F']!=list(range(len(g['ids']))):raise ValueError('union15_not_full_observed_support')
        g['W_fit']=graph['W'];g['ward_tree']=linkage(g['X'],method='ward',metric='euclidean',optimal_ordering=False)
    return g

def execute(task,root,manifest,catalog,out,cpu,cache_from=None,artificial_geometry=None):
    import numpy as np,psutil
    from scipy.cluster.hierarchy import cut_tree
    s=load_science(root)
    if artificial_geometry is not None and (len(artificial_geometry['ids'])>64 or any(not i.startswith('T') for i in artificial_geometry['ids'])):raise ValueError('local_artificial_scope_only')
    if out.exists():raise ValueError('fresh_output_required_no_retry')
    out.mkdir(parents=True);atomic(out/'owner.json',identity());began=time.monotonic()
    atomic(out/'registration.json',{'task':task,'catalog_sha256':sha(catalog),'package_manifest_sha256':sha(manifest),
          'plan_sha256':sha(root/'PLAN.json'),'cpu':cpu,'scope':'artificial_fixture' if artificial_geometry else 'authorized_compute','automatic_retry':False})
    try:
        start(out,'prepare','registered_month_common_geometry_graphs_Ward_tree')
        g=artificial_geometry or geometry(root,task,s);g=prepare_geometry(g,s,cache_from,manifest)
        if artificial_geometry is None:
            anchor=read(root/'PLAN.json')['common_anchor_hash_checks'].get(g['month'])
            if anchor and any(s.digest(g[key])!=anchor[old] for key,old in [('X','X'),('Y','Y'),('W_eval','W')]):raise ValueError('existing_accepted_common_geometry_mismatch')
        from spectral_support import SpectralEngine,matrix_key
        engine=SpectralEngine()
        if 'factor' in g:
            f=g.pop('factor');engine.eigen[matrix_key(g['W_fit'])]=(f['L'],f['values'],f['U'],int(f['components']))
        D,restore=adapter.install_readonly_cache(s,g['X'],g['W_eval'],g['W_fit'],g.get('recorded_distances'))
        with (out/'monthly_cache.npz').open('xb') as f:
            np.savez_compressed(f,ids=np.asarray(g['ids']),X=g['X'],Y=g['Y'],W_eval=g['W_eval'],W_fit=g['W_fit'],ward_tree=g['ward_tree'],recorded_distances=D)
        atomic(out/'preparation.json',{'N':len(g['ids']),'month':g['month'],'cache_from':str(cache_from) if cache_from else None,
              'matrix_SHA256':{k:s.digest(g[k]) for k in ['X','Y','W_eval','W_fit']},'distance_SHA256':s.digest(D),
              'reference_sha256':s.digest(g['reference']),'formulas_changed':False})
        end(out,'prepare',out/'preparation.json');rows=[];cell_timings=[]
        for K in task['K']:
            for method in ['SSE','Ward','NCut']:
                cell=f'{method}_K{K}';cell_started=time.monotonic();attempts=[];ctx=None;labels=None
                if method=='Ward':
                    start(out,cell+'_cut','accepted_deterministic_Ward_cut')
                    labels=list(s.kn.canonical(cut_tree(g['ward_tree'],n_clusters=[K]).ravel()))
                    path=out/'cells'/cell/'ward_cut.json';atomic(path,{'labels':labels,'restarts':1,'seeds_applicable':False});end(out,cell+'_cut',path)
                else:
                    start(out,cell+'_prepare','same_W_spectral_K_admission_or_SSE_scale')
                    ctx=adapter.context(s,g,method,K,task['primary_seeds'],engine)
                    if method=='NCut' and ctx['fit'] is not None:
                        dest=out/'cells'/cell/'fitting_embedding.npz';dest.parent.mkdir(parents=True,exist_ok=True)
                        with dest.open('xb') as f:np.savez_compressed(f,fit=ctx['fit'])
                    path=out/'cells'/cell/'preparation.json';atomic(path,{'preflight':ctx['preflight'],'spectral':ctx['spectral'],'scale':encode(ctx['scale'])});end(out,cell+'_prepare',path)
                    for i,seed in enumerate(task['primary_seeds'],1):
                        key=cell+f'_seed{i:02}';start(out,key,'original_exact_Lloyd_or_explicit_preflight',{'seed_index':i,'seed':seed})
                        original=s.kn.lloyd;native={'entered':False,'return':None,'exception':None}
                        def record(*a,**kw):
                            native['entered']=True
                            try:native['return']=original(*a,**kw);return native['return']
                            except BaseException as e:native['exception']={'type':type(e).__name__,'message':str(e)};raise
                        s.kn.lloyd=record
                        try:attempt=s.fit_seed(ctx,i,seed)
                        finally:s.kn.lloyd=original
                        attempts.append(attempt);path=out/'cells'/cell/'attempts'/f'{i:02}.json';atomic(path,encode(attempt))
                        atomic(out/'cells'/cell/'native_returns'/f'{i:02}.json',encode(native));end(out,key,path)
                start(out,cell+'_evaluate','unchanged_six_common_ICVI_RUB_profiles')
                r=adapter.result(s,g,method,K,attempts,ctx,labels);r['package_manifest_sha256']=sha(manifest)
                path=out/'cells'/cell/'result.json';atomic(path,r);end(out,cell+'_evaluate',path)
                rows.append({'method':method,'K':K,'status':r['status'],'eligible':r['eligible_for_comparison'],'result_sha256':sha(path)})
                cell_timings.append({'method':method,'K':K,'seconds':time.monotonic()-cell_started})
                print(json.dumps({'task_id':task['task_id'],'cell':cell,'status':r['status'],'seconds':cell_timings[-1]['seconds']}),flush=True)
        if engine.eigen:
            L,values,U,components=next(iter(engine.eigen.values()))
            with (out/'spectral_factor.npz').open('xb') as f:np.savez_compressed(f,L=L,values=values,U=U,components=np.asarray(components))
        restore();audit=call_audit(out);expected_pairs=1+22*len(task['K'])
        if audit['unknown'] or audit['starts']!=expected_pairs or audit['ends']!=expected_pairs:raise ValueError('unclosed_month_calls')
        summary={'task_id':task['task_id'],'month':task['month'],'status':'completed','cells':rows,'expected_cells':3*len(task['K']),
                 'native_start_slots':16*len(task['K']),'Ward_cuts':len(task['K']),'actual_eigensolves':engine.counts['actual_eigensolves'],
                 'timing':{'total_seconds':time.monotonic()-began,'cells':cell_timings},'scientifically_eligible':all(r['eligible'] for r in rows),
                 'scientific_acceptance':False,'model_promoted':False}
        atomic(out/'result.json',summary)
        atomic(out/'COMMIT.json',{'task_id':task['task_id'],'month':task['month'],'status':'completed','package_manifest_sha256':sha(manifest),
              'catalog_sha256':sha(catalog),'plan_sha256':sha(root/'PLAN.json'),'owner':identity(),'call_audit':audit,'expected_call_pairs':expected_pairs,
              'attempt_count':16*len(task['K']),'result_sha256':sha(out/'result.json'),'files':{p.relative_to(out).as_posix():sha(p) for p in sorted(out.rglob('*')) if p.is_file()},
              'scientific_acceptance':False,'automatic_retry':False})
        return summary
    except BaseException as e:
        atomic(out/'HELD.json',{'error':repr(e),'traceback':traceback.format_exc(),'owner':identity(),'call_audit':call_audit(out),'automatic_retry':False});raise

def main():
    p=argparse.ArgumentParser()
    for n in ['task-id','manifest','catalog','out']:p.add_argument('--'+n,required=True)
    p.add_argument('--cpu',type=int,required=True);p.add_argument('--cache-from');a=p.parse_args()
    if platform.system()!='Linux':raise ValueError('national_worker_Linux_only')
    import psutil
    allowed=psutil.Process().cpu_affinity()
    if a.cpu not in allowed:raise ValueError('unavailable_CPU_lease')
    psutil.Process().cpu_affinity([a.cpu])
    manifest=Path(a.manifest).resolve();catalog=Path(a.catalog).resolve();out=Path(a.out).resolve()
    root,m,plan=verify_package(manifest,catalog)
    import importlib.metadata
    from threadpoolctl import threadpool_limits,threadpool_info
    for name,version in plan['dependencies'].items():
        if importlib.metadata.version(name)!=version:raise ValueError('registered_runtime_version:'+name)
    controller=threadpool_limits(limits=1)
    if any(x['num_threads']!=1 for x in threadpool_info()):raise ValueError('threads1_required')
    if out.is_relative_to(root):raise ValueError('output_outside_readonly_package_required')
    tasks=read(catalog);task=next(t for t in tasks if t['task_id']==a.task_id)
    if task['task_id']=='DT24-M0001' and not a.cache_from:raise ValueError('January_remaining_requires_closed_pilot_cache')
    execute(task,root,manifest,catalog,out,a.cpu,a.cache_from)

if __name__=='__main__':main()
