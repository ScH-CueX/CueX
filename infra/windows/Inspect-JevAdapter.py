import json, struct
from pathlib import Path
root = Path(r"C:\cuex")
p = root / "adapter_vllm/adapter_model.safetensors"
with p.open("rb") as f:
    n = struct.unpack("<Q", f.read(8))[0]
    header = json.loads(f.read(n))
output = {k: v for k,v in header.items() if "lm_head" in k or "output" in k}
assert output, "Adapter has no output/lm_head tensors"
config = json.loads((root / "base-config/config.json").read_text())
print(json.dumps({"tensor_count":len(header)-("__metadata__" in header),"output_tensors":output,"tie_word_embeddings":config.get("tie_word_embeddings"),"text_tie_word_embeddings":config.get("text_config",{}).get("tie_word_embeddings")},indent=2))
(root / "logs/adapter-inspection.json").write_text(json.dumps({"output_tensors":output,"base_config":config},indent=2))
