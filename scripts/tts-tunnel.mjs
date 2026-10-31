import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

export const TTS_URL='http://127.0.0.1:18766/tts';
export async function probeTts() {
  try {const r=await fetch('http://127.0.0.1:18766/health',{signal:AbortSignal.timeout(5000)});const s=await r.json();return r.ok&&s.ok&&s.model==='Ming-3.0-tts-0.5b';}catch{return false;}
}
export function openTtsTunnel() {
  const config=process.env.CUEX_TTS_SSH_CONFIG??path.join(os.homedir(),'.ssh','cuex-rtx-tts','ssh-config');
  if(!existsSync(config))throw new Error('Set CUEX_TTS_SSH_CONFIG to the private, pinned-host SSH config. See infra/windows/tts/README.md.');
  const child=spawn(process.execPath,[fileURLToPath(new URL('./tts-ssh-bridge.mjs',import.meta.url))],{stdio:'inherit'});
  child.once('error',error=>{child.cuexError=error;});
  return child;
}
export async function waitForTts(tunnel, timeout=30000) {
  const end=Date.now()+timeout;
  while(Date.now()<end) {
    if(tunnel?.cuexError)throw tunnel.cuexError;
    if(tunnel?.exitCode!==null&&tunnel?.exitCode!==undefined)throw new Error('TTS tunnel exited before the service became ready');
    if(await probeTts())return;
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw new Error('Windows Ming TTS is not ready. Start its service and retry; no alternate voice provider was used.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  if(await probeTts())console.log(`Windows Ming TTS ready at ${TTS_URL}`);
  else {
    const tunnel=openTtsTunnel();
    process.once('SIGINT',()=>tunnel.kill('SIGTERM'));process.once('SIGTERM',()=>tunnel.kill('SIGTERM'));
    try {await waitForTts(tunnel);console.log(`Windows Ming TTS ready at ${TTS_URL}`);}
    catch(error){tunnel.kill('SIGTERM');throw error;}
  }
}
