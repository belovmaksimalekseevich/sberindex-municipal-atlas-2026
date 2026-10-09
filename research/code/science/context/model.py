"""Retrospective 2024 typology; pure draw-safe preparation and model APIs."""
import os
for _name in ['OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','NUMEXPR_NUM_THREADS','BLIS_NUM_THREADS','VECLIB_MAXIMUM_THREADS']:
    os.environ[_name]='1'
import csv, hashlib, json, math, warnings
from pathlib import Path
import numpy as np
from scipy.cluster.hierarchy import linkage,cut_tree
from scipy.spatial.distance import cdist
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_samples,calinski_harabasz_score,davies_bouldin_score,adjusted_rand_score
from threadpoolctl import threadpool_limits
import preprocessing

SEEDS=[1000003,1104732,1209461,1314190,1418919,1523648,1628377,1733106]
K_GRID=[4,6,8,10,12,16,20]
RAW_NAMES=['typical_monthly_total_RUB','typical_food_RUB','typical_health_RUB','typical_marketplaces_RUB','typical_restaurants_RUB','typical_transport_RUB',
 'closed_food_share','closed_health_share','closed_marketplaces_share','closed_restaurants_share','closed_transport_share',
 'population_jan1_2024','market_access_2024','organization_salary_RUB_2024','organization_workers_2024','education_workers_2024',
 'organization_workers_per_resident_2024','education_worker_share_2024']
RAW_UNITS=['RUB']*6+['share_of_selected5']*5+['people','source_market_access_index','RUB_per_month','annual_average_people','annual_average_people','organization_workers_per_resident','share_of_surveyed_organization_workers']
def digest(value):return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
def array_sha(value):return hashlib.sha256(np.asarray(value,dtype='<f8').tobytes()).hexdigest()
def canonical(labels):
    remap={};return [remap.setdefault(int(x),len(remap)) for x in labels]
def load_raw(npz_path,metadata_path=None):
    with np.load(npz_path,allow_pickle=False) as z:raw={k:z[k].copy() for k in z.files}
    raw['metadata']={} if metadata_path is None else {r['ID']:r for r in csv.DictReader(Path(metadata_path).open(encoding='utf-8-sig',newline=''))}
    return raw
def prepare_for_indices(raw_input,input_schema,indices=None,variant='context6'):
    """Refit robust scales ONLY on the explicit sample. Never reuse full scales."""
    ids=raw_input['IDs'].tolist();n=len(ids)
    if ids!=sorted(set(ids)):raise ValueError('ID_order_or_duplicates')
    ix=np.arange(n,dtype=int) if indices is None else np.asarray(indices)
    if ix.ndim!=1 or ix.dtype.kind not in 'iu' or len(ix)<3 or len(set(ix.tolist()))!=len(ix) or np.any(ix<0) or np.any(ix>=n) or not np.array_equal(ix,np.sort(ix)):raise ValueError('indices_must_be_unique_sorted_integer_rows')
    if input_schema['preprocessing_version']!=preprocessing.VERSION or raw_input['features'].tolist()!=preprocessing.FEATURES:raise ValueError('feature_schema_mismatch')
    expected_features=preprocessing.transformed_features(raw_input['monthly_consumption_RUB'][ix],*[raw_input[k][ix] for k in ['population_jan1_2024','market_access_2024','organization_salary_RUB_2024','organization_workers_2024','education_workers_2024']])
    xraw=raw_input['X_raw'][ix]
    if not np.allclose(expected_features,xraw,rtol=1e-13,atol=1e-13):raise ValueError('X_raw_does_not_match_raw_values_within_declared_platform_tolerance')
    X,reference=preprocessing.fit_transform(xraw,variant=variant)
    selected_ids=[ids[i] for i in ix];reference['ordered_IDs_sha256']=digest(selected_ids);reference['X_raw_sha256']=array_sha(xraw)
    reference['preprocessing_refit_on_this_sample']=True
    monthly=raw_input['monthly_consumption_RUB'][ix]
    typical=np.exp(np.log(monthly).mean(axis=1));parts=typical[:,1:];closed=parts/parts.sum(axis=1,keepdims=True)
    context=np.column_stack([raw_input[k][ix] for k in ['population_jan1_2024','market_access_2024','organization_salary_RUB_2024','organization_workers_2024','education_workers_2024','organization_workers_per_resident_2024','education_worker_share_2024']])
    values=np.column_stack((typical,closed,context))
    meta=raw_input.get('metadata',{})
    return {'X':X,'ids':selected_ids,'global_indices':ix,'raw_values':values,'raw_names':RAW_NAMES,'raw_units':RAW_UNITS,'monthly_consumption_RUB':monthly,'months':raw_input['months'].tolist(),'categories':raw_input['categories'].tolist(),
      'metadata':[meta.get(ID,{'ID':ID,'supplier_region':str(raw_input['regions'][i]),'native_oktmo8':str(raw_input['native_oktmo8'][i])}) for ID,i in zip(selected_ids,ix)],
      'reference':reference,'reference_sha256':digest(reference),'X_sha256':array_sha(X),'variant':variant,'source_schema':input_schema,
      'scope':'full_complete_case' if len(ix)==n else 'strict_subsample_without_replacement','source_N':n}

