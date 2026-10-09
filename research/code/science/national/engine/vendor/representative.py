from fractions import Fraction as F

def own_representative(attempts,scale,maximize=False):
    good=[a for a in attempts if a['status']=='converged']
    if not good:return dict(representative=None,q_star=None,tau=scale/F(10**10),tie_seeds=[],run_set_size=len(attempts))
    qstar=(max if maximize else min)(a['objective'] for a in good)
    tau=scale/F(10**10)
    ties=[a for a in good if (qstar-a['objective'] if maximize else a['objective']-qstar)<=tau]
    selected=min(ties,key=lambda a:(tuple(a['labels']),a['seed_index']))
    return dict(representative=selected,q_star=qstar,chosen_q=selected['objective'],tau=tau,
                gap=abs(selected['objective']-qstar),tie_seeds=[a['seed_index'] for a in ties],run_set_size=len(attempts))
