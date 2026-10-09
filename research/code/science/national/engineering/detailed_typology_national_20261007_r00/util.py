"""Task-owned atomic receipts and accepted lossless value encoding."""
from pathlib import Path
from fractions import Fraction
import hashlib,json,math,os,time,uuid

def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()).hexdigest()
def identity():
    import psutil
    p=psutil.Process();return {'pid':p.pid,'created':p.create_time()}
def encode(v):
    if isinstance(v,Fraction):return {'$fraction':[str(v.numerator),str(v.denominator)]}
    if isinstance(v,tuple):return {'$tuple':[encode(x) for x in v]}
    if isinstance(v,list):return [encode(x) for x in v]
    if isinstance(v,dict):return {str(k):encode(x) for k,x in v.items()}
    if type(v).__module__.startswith('numpy'):
        return {'$array':{'dtype':str(v.dtype),'shape':list(v.shape),'items':encode(v.tolist())}} if getattr(v,'ndim',0)>0 else encode(v.item())
    if isinstance(v,float) and not math.isfinite(v):return {'$float':v.hex()}
    if v is None or isinstance(v,(str,int,float,bool)):return v
    raise ValueError('unsupported_lossless_type:'+str(type(v)))
def decode(v):
    if isinstance(v,list):return [decode(x) for x in v]
    if isinstance(v,dict):
        if set(v)=={'$fraction'}:return Fraction(*map(int,v['$fraction']))
        if set(v)=={'$tuple'}:return tuple(decode(x) for x in v['$tuple'])
        if set(v)=={'$float'}:return float.fromhex(v['$float'])
        if set(v)=={'$array'}:
            import numpy as np
            a=v['$array'];return np.asarray(decode(a['items']),dtype=a['dtype']).reshape(a['shape'])
        return {k:decode(x) for k,x in v.items()}
    return v
def atomic(p,v):
    p=Path(p);p.parent.mkdir(parents=True,exist_ok=True)
    if p.exists():raise ValueError('immutable_task_file_exists:'+str(p))
    t=p.with_name(p.name+'.'+uuid.uuid4().hex+'.tmp')
    with t.open('x',encoding='utf8',newline='\n') as f:json.dump(v,f,ensure_ascii=False,indent=2,allow_nan=False);f.write('\n');f.flush();os.fsync(f.fileno())
    os.replace(t,p)
    if os.name=='posix':
        fd=os.open(str(p.parent),os.O_DIRECTORY)
        try:os.fsync(fd)
        finally:os.close(fd)
def start(out,key,kind,detail=None):atomic(Path(out)/'calls'/f'{key}.start.json',{'key':key,'kind':kind,'detail':detail,'owner':identity(),'time_ns':time.time_ns()})
def end(out,key,path):atomic(Path(out)/'calls'/f'{key}.end.json',{'key':key,'owner':identity(),'time_ns':time.time_ns(),'result_file':Path(path).relative_to(out).as_posix(),'sha256':sha(path)})
def call_audit(out):
    out=Path(out);starts={p.name[:-11]:read(p) for p in (out/'calls').glob('*.start.json')};ends={p.name[:-9]:read(p) for p in (out/'calls').glob('*.end.json')}
    if set(ends)-set(starts):raise ValueError('end_without_start')
    for k in set(starts)&set(ends):
        a,b=starts[k],ends[k];p=(out/b['result_file']).resolve()
        if not p.is_relative_to(out.resolve()) or a['owner']!=b['owner'] or b['time_ns']<a['time_ns'] or sha(p)!=b['sha256']:raise ValueError('call_pair_identity_or_hash')
    return {'starts':len(starts),'ends':len(ends),'unknown':sorted(set(starts)-set(ends))}
