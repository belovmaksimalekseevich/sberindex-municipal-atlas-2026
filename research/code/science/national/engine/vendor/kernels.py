"""Exact binary64 dyadic kernels. No changed distances, radii or tie epsilon.

An integer representation is exact, not a rounded Gram matrix. Intermediate
object arrays contain Python integers, not fixed-width integers. H2 must bound
whole-engine storage separately. Hypot/exp/rho preserve stored legacy rounding.
"""
from fractions import Fraction as F
from math import fsum, hypot, exp, sqrt, isfinite
from statistics import median
import hashlib
import numpy as np

class DomainError(ValueError): pass

def array(rows):
    x=np.asarray(rows,dtype=np.float64)
    if x.ndim!=2 or not x.shape[0] or not x.shape[1] or not np.all(np.isfinite(x)):
        raise DomainError('empty_ragged_or_nonfinite_coordinates')
    return x

def canonical(labels):
    result=[];mapping={}
    for z in labels:
        if isinstance(z,(bool,np.bool_)) or not isinstance(z,(int,np.integer)) or int(z)<0:
            raise DomainError('invalid_label')
        z=int(z)
        if z not in mapping:mapping[z]=len(mapping)
        result.append(mapping[z])
    return tuple(result)

class Dyadic:
    """x_i,j = a_i,j / 2**exponent exactly for stored finite floats."""
    def __init__(self,rows):
        self.x=array(rows);ratios=[[float(v).as_integer_ratio() for v in row] for row in self.x]
        self.exponent=max(q.bit_length()-1 for row in ratios for _,q in row)
        self.den=1<<self.exponent;self.den2=self.den*self.den
        self.rows=[[p<<(self.exponent-(q.bit_length()-1)) for p,q in row] for row in ratios]
        self.a=np.asarray(self.rows,dtype=object)
        self.norms=[sum(v*v for v in row) for row in self.rows]
    def squared(self,i,j):return sum((v-w)**2 for v,w in zip(self.rows[i],self.rows[j]))
    def squared_block(self,start,stop):
        dots=self.a[start:stop]@self.a.T
        return np.asarray(self.norms[start:stop],dtype=object)[:,None]+np.asarray(self.norms,dtype=object)[None,:]-2*dots
    def fraction(self,integer):return F(int(integer),self.den2)
    def groups(self,labels):
        canonical(labels)  # Validate while retaining the original center/label IDs.
        labels=tuple(int(v) for v in labels)
        if len(labels)!=len(self.rows):raise DomainError('label_count_mismatch')
        return {g:[i for i,z in enumerate(labels) if z==g] for g in sorted(set(labels))}
    def sums(self,indices):return [sum(self.rows[i][j] for i in indices) for j in range(self.x.shape[1])]
    def sse(self,labels=None):
        groups=self.groups([0]*len(self.rows) if labels is None else labels)
        return sum((F(sum(self.norms[i] for i in ids),self.den2)-
                    F(sum(v*v for v in self.sums(ids)),len(ids)*self.den2)
                    for ids in groups.values()),F(0))

def exact_sse(rows,labels=None,expected_k=None):
    d=Dyadic(rows)
    if labels is not None and expected_k is not None and len(set(canonical(labels)))!=expected_k:
        raise DomainError('empty_or_wrong_K')
    return d.sse(labels)

def pair_distances(X):
    x=array(X).tolist();n=len(x);D=np.zeros((n,n))
    for i in range(n):
        for j in range(i+1,n):
            d=hypot(*(v-w for v,w in zip(x[i],x[j])))
            if not isfinite(d):raise DomainError('nonfinite_distance')
            D[i,j]=D[j,i]=d
    return D

H=np.zeros((4,5))
for k in range(1,5):H[k-1,:k]=1/sqrt(k*(k+1));H[k-1,k]=-k/sqrt(k*(k+1))

def blocks(z):
    z=array(z)
    if z.shape[1]!=6:raise DomainError('latent_shape_nonfinite')
    L=z[:,0];m=np.asarray([fsum(row[1:])/5 for row in z]);h=m-L;clr=z[:,1:]-m[:,None]
    R=clr@H.T/sqrt(5)
    with np.errstate(under='ignore'):
        p=np.exp(z[:,1:]-np.max(z[:,1:],axis=1)[:,None]);p/=np.sum(p,axis=1)[:,None]
    Hel=None if np.any(p<=0) or not np.all(np.isfinite(p)) else np.sqrt(p)/sqrt(2)
    if not np.all(np.isfinite(R)) or not np.all(np.isfinite(h)):raise DomainError('primary_coordinate_nonfinite')
    return dict(L=L[:,None],h=h[:,None],R=R,Hel=Hel,clr=clr)

