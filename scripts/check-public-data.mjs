import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let allowances=[];
try{
  const data=process.argv.includes('--staged')
    ?execFileSync('git',['show',':scripts/public-data-allowlist.json'],{cwd:root,stdio:['ignore','pipe','ignore'],encoding:'utf8'})
    :readFileSync(path.join(root,'scripts/public-data-allowlist.json'),'utf8');
  allowances=JSON.parse(data);
}catch{/* An absent allowance list exempts nothing. */}
const rules=[
  ['private-key',/-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ['phone',/(?<![\w\d])1[3-9]\d{9}(?![\w\d])/g],
  ['personal-path',/\/Users\/[^/\s]+\/|[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s]+[\\/]/g],
  ['key-token',/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{20,}/g],
  ['host-address',/(?<![\w\d])(?:\d{1,3}\.){3}\d{1,3}(?![\w\d])/g],
];

/** Returns locations and categories only: never return matched private values. */
export function inspectPublicText(file,text){
  const findings=[];
  const base=path.basename(file);
  if((base.startsWith('.env')&&!base.endsWith('.example'))||/^id_(rsa|ed25519|ecdsa)$/.test(base)||base==='ssh-config')findings.push({file,line:0,rule:'private-config-file'});
  text.split(/\r?\n/).forEach((line,index)=>{
    for(const [rule,pattern] of rules){
      pattern.lastIndex=0;
      const matches=[...line.matchAll(pattern)];
      const allowed=matches.filter(([value])=>!allowances.some(item=>item.file===file&&item.rule===rule&&item.sha256===createHash('sha256').update(value).digest('hex')));
      const valid=rule==='host-address'?allowed.filter(([value])=>value.split('.').every(n=>Number(n)<=255)&&!value.startsWith('127.')&&!['0.0.0.0','255.255.255.255'].includes(value)&&!['192.0.2.','198.51.100.','203.0.113.'].some(prefix=>value.startsWith(prefix))):allowed;
      if(valid.length)findings.push({file,line:index+1,rule});
    }
  });
  return findings;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const staged=process.argv.includes('--staged');
  const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  const findings=[];let scanned=0;
  for(const file of files){
    let bytes;
    try{
      if(staged)bytes=execFileSync('git',['show',`:${file}`],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:64*1024*1024});
      else{const absolute=path.join(root,file);const stat=lstatSync(absolute);if(!stat.isFile()||stat.size>2_000_000)continue;bytes=readFileSync(absolute);}
    }catch{findings.push({file,line:0,rule:'unreadable-public-file'});continue;}
    if(bytes.length>2_000_000||bytes.includes(0))continue;
    scanned++;findings.push(...inspectPublicText(file,bytes.toString('utf8')));
  }
  for(const finding of findings)console.error(`${finding.file}:${finding.line} [${finding.rule}]`);
  console.log(`Public-data check: ${scanned} text files, ${findings.length} findings (${staged?'Git index':'working tree'}).`);
  process.exitCode=findings.length?1:0;
}
