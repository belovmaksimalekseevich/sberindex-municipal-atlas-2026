"""Recompute arithmetic from saved salary/neighbor/error tables only, without retrieval or fits."""
from pathlib import Path
import csv,json,math,statistics,collections
ROOT=Path(__file__).resolve().parents[2]
INDEX=json.loads((ROOT/'docs/evidence_details/DETAILS_INDEX.json').read_text('utf-8'))
def artifact(name):
 found=[r for r in INDEX['reference_occurrences'] if r['source_id']=='S12' and r['historical_target']==name]
 assert found,name
 return ROOT/found[0]['portable_path']
def main():
 errors=[];checks=0;max_delta=0.0
 def require(ok,msg):
  nonlocal checks
  checks+=1
  if not ok:errors.append(msg)
 def near(actual,expected,msg,rub=False):
  nonlocal max_delta
  delta=abs(actual-expected);max_delta=max(max_delta,delta)
  require(math.isclose(actual,expected,rel_tol=1e-12,abs_tol=1e-7 if rub else 1e-12),msg)
 with artifact('PER_QUERY.csv').open(encoding='utf-8',newline='') as f:rows=list(csv.DictReader(f))
 with artifact('PER_REGION.csv').open(encoding='utf-8',newline='') as f:regions=list(csv.DictReader(f))
 neighbors={r['ID']:r for r in json.loads(artifact('NEIGHBORS.json').read_text('utf-8'))}
 summary=json.loads((ROOT/'docs/evidence/S13.json').read_text('utf-8'))
 by={};people={};available=collections.defaultdict(set)
 for row in rows:
  key=(row['ID'],row['method']);require(key not in by,'duplicate_query_method');by[key]=row
  person=(row['supplier_region'],row['supplier_type'],float(row['actual_salary_RUB']),float(row['actual_log_salary']))
  require(row['ID'] not in people or people[row['ID']]==person,'inconsistent_person');people[row['ID']]=person
  if row['status']=='ok':available[row['method']].add(row['ID'])
 require(set(neighbors)==set(people),'neighbor_catalog')
 for row in rows:
  ID=row['ID'];method=row['method'];n=neighbors[ID]['methods'][method]
  require(row['status']==n['status'],'neighbor_status')
  if row['status']!='ok':continue
  ids=row['analogue_IDs'].split('|') if row['analogue_IDs'] else []
  require(ids==n['IDs'],'neighbor_IDs')
  region,typ,salary,logsalary=people[ID];near(logsalary,math.log(salary),'actual_log')
  if method=='median':
   pool=[v[3] for j,v in people.items() if v[0]!=region and v[1]==typ]
   pred=statistics.median(pool);require(len(pool)==n['aggregate_candidate_N'],'median_candidate_N')
  else:
   require(len(ids)==5 and len(set(ids))==5 and ID not in ids,'five_unique_nonself')
   require(all(people[j][0]!=region and people[j][1]==typ for j in ids),'same_type_other_region')
   pred=statistics.mean(people[j][3] for j in ids)
  near(float(row['prediction_log']),pred,'prediction_log')
  near(float(row['prediction_RUB']),math.exp(pred),'prediction_RUB',True)
  near(float(row['absolute_error_log']),abs(pred-logsalary),'error_log')
  near(float(row['absolute_error_RUB']),abs(math.exp(pred)-salary),'error_RUB',True)
 regmap={(r['panel'],r['method'],r['supplier_region']):r for r in regions}
 panel_receipts={}
 for name,panel in summary['panels'].items():
  support=set.intersection(*(available[m] for m in panel['methods']))
  require(support==set(panel['support_IDs']),'support_'+name);require(len(support)==panel['query_N'],'query_N_'+name)
  rs=sorted({people[i][0] for i in support});require(len(rs)==panel['region_N'],'region_N_'+name)
  for method in panel['methods']:
   means_log=[];means_rub=[]
   for region in rs:
    group=[by[(i,method)] for i in sorted(support) if people[i][0]==region];v=regmap[(name,method,region)]
    require(len(group)==int(v['query_N']),'regional_query_N')
    ml=statistics.mean(float(x['absolute_error_log']) for x in group);mr=statistics.mean(float(x['absolute_error_RUB']) for x in group)
    near(float(v['MAE_log']),ml,'region_MAE_log');near(float(v['MAE_RUB']),mr,'region_MAE_RUB',True);means_log.append(ml);means_rub.append(mr)
   scores=panel['scores'][method];near(scores['equal_region_MAE_log'],statistics.mean(means_log),'equal_region_MAE_log');near(scores['equal_region_MAE_RUB'],statistics.mean(means_rub),'equal_region_MAE_RUB',True)
   near(scores['pooled_MAE_log'],statistics.mean(float(by[(i,method)]['absolute_error_log']) for i in support),'pooled_MAE_log');near(scores['pooled_MAE_RUB'],statistics.mean(float(by[(i,method)]['absolute_error_RUB']) for i in support),'pooled_MAE_RUB',True)
  panel_receipts[name]={'queries':len(support),'regions':len(rs),'methods':len(panel['methods'])}
 print(json.dumps({'passed':not errors,'checks':checks,'queries':len(people),'error_rows':len(rows),'panels':panel_receipts,'maximum_absolute_delta_all_units':max_delta,'failures':errors[:30],'failures_N':len(errors),'new_fits':0,'limits':'Checks saved neighbor IDs, prediction arithmetic and equal-region/pool aggregates. Does not repeat candidate retrieval/distances, seed fits, source admission or establish scientific independence/ROI.'},ensure_ascii=False,indent=2))
 return 0 if not errors else 1
if __name__=='__main__':raise SystemExit(main())
