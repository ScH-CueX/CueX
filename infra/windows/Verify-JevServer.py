import json, math, urllib.request
from pathlib import Path
root=Path(r"C:\cuex")
url='http://127.0.0.1:18080'
def get(path):
    with urllib.request.urlopen(url+path,timeout=30) as r: return json.load(r)
def post(path,body):
    req=urllib.request.Request(url+path,json.dumps(body).encode(),{'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=180) as r: return json.load(r)
head=json.loads((root/'adapter_vllm/decision_head.json').read_text())
token_checks=[]
for text,expected in zip(head['slots']['verbalizers'],head['verbalizer_ids']):
    result=post('/tokenize',{'content':text,'add_special':False})
    ids=result['tokens']
    assert ids==[expected],(text,ids,expected)
    token_checks.append({'text':text,'id':expected})
prompt='[kind] noul\n[state] The sky is blue.\n[question] Is the sky blue?\n[options]\nfalse\ntrue\n[decision]:'
results=[]
for scale in [0,1]:
    body={'prompt':prompt,'n_predict':1,'temperature':1,'top_k':0,'top_p':1,'min_p':0,'repeat_penalty':1,'seed':42,'cache_prompt':False,'n_probs':24,'post_sampling_probs':True,'grammar':'root ::= "false" | "true"','logit_bias':[[3721,100],[1802,100]],'lora':[{'id':0,'scale':scale}]}
    result=post('/completion',body)
    results.append({'scale':scale,'response':result})
def scores(response):
    rows=response.get('completion_probabilities',response.get('probs',[]))
    assert rows, response
    top=rows[0].get('top_probs',rows[0].get('top_logprobs',[]))
    result={}
    for row in top:
        if row.get('id') in [3721,1802]:
            result[row['id']]=row.get('logprob',math.log(max(float(row.get('prob',0)),1e-300)))
    assert len(result)==2,(top,result)
    return result
scale0=scores(results[0]['response'])
scale1=scores(results[1]['response'])
delta=(scale1[1802]-scale1[3721])-(scale0[1802]-scale0[3721])
assert abs(delta)>1e-5, ('LoRA scale has no measured effect',scale0,scale1)
report={'scale_logprob_odds_delta':delta,'verbalizer_logprobs':{'scale0':scale0,'scale1':scale1},'health':get('/health'),'lora_adapters':get('/lora-adapters'),'token_checks':token_checks,'prompt':prompt,'results':results}
(root/'logs/lora-scale-check.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
