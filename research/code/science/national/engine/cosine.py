"""Same exact cosine support/weights as the prior prototype, without all-pair dict.

At most one row of rational scores is retained. All exact kth ties are kept.
No rounded similarity defines an edge. Weights preserve the prototype operation order.
"""
from fractions import Fraction as F
from math import sqrt,isfinite
import numpy as np
from kernels import Dyadic

def graph(rows,k):
    x=np.asarray(rows,dtype=np.float64)
    if x.ndim!=2 or x.shape[1]!=5 or not np.isfinite(x).all() or np.any(x<=0):raise ValueError('positive_five_category_rows_required')
    n=len(x)
    if isinstance(k,bool) or not isinstance(k,int) or not 1<=k<n:raise ValueError('knn_k_domain')
    d=Dyadic(x);near=np.zeros((n,n),dtype=bool);extra=[]
    for i,row in enumerate(d.rows):
        scores=[]
        for j,other in enumerate(d.rows):
            if i==j:continue
            dot=sum(a*b for a,b in zip(row,other))
            scores.append((F(dot*dot,d.norms[j]),j))
        cut=sorted((v for v,j in scores),reverse=True)[k-1]
        selected=[j for v,j in scores if v>=cut];near[i,selected]=True;extra.append(len(selected)-k)
    support=near|near.T;np.fill_diagonal(support,False);W=np.zeros((n,n),dtype=np.float64)
    den4=d.den2*d.den2
    for i in range(n):
        for j in np.flatnonzero(support[i,i+1:])+i+1:
            j=int(j);dot=sum(a*b for a,b in zip(d.rows[i],d.rows[j]))
            w=float(F(dot,d.den2))/sqrt(float(F(d.norms[i]*d.norms[j],den4)))
            if not isfinite(w) or not 0<w<=1:raise ValueError('nonfinite_or_invalid_supported_cosine')
            W[i,j]=W[j,i]=w
    return dict(W=W,support=support,F=list(range(n)),isolates=[],
                full_edge_count=int(np.count_nonzero(np.triu(support,1))),extra_tied_neighbors=extra,
                rule='positive selected5 reported RUB cosine; union kNN, all exact kth ties',
                input_level_used=False,imputation=False)
