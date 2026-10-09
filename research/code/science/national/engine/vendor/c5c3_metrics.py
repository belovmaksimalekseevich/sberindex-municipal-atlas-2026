from fractions import Fraction as F
from math import isfinite
import hashlib,json
import numpy as np

NAMES=['SW','CH','S_Dbw','AVI','AVU','MQ']

DIRECTIONS={'SW':'higher','CH':'higher','S_Dbw':'lower','AVI':'higher','AVU':'lower','MQ':'higher'}

FORMULAS={'SW':'SW_UNIT_EUCLIDEAN_v1','CH':'CH_CENTERED_EXACT_v1',
 'S_Dbw':'SDBW_H2002_PAIRPOOL_SYMLHCLR7_NO_EXTRA_AXIS_SCALE_v2',
 'AVI':'AVI_WEIGHTED_INTERNAL2_EXTERNAL1_v1','AVU':'AVU_WEIGHTED_CLOSEDPAIR0_STRICTSTATUS_v1',
 'MQ':'MQ_AS_Q_NEWMAN_WEIGHTED_GAMMA1_v1'}

def digest(value):
    if isinstance(value,np.ndarray):return hashlib.sha256(value.astype('<f8').tobytes()).hexdigest()
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

def result(name,value=None,status='ok',reason=None,**diagnostics):
    if value is not None and not isfinite(float(value)):
        return dict(metric=name,value=None,status='numerical_failure',reason='nonfinite_export',formula=FORMULAS[name],direction=DIRECTIONS[name],diagnostics=diagnostics)
    assert status=='ok' or reason is not None
    return dict(metric=name,value=float(value) if value is not None else None,status=status,reason=reason,
                formula=FORMULAS[name],direction=DIRECTIONS[name],diagnostics=diagnostics)

def compare(draw,observed):
    comparable={'ok','positive_infinity'}
    if observed['status'] not in comparable or draw['status'] not in comparable:return None
    if draw['status']=='positive_infinity':order=0 if observed['status']=='positive_infinity' else 1
    elif observed['status']=='positive_infinity':order=-1
    else:order=(F(float(draw['value']))>F(float(observed['value'])))-(F(float(draw['value']))<F(float(observed['value'])))
    return order>=0 if observed['direction']=='higher' else order<=0
