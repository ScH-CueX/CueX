import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function resolveTtsSshConfig() {
  if(process.env.CUEX_TTS_SSH_CONFIG!==undefined)return process.env.CUEX_TTS_SSH_CONFIG;
  const primary=path.join(os.homedir(),'.ssh','cuex-rtx-tts','ssh-config');
  if(existsSync(primary))return primary;
  const existing=path.join(os.homedir(),'.ssh','rtx-home','ssh-config');
  return existsSync(existing)?existing:primary;
}
