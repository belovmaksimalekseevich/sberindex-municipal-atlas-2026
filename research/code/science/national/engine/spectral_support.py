"""Support-only connected components and one-factor cache for original spectral code."""
from types import SimpleNamespace
from collections import OrderedDict
import hashlib
import numpy as np

def matrix_key(a):
    # All input matrices are required to be C-contiguous binary64; no cross-runtime reuse.
    if a.dtype!=np.float64 or not a.flags.c_contiguous:raise ValueError('factor_layout_domain')
    return (a.shape,hashlib.sha256(a.astype('<f8').tobytes()).hexdigest())

class SupportGraph:
    def __init__(self,W):self.W=W
    def connected_components(self):
        seen=set();groups=[]
        for start in range(len(self.W)):
            if start in seen:continue
            component=[];stack=[start];seen.add(start)
            while stack:
                i=stack.pop();component.append(i)
                for j in np.flatnonzero(self.W[i]>0):
                    j=int(j)
                    if j not in seen:seen.add(j);stack.append(j)
            groups.append(component)
        return groups

rt=SimpleNamespace(graph=SupportGraph)

class OneFactor(OrderedDict):
    def __setitem__(self,k,v):
        self.clear();super().__setitem__(k,v)

class SpectralEngine:
    def __init__(self):
        self.eigen=OneFactor();self.counts={'actual_eigensolves':0}
    def spectral(self,W,K):
        from spectral_method import spectral
        W=np.asarray(W,dtype=np.float64,order='C')
        if W.ndim!=2 or W.shape!=(len(W),len(W)) or not np.isfinite(W).all() or np.any(W<0) or not np.array_equal(W,W.T) or np.any(np.diag(W)):
            raise ValueError('spectral_weight_domain')
        return spectral(self,W,K)