def metric_record(fn):
    try:
      v=float(fn())
      return {'status':'ok','value':v} if math.isfinite(v) else {'status':'nonfinite','value':None}
    except ValueError as e:return {'status':'undefined','value':None,'reason':str(e)}

def fit_partition(prepared,family,K,seeds=SEEDS,ward_hierarchy=None,attempt_callback=None):
    X=prepared['X'];n=len(X)
    if K not in K_GRID or not 1<K<n:raise ValueError('K_or_support_domain')
    attempts=[]
    with threadpool_limits(limits=1):
      if family=='Ward':
       hierarchy=linkage(X,method='ward',metric='euclidean',optimal_ordering=False) if ward_hierarchy is None else ward_hierarchy
       labels=canonical(cut_tree(hierarchy,n_clusters=[K]).ravel())
       attempts=[{'seed_index':None,'seed':None,'status':'ok','labels':labels}];chosen=0
       if attempt_callback:attempt_callback(attempts)
      elif family=='KMeans':
       if list(seeds)!=SEEDS:raise ValueError('fixed_seed_list_changed')
       hierarchy=None
       for index,seed in enumerate(seeds,1):
        attempt={'seed_index':index,'seed':seed}
        try:
         estimator=KMeans(n_clusters=K,init='k-means++',n_init=1,max_iter=300,tol=1e-6,algorithm='lloyd',random_state=seed)
         with warnings.catch_warnings(record=True) as caught:
          warnings.simplefilter('always');raw_labels=estimator.fit_predict(X);z=canonical(raw_labels)
         inertia=float(estimator.inertia_);valid=len(set(z))==K and math.isfinite(inertia)
         cap=int(estimator.n_iter_)>=300
         attempt.update(status='ok' if valid and not cap else 'iteration_cap_or_invalid_partition',labels=z,inertia=inertia if math.isfinite(inertia) else None,
           iterations=int(estimator.n_iter_),iteration_cap_reached=cap,warnings=[str(w.message) for w in caught],labels_raw=raw_labels.tolist(),centers_raw_label_order=estimator.cluster_centers_.tolist())
        except Exception as e:attempt.update(status='error',error=repr(e))
        attempts.append(attempt)
        if attempt_callback:attempt_callback(attempts)
       eligible=[i for i,a in enumerate(attempts) if a['status']=='ok']
       if not eligible:return {'status':'unavailable','family':family,'K':K,'attempts':attempts,'labels':None,'scientific_acceptance':False}
       chosen=min(eligible,key=lambda i:(attempts[i]['inertia'],tuple(attempts[i]['labels']),i));labels=attempts[chosen]['labels']
      else:raise ValueError('unknown_family')
      labels_array=np.asarray(labels);sizes=[labels.count(g) for g in range(K)]
      if sum(sizes)!=n or any(s==0 for s in sizes):raise ValueError('incomplete_partition')
      centers=np.asarray([X[labels_array==g].mean(axis=0) for g in range(K)])
      distance=cdist(X,X,metric='euclidean');np.fill_diagonal(distance,0.)
      point=silhouette_samples(distance,labels_array,metric='precomputed')
      center_distance=cdist(X,centers);own=center_distance[np.arange(n),labels_array]
      center_distance[np.arange(n),labels_array]=np.inf;other=center_distance.argmin(axis=1);alt=center_distance[np.arange(n),other]
      margin=np.divide(alt-own,np.maximum(alt,own),out=np.zeros(n),where=np.maximum(alt,own)>0)
      inertia=float(np.sum((X-centers[labels_array])**2))
      scores={'SW':{'status':'ok','value':float(point.mean())},'CH':metric_record(lambda:calinski_harabasz_score(X,labels_array)),
              'DB':metric_record(lambda:davies_bouldin_score(X,labels_array)),'inertia':{'status':'ok','value':inertia}}
      profiles=[];boundary=[]
      global_median=np.median(prepared['raw_values'],axis=0)
      for g in range(K):
       indices=np.flatnonzero(labels_array==g);pool=distance[np.ix_(indices,indices)]
       sums=pool.sum(axis=1);local=min(range(len(indices)),key=lambda j:(float(sums[j]),prepared['ids'][indices[j]]));medoid=int(indices[local])
       examples=sorted(indices.tolist(),key=lambda i:(float(distance[medoid,i]),prepared['ids'][i]))[:5]
       near=sorted(indices.tolist(),key=lambda i:(float(point[i]),prepared['ids'][i]))[:10]
       raw=prepared['raw_values'][indices];quantiles=np.quantile(raw,[.1,.25,.5,.75,.9],axis=0,method='linear')
       stats={name:{'unit':unit,'min':float(np.min(raw[:,j])),'q10':float(quantiles[0,j]),'q25':float(quantiles[1,j]),'median':float(quantiles[2,j]),'q75':float(quantiles[3,j]),'q90':float(quantiles[4,j]),'max':float(np.max(raw[:,j])),'global_median':float(global_median[j]),
                   'median_minus_global':float(quantiles[2,j]-global_median[j]),'median_ratio_to_global':float(quantiles[2,j]/global_median[j]) if global_median[j]!=0 else None}
              for j,(name,unit) in enumerate(zip(prepared['raw_names'],prepared['raw_units']))}
       regions={}
       for i in indices:
        region=prepared['metadata'][int(i)].get('supplier_region','');regions[region]=regions.get(region,0)+1
       centroid_representative=min(indices.tolist(),key=lambda i:(float(own[i]),prepared['ids'][i]))
       shape_center=np.exp(np.log(raw[:,6:11]).mean(axis=0));shape_center/=shape_center.sum()
       monthly_quantiles=np.quantile(prepared['monthly_consumption_RUB'][indices],[.25,.5,.75],axis=0,method='linear')
       profiles.append({'cluster':g,'n':len(indices),'fraction':len(indices)/n,'member_IDs':[prepared['ids'][i] for i in indices],
         'medoid_ID':prepared['ids'][medoid],'medoid_metadata':prepared['metadata'][medoid],'medoid_mean_within_distance':float(sums[local]/len(indices)),
         'examples':[{'ID':prepared['ids'][i],'metadata':prepared['metadata'][i],'distance_to_medoid':float(distance[medoid,i])} for i in examples],
         'centroid_representative_ID':prepared['ids'][centroid_representative],'centroid_representative_distance':float(own[centroid_representative]),
         'raw_profiles':stats,'region_counts':regions,'region_count':len(regions),'largest_region_fraction':max(regions.values())/len(indices),
         'closed_selected5_geometric_center':shape_center.tolist(),'raw_share_quantiles_do_not_form_a_closed_composition':True,
         'monthly_spending_profile':{'months':prepared['months'],'categories':prepared['categories'],'unit':'RUB','q25':monthly_quantiles[0].tolist(),'median':monthly_quantiles[1].tolist(),'q75':monthly_quantiles[2].tolist()},
         'SW_mean':float(point[indices].mean()),'negative_SW_fraction':float(np.mean(point[indices]<0)),
         'near_boundary_IDs':[prepared['ids'][i] for i in near],'centroid_in_fit_space':centers[g].tolist(),
         'economic_name':None,'context_is_fit_input_not_independent_validation':True})
       for i in near:boundary.append({'ID':prepared['ids'][i],'cluster':g,'SW':float(point[i]),'nearest_other_centroid_cluster':int(other[i]),'distance_to_own_centroid':float(own[i]),'distance_to_other_centroid':float(alt[i]),'centroid_margin':float(margin[i]),'metadata':prepared['metadata'][i]})
      good=[a for a in attempts if a['status']=='ok']
      ari=[{'seed_a':a['seed'],'seed_b':b['seed'],'ARI':float(adjusted_rand_score(a['labels'],b['labels']))} for i,a in enumerate(good) for b in good[i+1:]] if family=='KMeans' else []
      return {'schema':'context-typology-partition-v1','status':'completed','variant':prepared['variant'],'family':family,'K':K,'N':n,'IDs':prepared['ids'],'labels':labels,'sizes':sizes,
       'attempts':attempts,'representative_seed_index':attempts[chosen]['seed_index'],'selector':'min sklearn inertia; exact tie canonical labels then seed index' if family=='KMeans' else 'fixed one Ward hierarchy cut_tree exact K',
       'metrics':scores,'metric_directions':{'SW':'higher','CH':'higher','DB':'lower','inertia':'lower; decreases with K, not a K-selection criterion'},
       'pointwise_SW':point.tolist(),'centroid_margin':margin.tolist(),'nearest_other_centroid_cluster':other.tolist(),'profiles':profiles,'near_boundary_cases':boundary,'seed_ARI':ari,
       'X_sha256':prepared['X_sha256'],'reference_sha256':prepared['reference_sha256'],'reference_source_ID_sha256':prepared['reference']['ordered_IDs_sha256'],
       'scope':prepared['scope'],'reference_year':2024,'retrospective':True,'national_full':False,'scientific_acceptance':False,
       'subsample_robustness':'separate_track_not_assessed_here','boundary_caveat':'low SW / centroid margin diagnostics are not calibrated membership error probabilities',
       'fit_context_is_independent_validation':False,'hierarchy':hierarchy}

def crosswalk(a,b,strict_nested=False):
    if a['IDs']!=b['IDs']:raise ValueError('crosswalk_support_mismatch')
    z=np.asarray(a['labels']);v=np.asarray(b['labels']);cells=[]
    for g in range(a['K']):
     for h in range(b['K']):
      count=int(np.sum((z==g)&(v==h)))
      if count:cells.append({'from_cluster':g,'to_cluster':h,'n':count,'fraction_of_from':count/a['sizes'][g],'fraction_of_to':count/b['sizes'][h],'Jaccard':count/(a['sizes'][g]+b['sizes'][h]-count)})
    if strict_nested:
     for h in range(b['K']):
      if len([c for c in cells if c['to_cluster']==h])!=1:raise ValueError('Ward_not_nested')
    return {'from_K':a['K'],'to_K':b['K'],'relation':'strict_hierarchy_cut' if strict_nested else 'overlap_only_no_lineage_claim','cells':cells,'ARI':float(adjusted_rand_score(z,v))}
