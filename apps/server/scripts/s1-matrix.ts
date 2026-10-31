import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const args=process.argv.slice(2);
const arg=(key:string,fallback:string)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const quant=arg('--quant','Q4_K_M');
const url=arg('--url',process.env.CUEX_S1_URL??'http://127.0.0.1:18080');
const out=arg('--out','/tmp/cuex-s1-matrix');await mkdir(out,{recursive:true});
const configs=[{name:'jev-zh',format:'jev-v1',language:'zh',scale:'1'},{name:'jev-en',format:'jev-v1',language:'en',scale:'1'},{name:'chat-zh',format:'chat',language:'zh',scale:'0'}];
const summaries=[];
for(const config of configs){
  const file=path.join(out,`${quant}-${config.name}.json`);
  const command=['tsx','scripts/s1-eval.ts','--url',url,'--format',config.format,'--lora-scale',config.scale,'--backend',`jev9b-${quant}-${config.name}@win-vulkan`,'--out',file,'--rounds',arg('--rounds','1')];
  if(config.language==='en')command.push('--english');
  const code=await new Promise<number>((resolve,reject)=>{const child=spawn('npx',command,{stdio:'inherit',env:process.env});child.on('error',reject);child.on('exit',c=>resolve(c??1));});
  if(code!==0)throw new Error(`${config.name} exited${code}`);
  const data=JSON.parse(await readFile(file,'utf8'));summaries.push(data.summary);
}
await writeFile(path.join(out,`${quant}-summary.json`),JSON.stringify(summaries,null,2)+'\n');
console.log(JSON.stringify(summaries,null,2));
