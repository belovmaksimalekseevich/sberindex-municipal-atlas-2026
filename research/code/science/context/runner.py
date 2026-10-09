"""Bounded retrospective context/spending runner. Real execution: root VM only."""
from pathlib import Path
import os
for name in ['OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','NUMEXPR_NUM_THREADS','BLIS_NUM_THREADS','VECLIB_MAXIMUM_THREADS']:
 os.environ[name]='1'
import argparse,hashlib,importlib.metadata,json,signal,subprocess,sys,time,traceback
sys.dont_write_bytecode=True
BASE=Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def put(p,v):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_name(p.name+'.tmp')
 tmp.write_text(json.dumps(v,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf8');os.replace(tmp,p)
def check_package():
 for rel,r in read(BASE/'PACKAGE_MANIFEST.json').items():
  if sha(BASE/rel)!=r['sha256']:raise ValueError('package_SHA_mismatch:'+rel)
def environment():
 p=read(BASE/'PLAN.json');actual={k:importlib.metadata.version(k) for k in p['dependencies']}
 if actual!=p['dependencies']:raise ValueError('dependency_version_mismatch:'+repr(actual))
 return {'versions':actual,'python':sys.version,'executable':sys.executable}
def input_admission():
 import numpy as np
 schema=read(BASE/'input/schema.json')
 if sha(BASE/'input/context2024.npz')!=read(BASE/'PLAN.json')['input_sha256']:raise ValueError('input_SHA_mismatch')
 with np.load(BASE/'input/context2024.npz',allow_pickle=False) as z:
  if set(z.files)!=set(schema['npz_array_shapes']):raise ValueError('input_fields_mismatch')
  for name,shape in schema['npz_array_shapes'].items():
   a=z[name]
   if list(a.shape)!=shape or a.dtype.kind=='O':raise ValueError('input_shape_or_pickle_domain:'+name)
   if a.dtype.kind in 'fiu' and not np.isfinite(a).all():raise ValueError('input_nonfinite:'+name)
  ids=z['IDs'].tolist()
  if len(ids)!=schema['N'] or ids!=sorted(set(ids)):raise ValueError('input_ID_domain')
  if hashlib.sha256(('\n'.join(ids)+'\n').encode()).hexdigest()!=schema['ID_sha256_newline_utf8']:raise ValueError('input_ID_SHA')
  if len(set(z['regions'].tolist()))!=schema['regions']:raise ValueError('input_region_count')
 return {'N':schema['N'],'regions':schema['regions'],'universe':schema['universe'],'reference_year':2024,'retrospective':True,'no_clustering':True,'preprocessing_refit_here':False}
def save_prepared(out,variant,prepared):
 import numpy as np
 from scipy.cluster.hierarchy import linkage
 p=Path(out)/'prepared'/variant;p.mkdir(parents=True,exist_ok=False)
 np.savez_compressed(p/'geometry.npz',X=prepared['X'],raw_values=prepared['raw_values'],monthly_consumption_RUB=prepared['monthly_consumption_RUB'],IDs=np.asarray(prepared['ids']),global_indices=prepared['global_indices'])
 np.save(p/'ward_hierarchy.npy',linkage(prepared['X'],method='ward',metric='euclidean',optimal_ordering=False),allow_pickle=False)
 put(p/'metadata.json',prepared['metadata']);put(p/'reference.json',prepared['reference'])
 put(p/'binding.json',{k:prepared[k] for k in ['reference_sha256','X_sha256','variant','scope','source_N','source_schema','months','categories']})
 put(p/'MANIFEST.json',{name:{'sha256':sha(p/name)} for name in ['geometry.npz','ward_hierarchy.npy','metadata.json','reference.json','binding.json']})
def load_prepared(out,variant):
 import numpy as np,model
 p=Path(out)/'prepared'/variant
 for name,r in read(p/'MANIFEST.json').items():
  if sha(p/name)!=r['sha256']:raise ValueError('prepared_SHA_mismatch:'+name)
 with np.load(p/'geometry.npz',allow_pickle=False) as z:
  result={'X':z['X'].copy(),'raw_values':z['raw_values'].copy(),'monthly_consumption_RUB':z['monthly_consumption_RUB'].copy(),'ids':z['IDs'].tolist(),'global_indices':z['global_indices'].copy()}
 result.update(read(p/'binding.json'));result.update(metadata=read(p/'metadata.json'),reference=read(p/'reference.json'),raw_names=model.RAW_NAMES,raw_units=model.RAW_UNITS)
 if model.array_sha(result['X'])!=result['X_sha256'] or model.digest(result['reference'])!=result['reference_sha256']:raise ValueError('reference_binding_changed')
 return result,np.load(p/'ward_hierarchy.npy',allow_pickle=False)
def worker(task,out,cpu):
 import psutil,model
 if cpu>=0:psutil.Process().cpu_affinity([cpu])
 environment();dest=Path(out)/task['id'];dest.mkdir(parents=True,exist_ok=True);start=time.monotonic()
 try:
  p,tree=load_prepared(out,task['variant'])
  result=model.fit_partition(p,task['family'],task['K'],ward_hierarchy=tree if task['family']=='Ward' else None,attempt_callback=lambda a:put(dest/'attempts.json',a))
  result.pop('hierarchy',None);result.update(task=task,seconds=time.monotonic()-start,plan_sha256=sha(BASE/'PLAN.json'))
  put(dest/'result.json',result);return 0 if result['status']=='completed' else 2
 except Exception as e:
  put(dest/'result.json',{'task':task,'status':'error','error':repr(e),'traceback':traceback.format_exc(),'scientific_acceptance':False});return 1
def finalize(out,tasks):
 import model
 out=Path(out);results=[]
 for t in tasks:
  p=out/t['id']/'result.json';results.append(read(p) if p.exists() else {'task':t,'status':'missing'})
 crossed=[];space_comparisons=[]
 for variant in ['context6','spending2']:
  for family in ['Ward','KMeans']:
   good=sorted([r for r in results if r['status']=='completed' and r['variant']==variant and r['family']==family],key=lambda r:r['K'])
   for a,b in zip(good,good[1:]):crossed.append({'variant':variant,'family':family,**model.crosswalk(a,b,strict_nested=family=='Ward')})
 for family in ['Ward','KMeans']:
  for K in model.K_GRID:
   a=next((r for r in results if r['status']=='completed' and (r['variant'],r['family'],r['K'])==('spending2',family,K)),None)
   b=next((r for r in results if r['status']=='completed' and (r['variant'],r['family'],r['K'])==('context6',family,K)),None)
   if a and b:space_comparisons.append({**model.crosswalk(a,b),'family':family,'K':K,'relation':'same_ID_partition_overlap_across_different_geometries_no_SW_ranking'})
 put(out/'crosswalks.json',crossed);put(out/'context_vs_spending_overlap.json',space_comparisons)
 inventory=[]
 for r in results:
  if r['status']=='completed':inventory.append({'task_id':r['task']['id'],'variant':r['variant'],'family':r['family'],'K':r['K'],'N':r['N'],'sizes':r['sizes'],'metrics':r['metrics'],'negative_SW_fraction':sum(v<0 for v in r['pointwise_SW'])/r['N'],'singleton_clusters':sum(s==1 for s in r['sizes']),'clusters_below_10_IDs':sum(s<10 for s in r['sizes']),'X_sha256':r['X_sha256'],'reference_sha256':r['reference_sha256']})
 summary={'status':'completed_all_partitions' if all(r['status']=='completed' for r in results) else 'incomplete','tasks_expected':len(tasks),'tasks_completed':sum(r['status']=='completed' for r in results),
 'outcomes':{r['task']['id']:r['status'] for r in results},'inventory':inventory,'selected_model':None,'selection_policy':'requires separate robustness and substantive profile review; no automatic maximum SW/K choice',
 'context_used_in_fit_is_independent_validation':False,'SW_across_geometries_is_quality_rank':False,'subsample_robustness':'separate_track_not_assessed_here','retrospective':True,'national_full':False,'scientific_acceptance':False,'frontend_changed':False,'plan_sha256':sha(BASE/'PLAN.json')}
 put(out/'summary.json',summary);return summary
def run(out,expected,cpus,indices_path):
 import psutil,model
 if os.name!='posix':raise ValueError('real_clustering_runs_on_root_Linux_VM_only')
 start=time.monotonic();budget=read(BASE/'PLAN.json')['budget'];check_package();env=environment();admission=input_admission()
 if expected!=sha(BASE/'PLAN.json'):raise ValueError('frozen_plan_not_authorized')
 if not 1<=len(cpus)<=2 or len(set(cpus))!=len(cpus) or not set(cpus)<=set(budget['root_reserved_cpus']) or not set(cpus)<=set(psutil.Process().cpu_affinity()):raise ValueError('CPU_reservation_unavailable')
 psutil.Process().cpu_affinity(cpus);out=Path(out);out.mkdir(parents=True,exist_ok=False)
 def hard(signum,frame):raise TimeoutError('hard_wall_deadline')
 signal.signal(signal.SIGALRM,hard);signal.alarm(max(1,int(budget['wall_seconds']-(time.monotonic()-start))))
 tasks=read(BASE/'TASKS.json');put(out/'RUN.json',{'plan_sha256':expected,'environment':env,'admission':admission,'budget':budget,'cpus':cpus,'parent_pid':os.getpid(),'indices_path':indices_path,'started_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
 indices=None if indices_path is None else read(indices_path)
 raw=model.load_raw(BASE/'input/context2024.npz',BASE/'input/core_ID_context.csv');schema=read(BASE/'input/schema.json')
 for variant in ['context6','spending2']:
  prepared=model.prepare_for_indices(raw,schema,indices=indices,variant=variant);save_prepared(out,variant,prepared)
 pending=list(tasks);active={};journal=[];stop=None;peak=0
 try:
  while pending or active:
   parent=psutil.Process();rss=parent.memory_info().rss
   for p in parent.children(recursive=True):
    try:rss+=p.memory_info().rss
    except psutil.NoSuchProcess:pass
   peak=max(peak,rss)
   if rss>=budget['aggregate_RSS_bytes']:stop='aggregate_RSS_cap'
   if time.monotonic()-start>=budget['compute_seconds']:stop=stop or 'compute_deadline'
   for cpu,(p,t,began,log) in list(active.items()):
    code=p.poll();reason=None
    if code is None and (stop or time.monotonic()-began>=budget['task_seconds']):reason=stop or 'task_timeout';p.kill();p.wait(timeout=5);code=p.returncode
    if code is not None:
     log.close();dest=out/t['id']
     if reason:
      if (dest/'result.json').exists():os.replace(dest/'result.json',dest/'result_before_stop.json')
      put(dest/'result.json',{'task':t,'status':reason,'scientific_acceptance':False})
     elif not (dest/'result.json').exists():put(dest/'result.json',{'task':t,'status':'worker_exit_without_result','exit_code':code})
     journal.append({'event':'finish','task':t['id'],'pid':p.pid,'cpu':cpu,'seconds':time.monotonic()-began,'exit_code':code,'reason':reason});put(out/'journal.json',journal);del active[cpu]
   if stop:
    for t in pending:put(out/t['id']/'result.json',{'task':t,'status':'not_started_'+stop})
    pending=[]
   else:
    for cpu in cpus:
     if cpu not in active and pending:
      t=pending.pop(0);dest=out/t['id'];dest.mkdir();log=(dest/'worker.log').open('w',encoding='utf8')
      p=subprocess.Popen([sys.executable,str(BASE/'runner.py'),'worker','--out',str(out),'--task',t['id'],'--cpu',str(cpu)],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
      active[cpu]=(p,t,time.monotonic(),log);journal.append({'event':'start','task':t['id'],'pid':p.pid,'cpu':cpu});put(out/'journal.json',journal)
   time.sleep(.1)
 finally:
  for p,t,began,log in active.values():
   if p.poll() is None:p.kill();p.wait(timeout=5)
   log.close()
 summary=finalize(out,tasks);put(out/'SUPERVISION.json',{'seconds':time.monotonic()-start,'peak_sampled_RSS_bytes':peak,'RSS_poll_seconds':.1,'stop_reason':stop,'status':summary['status']})
 put(out/'OUTPUT_MANIFEST.json',{p.relative_to(out).as_posix():{'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='OUTPUT_MANIFEST.json'});signal.alarm(0)
 return 0 if summary['status']=='completed_all_partitions' else 2
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['preflight','run','worker','finalize']);p.add_argument('--out');p.add_argument('--task');p.add_argument('--cpu',type=int,default=-1);p.add_argument('--cpus');p.add_argument('--plan-sha');p.add_argument('--indices-json');a=p.parse_args()
 if a.mode=='preflight':check_package();print(json.dumps({'passed':True,'environment':environment(),'input':input_admission(),'plan_sha256':sha(BASE/'PLAN.json'),'real_fits':0}))
 elif a.mode=='run':sys.exit(run(a.out,a.plan_sha,[int(x) for x in a.cpus.split(',')],a.indices_json))
 elif a.mode=='worker':sys.exit(worker(next(t for t in read(BASE/'TASKS.json') if t['id']==a.task),a.out,a.cpu))
 else:print(json.dumps(finalize(a.out,read(BASE/'TASKS.json'))))
