"""Current six metrics; exact dyadic aggregates, original conventions/results."""
from fractions import Fraction as F
from math import fsum,hypot,sqrt
import itertools
import numpy as np
import kernels as kn
import c5c3_metrics as ref

NAMES=ref.NAMES;DIRECTIONS=ref.DIRECTIONS;FORMULAS=ref.FORMULAS
result=ref.result;compare=ref.compare

def silhouette(X,labels):
    n=len(labels);groups=sorted(set(labels));D=kn.pair_distances(X);point=[];alternatives=[]
    if len(groups)<2:return result('SW',status='undefined',reason='one_group')
    members={g:[i for i,z in enumerate(labels) if z==g] for g in groups}
    for i,g in enumerate(labels):
        own=[j for j in members[g] if j!=i]
        bs={h:fsum(float(D[i,j]) for j in members[h])/len(members[h]) for h in groups if h!=g}
        b=min(bs.values());alternatives.append([h for h,v in bs.items() if v==b])
        if not own:point.append(0.);continue
        a=fsum(float(D[i,j]) for j in own)/len(own);point.append((b-a)/max(a,b) if max(a,b)>0 else 0.)
    means={g:fsum(point[i] for i in members[g])/len(members[g]) for g in groups}
    return result('SW',fsum(point)/n,pointwise=point,nearest_alternative_ties=alternatives,group_means=means,
        macro=fsum(means.values())/len(groups),negative_fraction=sum(v<0 for v in point)/n,
        singleton_fraction=sum(len(members[g])==1 for g in labels)/n)

def ch(X,labels):
    n=len(labels);K=len(set(labels))
    if not 1<K<n:return result('CH',status='undefined',reason='K_domain')
    d=kn.Dyadic(X);W=d.sse(labels);T=d.sse();B=T-W
    if B<0:return result('CH',status='numerical_failure',reason='negative_between_exact')
    details=dict(SSW=float(W),SSB=float(B),SST=float(T),decomposition_exact=True)
    if W==0:return result('CH',status='positive_infinity' if B>0 else 'undefined',reason='zero_within',**details)
    return result('CH',B*(n-K)/(W*(K-1)),**details)

def sdbw(Y,labels):
    d=kn.Dyadic(Y);groups=d.groups(labels);K=len(groups)
    if K<2:return result('S_Dbw',status='undefined',reason='one_group')
    def variance(ids):
        n=len(ids);s=d.sums(ids)
        return [F(n*sum(d.rows[i][j]**2 for i in ids)-s[j]**2,n*n*d.den2) for j in range(d.x.shape[1])]
    def norm(v):return hypot(*(float(x) for x in v))
    total=norm(variance(list(range(len(labels)))))
    if total==0:return result('S_Dbw',status='undefined',reason='zero_global_variance')
    vv=[norm(variance(groups[g])) for g in groups]
    rho=sqrt(fsum(vv))/K;scatter=fsum(vv)/(K*total);rnum,rden=float(rho).as_integer_ratio()
    def center(g):return d.sums(groups[g]),len(groups[g])
    def count(pool,c):
        s,n=c;right=rnum*rnum*n*n*d.den2;left=rden*rden
        return sum(sum((n*x-v)**2 for x,v in zip(d.rows[i],s))*left<=right for i in pool)
    pairs=[];ratios=[];statuses=[]
    for g,h in itertools.combinations(groups,2):
        pool=groups[g]+groups[h];a,na=center(g);b,nb=center(h)
        mid=([x*nb+y*na for x,y in zip(a,b)],2*na*nb)
        numerator=count(pool,mid);da=count(pool,(a,na));db=count(pool,(b,nb));den=max(da,db)
        state='ok' if den else 'positive_infinity' if numerator else 'undefined'
        pairs.append(dict(groups=[g,h],numerator=numerator,den_a=da,den_b=db,status=state))
        if den:ratios.append(F(numerator,den))
        else:statuses.append(state)
    details=dict(radius=rho,scatter=scatter,pairs=pairs,coordinate_count=Y.shape[1],closed_ball=True,pairpool=True)
    if statuses:return result('S_Dbw',status='undefined' if 'undefined' in statuses else 'positive_infinity',reason='pair_denominator_zero',**details)
    density=F(2,K*(K-1))*sum(ratios)
    return result('S_Dbw',scatter+float(density),density=float(density),**details)

def network(W,labels):
    d,groups,cells=kn.weighted_cells(W,labels);K=len(groups)
    I={g:cells[g,g] for g in groups};B={g:sum(cells[g,h] for h in groups if h!=g) for g in groups};vol={g:I[g]+B[g] for g in groups}
    mass=sum(cells.values())/2;closed=0;ratios=[]
    for g,h in itertools.combinations(groups,2):
        den=B[g]+B[h]-cells[g,h]
        if not den:
            assert B[g]==B[h]==cells[g,h]==0;closed+=1;ratios.append(F(0))
        else:ratios.append(cells[g,h]/den)
    details=dict(internal={str(g):float(I[g]) for g in groups},external={str(g):float(B[g]) for g in groups},mass=float(mass))
    AVI=result('AVI',sum(I[g]/vol[g] for g in groups)/K,**details) if all(vol.values()) else result('AVI',status='undefined',reason='zero_cluster_volume',**details)
    AVU=result('AVU',F(2,K)*sum(ratios),closed_pair_count=closed,strict_literal_status='undefined' if closed else 'ok',**details)
    MQ=result('MQ',sum(I[g]/(2*mass)-(vol[g]/(2*mass))**2 for g in groups),organizer_formula_confirmed=False,**details) if mass else result('MQ',status='undefined',reason='zero_graph_mass',**details)
    return dict(AVI=AVI,AVU=AVU,MQ=MQ)

def six(X,Y,W,labels,ids,reference_hash='fixture'):
    labels=list(kn.canonical(labels));X=np.asarray(X,dtype=float);Y=np.asarray(Y,dtype=float)
    if len(labels)!=len(ids) or len(set(ids))!=len(ids) or X.shape[0]!=len(ids) or Y.shape[0]!=len(ids) or not len(ids):raise ValueError('metric_support_domain')
    if not np.all(np.isfinite(X)) or not np.all(np.isfinite(Y)):raise ValueError('metric_coordinate_nonfinite')
    provenance=dict(ordered_IDs_hash=ref.digest(ids),partition_hash=ref.digest(labels),primary_coordinate_hash=ref.digest(X),
        symmetric_coordinate_hash=ref.digest(Y),graph_hash=ref.digest(np.asarray(W)),reference_hash=reference_hash,
        N=len(ids),K=len(set(labels)),one_group=len(set(labels))==1,all_singletons=len(set(labels))==len(labels))
    out={}
    for name,fn,coords in [('SW',silhouette,X),('CH',ch,X),('S_Dbw',sdbw,Y)]:
        try:out[name]=fn(coords,labels)
        except (OverflowError,kn.DomainError):out[name]=result(name,status='numerical_failure',reason='arithmetic_overflow_or_distance_domain')
    try:out.update(network(W,labels))
    except OverflowError:out.update({name:result(name,status='numerical_failure',reason='arithmetic_overflow') for name in ['AVI','AVU','MQ']})
    for record in out.values():record['provenance']=provenance
    return out
