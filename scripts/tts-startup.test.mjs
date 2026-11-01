import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile, chmod, rm} from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const execFileAsync=promisify(execFile);
const sourceDir=path.dirname(fileURLToPath(import.meta.url));

async function freePort() {
  const server=net.createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}

async function launch({defaultConfig=false,fallbackConfig=false,override,missingOverride=false}) {
  const root=await mkdtemp(path.join(os.tmpdir(),'cuex-tts-startup-test-'));
  try {
    const home=path.join(root,'home');
    const bin=path.join(root,'bin');
    const scripts=path.join(root,'scripts');
    await Promise.all([mkdir(home),mkdir(bin),mkdir(scripts)]);
    const port=await freePort();
    // Isolate the fixed production port so the test can coexist with a real bridge.
    for(const file of ['demo-remote-tts.mjs','tts-tunnel.mjs','tts-ssh-bridge.mjs','tts-ssh-config.mjs']) {
      try {
        const source=await readFile(path.join(sourceDir,file),'utf8');
        await writeFile(path.join(scripts,file),source.replaceAll('18766',String(port)));
      } catch(error) {if(file!=='tts-ssh-config.mjs'||error.code!=='ENOENT')throw error;}
    }
    const defaultPath=path.join(home,'.ssh','cuex-rtx-tts','ssh-config');
    const fallbackPath=path.join(home,'.ssh','rtx-home','ssh-config');
    for(const config of [defaultConfig&&defaultPath,fallbackConfig&&fallbackPath].filter(Boolean)) {
      await mkdir(path.dirname(config),{recursive:true});
      await writeFile(config,'# Test fixture: no keys or network access\n');
    }
    const explicitPath=override?path.join(root,'explicit-ssh-config'):undefined;
    if(explicitPath&&!missingOverride)await writeFile(explicitPath,'# Explicit test fixture\n');
    const log=path.join(root,'ssh-log.jsonl');
    const health=Buffer.from(JSON.stringify({ok:true,model:'Ming-3.0-tts-0.5b'})).toString('base64');
    const fakeSsh=`#!${process.execPath}
import {appendFileSync} from 'node:fs';
const args=process.argv.slice(2);
if(args.includes('-O'))process.exit(0);
appendFileSync(process.env.SSH_TEST_LOG,JSON.stringify(args)+'\\n');
process.stdin.resume();
process.stdin.once('end',()=>console.log(JSON.stringify({status:200,headers:{'content-type':'application/json'},body:'${health}'})));
`;
    await writeFile(path.join(bin,'ssh'),fakeSsh);
    await chmod(path.join(bin,'ssh'),0o755);
    await writeFile(path.join(scripts,'demo.mjs'),`console.log('DEMO_ENV '+JSON.stringify({backend:process.env.CUEX_TTS_BACKEND,fallback:process.env.CUEX_TTS_FALLBACK,url:process.env.CUEX_TTS_URL}));\n`);
    const env={...process.env,HOME:home,PATH:`${bin}:${process.env.PATH}`,SSH_TEST_LOG:log};
    delete env.CUEX_TTS_SSH_CONFIG;
    if(explicitPath)env.CUEX_TTS_SSH_CONFIG=explicitPath;
    let result;
    try {result=await execFileAsync(process.execPath,[path.join(scripts,'demo-remote-tts.mjs')],{env,timeout:12000});}
    catch(error) {
      if(missingOverride){assert.match(error.stderr,/Set CUEX_TTS_SSH_CONFIG/);return;}
      throw error;
    }
    assert.equal(missingOverride,false,'Missing explicit config must not fall back');
    assert.match(result.stdout,/DEMO_ENV /);
    const demoEnv=JSON.parse(result.stdout.split('DEMO_ENV ')[1].split('\n')[0]);
    assert.deepEqual(demoEnv,{backend:'http',fallback:'none',url:`http://127.0.0.1:${port}/tts`});
    const requests=(await readFile(log,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    assert.ok(requests.length>0,'Launcher must reach remote health through the bridge');
    for(const args of requests)assert.equal(args[args.indexOf('-F')+1],explicitPath??(defaultConfig?defaultPath:fallbackPath));
  } finally {await rm(root,{recursive:true,force:true});}
}

test('demo starts with the existing rtx-home pinned config when the default is missing',()=>launch({fallbackConfig:true}));
test('demo prefers its default pinned config when both local configs exist',()=>launch({defaultConfig:true,fallbackConfig:true}));
test('demo honors an explicit SSH config over discovered configs',()=>launch({defaultConfig:true,fallbackConfig:true,override:true}));
test('demo reports a missing explicit config instead of silently using a discovered config',()=>launch({fallbackConfig:true,override:true,missingOverride:true}));
