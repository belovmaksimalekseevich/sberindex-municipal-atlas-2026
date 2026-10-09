from math import sqrt
import numpy as np
from spectral_support import rt, matrix_key

def spectral(self,W,K):
        # One full factor per exact original graph; K-specific admission remains separate.
        if not 1<K<len(W):return dict(status='preflight_K_domain')
        key=matrix_key(W)
        if key not in self.eigen:
            G=rt.graph(W);d=np.sum(W,axis=1)
            if np.any(d<=0):return dict(status='preflight_nonpositive_strength')
            L=np.eye(len(W))-W/np.sqrt(d[:,None]*d[None,:])
            values,U=np.linalg.eigh(L);self.counts['actual_eigensolves']+=1
            self.eigen[key]=(L,values,U,len(G.connected_components()))
        L,values,U,components=self.eigen[key]
        if components>K:return dict(status='preflight_components_exceed_K')
        selected=U[:,:K];orth=float(np.linalg.norm(selected.T@selected-np.eye(K),'fro'))
        residual=float(np.linalg.norm(L@selected-selected*values[:K],'fro')/max(1,np.linalg.norm(L,'fro')))
        gap=float(values[K]-values[K-1]);row_norm=np.linalg.norm(selected,axis=1)
        diagnostics=dict(orthogonality=orth,residual=residual,gap=gap,row_norm_min=float(row_norm.min()))
        if orth>1e-8 or residual>1e-10:return dict(status='eigen_conformance_failure',**diagnostics)
        if gap<=1e-8*max(1,float(np.max(np.abs(values)))):return dict(status='preflight_boundary_gap_unavailable',**diagnostics)
        if np.any(row_norm<=1e-10/sqrt(len(W))):return dict(status='preflight_row_norm_unavailable',**diagnostics)
        return dict(status='available',embedding=selected/row_norm[:,None],**diagnostics)