def fit_reference(z,mask):
    z=np.asarray(z,dtype=float);mask=np.asarray(mask)
    if z.ndim!=3 or z.shape[0]!=24 or z.shape[2]!=6 or mask.shape!=z.shape[:2] or mask.dtype!=bool:
        raise DomainError('reference_calendar_mask')
    monthly=[]
    for t in range(24):
        if sum(mask[t])<2:raise DomainError('reference_pair_domain')
        b=blocks(z[t,mask[t]])
        monthly.append({k:float(median(pair_distances(b[k])[np.triu_indices(sum(mask[t]),1)])) if b[k] is not None else None
                        for k in ['L','h','R','Hel']})
    scales={k:float(median(row[k] for row in monthly)) if all(row[k] is not None for row in monthly) else None for k in monthly[0]}
    if any(not isfinite(scales[k]) or scales[k]<=0 for k in ['L','h','R']):raise DomainError('primary_zero_scale')
    return dict(scales=scales,monthly_pair_medians=monthly,case_masks_sha256=hashlib.sha256(mask.tobytes()).hexdigest())

def embed(z,ref,geometry='LHCLR',alpha=.5,beta=.5):
    b=blocks(z);s=ref['scales'];key='Hel' if geometry=='LHHellinger' else 'R'
    if geometry not in ['LHCLR','LHHellinger'] or not 0<alpha<1 or not 0<beta<1:raise DomainError('geometry_parameters')
    if s[key] is None or s[key]<=0 or b[key] is None:raise DomainError('alternative_numeric_or_zero_scale')
    return np.concatenate([sqrt(alpha)*b['L']/s['L'],sqrt((1-alpha)*beta)*b['h']/s['h'],
                           sqrt((1-alpha)*(1-beta))*b[key]/s[key]],axis=1)

def symmetric_coordinates(z,ref):
    b=blocks(z);s=ref['scales']
    return np.c_[sqrt(.5)*b['L']/s['L'],.5*b['h']/s['h'],.5*b['clr']/(sqrt(5)*s['R'])]

def graph(X,kind='radius',radius=1.5,k=15,sigma=1,block_rows=64):
    if sigma<=0 or not isfinite(sigma):raise DomainError('invalid_sigma')
    d=Dyadic(X);n=len(d.rows)
    if kind in ['union','mutual'] and not 1<=k<n:raise DomainError('knn_k_unavailable')
    if kind=='radius' and (radius<=0 or not isfinite(radius)):raise DomainError('invalid_radius')
    if kind not in ['radius','complete','union','mutual']:raise DomainError('unknown_support')
    if block_rows<1:raise DomainError('invalid_block_rows')
    support=np.zeros((n,n),dtype=bool)
    if kind=='complete':support=~np.eye(n,dtype=bool)
    elif kind=='radius':
        p,q=float(radius).as_integer_ratio();right=p*p*d.den2;left=q*q
        for start in range(0,n,block_rows):
            stop=min(n,start+block_rows);sq=d.squared_block(start,stop)
            for ii,i in enumerate(range(start,stop)):
                support[i]=[i!=j and int(v)*left<=right for j,v in enumerate(sq[ii])]
    else:
        near=np.zeros((n,n),dtype=bool)
        for start in range(0,n,block_rows):
            stop=min(n,start+block_rows);sq=d.squared_block(start,stop)
            for ii,i in enumerate(range(start,stop)):
                cut=sorted(int(sq[ii,j]) for j in range(n) if i!=j)[k-1]
                near[i]=[i!=j and int(v)<=cut for j,v in enumerate(sq[ii])]
        support=near|near.T if kind=='union' else near&near.T
    np.fill_diagonal(support,False);W=np.zeros((n,n))
    for start in range(0,n,block_rows):
        stop=min(n,start+block_rows);sq=d.squared_block(start,stop)
        for ii,i in enumerate(range(start,stop)):
            for j in range(i+1,n):
                if not support[i,j]:continue
                v=int(sq[ii,j])
                try:d2=float(d.fraction(v));w=exp(-d2/(2*sigma*sigma))
                except (OverflowError,ZeroDivisionError) as e:raise DomainError('graph_numeric_overflow_or_scale_underflow') from e
                if not isfinite(d2) or (v>0 and d2==0) or w==0 or not isfinite(w):raise DomainError('graph_numeric_underflow_or_nonfinite')
                W[i,j]=W[j,i]=w
    Fidx=np.flatnonzero(support.sum(axis=1)>0).tolist()
    return dict(W=W,support=support,F=Fidx,isolates=[i for i in range(n) if i not in Fidx],
                edge_mass=fsum(float(W[i,j]) for i in range(n) for j in range(i+1,n)),strengths=[fsum(row) for row in W])

def weighted_cells(W,labels):
    W=array(W);n=len(W)
    if W.shape!=(n,n) or not np.array_equal(W,W.T) or np.any(np.diag(W)) or np.any(W<0):raise DomainError('invalid_W')
    d=Dyadic(W);groups=d.groups(labels)
    cells={(g,h):F(sum(d.rows[i][j] for i in a for j in b),d.den) for g,a in groups.items() for h,b in groups.items()}
    return d,groups,cells

def H_exact(W,labels,gamma):
    d,groups,cells=weighted_cells(W,labels)
    return sum((cells[g,g]/2-F(float(gamma))*len(ids)*(len(ids)-1)/2 for g,ids in groups.items()),F(0))

