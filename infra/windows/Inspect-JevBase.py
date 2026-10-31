import json, struct
from pathlib import Path
root=Path(r"C:\cuex")
p=root/'models/Qwen3.5-9B-Q4_K_M.gguf'
if not p.exists(): p=p.with_suffix(p.suffix+'.partial')
f=p.open('rb')
def u(fmt): return struct.unpack('<'+fmt,f.read(struct.calcsize('<'+fmt)))[0]
def string(): return f.read(u('Q')).decode()
def value(t):
    formats={0:'B',1:'b',2:'H',3:'h',4:'I',5:'i',6:'f',7:'?',10:'Q',11:'q',12:'d'}
    if t in formats: return u(formats[t])
    if t==8: return string()
    if t==9:
        inner=u('I'); n=u('Q')
        return [value(inner) for _ in range(n)]
    raise ValueError(t)
assert f.read(4)==b'GGUF'
version=u('I'); nt=u('Q'); nk=u('Q'); metadata={}
for _ in range(nk):
    key=string(); t=u('I'); v=value(t)
    if key in ['general.architecture','general.name','general.file_type','qwen35.embedding_length','qwen35.block_count']: metadata[key]=v
names={}
for _ in range(nt):
    name=string(); nd=u('I'); shape=[u('Q') for _ in range(nd)]; dtype=u('I'); offset=u('Q')
    if name in ['output.weight','token_embd.weight']: names[name]={'shape':shape,'type':dtype,'offset':offset}
report={'file':str(p),'version':version,'tensor_count':nt,'metadata':metadata,'output_tensors':names}
print(json.dumps(report,indent=2))
assert 'output.weight' in names and 'token_embd.weight' in names
assert names['output.weight']['offset']!=names['token_embd.weight']['offset']
(root/'logs/base-output-inspection.json').write_text(json.dumps(report,indent=2))