def cpm_scale(W,gamma):
    d=Dyadic(W);n=len(W)
    return max(F(1),F(sum(d.rows[i][j] for i in range(n) for j in range(i+1,n)),d.den)+F(float(gamma))*n*(n-1)/2)

def ncut_exact(W,labels):
    _,groups,cells=weighted_cells(W,labels);out=F(0)
    for g in groups:
        volume=sum(cells[g,h] for h in groups)
        if volume<=0:raise DomainError('ncut_zero_volume')
        out+=sum(cells[g,h] for h in groups if h!=g)/volume
    return out

def J_exact(Ws,ids,labels,gamma,kappa):
    if len(Ws)!=len(ids) or len(ids)<2:raise DomainError('joint_calendar')
    by={(t,pid):labels[i] for i,(t,pid) in enumerate((t,pid) for t,row in enumerate(ids) for pid in row)}
    intra=sum(H_exact(W,[by[t,pid] for pid in row],gamma)/len(row) for t,(W,row) in enumerate(zip(Ws,ids)))/len(ids)
    persistence=F(0)
    for t in range(len(ids)-1):
        U=set(ids[t])&set(ids[t+1])
        if not U:raise DomainError('joint_empty_boundary')
        persistence+=F(sum(by[t,pid]==by[t+1,pid] for pid in U),len(U))
    return intra+F(float(kappa))*F(float(gamma))*persistence/(len(ids)-1)

def joint_scale(Ws,gamma,kappa):
    values=[];g=F(float(gamma))
    for W in Ws:
        d=Dyadic(W);n=len(W)
        values.append(sum(abs(F(d.rows[i][j],d.den)-g) for i in range(n) for j in range(i+1,n))/n)
    return max(F(1),sum(values)/len(Ws)+F(float(kappa))*g)

def stable_float_sse(rows,labels):
    x=array(rows).tolist();z=canonical(labels);origin=x[0]
    def finite(v):
        if not isfinite(v):raise DomainError('float_overflow')
        return v
    try:
        y=[[finite(v-origin[j]) for j,v in enumerate(row)] for row in x];terms=[]
        for g in set(z):
            group=[r for r,label in zip(y,z) if label==g]
            center=[finite(fsum(r[j] for r in group)/len(group)) for j in range(len(y[0]))]
            for row in group:
                for j,v in enumerate(row):
                    diff=finite(v-center[j]);terms.append(finite(diff*diff))
        return finite(fsum(terms))
    except OverflowError as exc:raise DomainError('float_overflow') from exc

def lloyd(rows,K,seed,max_iterations=300,initial_indices=None):
    d=Dyadic(rows);n=len(d.rows);D=d.x.shape[1]
    if not 1<K<n:raise DomainError('K_domain')
    if len(set(map(tuple,d.rows)))<K:return dict(status='D2_exhausted')
    M=max(F(1),d.sse());rng=np.random.Generator(np.random.PCG64(int(seed)))
    indices=[int(rng.integers(n))] if initial_indices is None else list(initial_indices)
    while len(indices)<K:
        distances=[min(d.squared(i,j) for j in indices) for i in range(n)];total=sum(distances)
        if not total:return dict(status='D2_exhausted')
        u,v=float(rng.random()).as_integer_ratio();target=u*total;acc=0
        for i,w in enumerate(distances):
            acc+=w
            if acc*v>target:indices.append(i);break
    centers=[(d.rows[i],1) for i in indices];last=None;prev=None;trace=[]
    def as_fractions(cs):return tuple(tuple(F(v,nc*d.den) for v in vec) for vec,nc in cs)
    for it in range(1,max_iterations+1):
        before=as_fractions(centers);labels=[]
        for row in d.rows:
            best=None
            for g,(s,ng) in enumerate(centers):
                num=sum((ng*x-v)**2 for x,v in zip(row,s));den=ng*ng
                if best is None or num*best[1]<best[0]*den:best=(num,den,g)
            labels.append(best[2])
        labels=tuple(labels)
        if len(set(labels))!=K:return dict(status='empty_cluster',initial_indices=indices,iteration=it)
        groups=d.groups(labels);centers=[(d.sums(groups[g]),len(groups[g])) for g in range(K)]
        obj=d.sse(labels)
        if prev is not None and obj-prev>M/F(10**10):return dict(status='monotonicity_failure')
        trace.append(dict(iteration=it,objective=float(obj),small_increase=prev is not None and obj>prev,
                          membership=labels,centers_before=before,centers_after=as_fractions(centers),
                          objective_exact=obj,delta_exact=obj-prev if prev is not None else None))
        if labels==last:
            value=stable_float_sse(rows,labels);res=abs(F(value)-obj)
            if res>M/F(10**12):raise DomainError('SSE_backend_conformance')
            return dict(status='converged',labels=canonical(labels),objective=obj,SST=d.sse(),M=M,
                        backend_sse=value,residual=float(res),trace=trace,initial_indices=indices)
        last,prev=labels,obj
    return dict(status='capped_underresolved',labels=canonical(labels),objective=obj,trace=trace,initial_indices=indices)
