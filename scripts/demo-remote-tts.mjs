import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openTtsTunnel,probeTts,TTS_URL,waitForTts} from './tts-tunnel.mjs';

let tunnel;
let demo;
const stop=()=>{demo?.kill('SIGTERM');tunnel?.kill('SIGTERM');};
process.once('SIGINT',stop);
process.once('SIGTERM',stop);
try {
  if(!await probeTts())tunnel=openTtsTunnel();
  await waitForTts(tunnel);
  demo=spawn(process.execPath,[fileURLToPath(new URL('./demo.mjs',import.meta.url))],{
    stdio:'inherit',env:{...process.env,CUEX_TTS_BACKEND:'http',CUEX_TTS_URL:TTS_URL,CUEX_TTS_FALLBACK:'none',CUEX_TTS_TIMEOUT_MS:process.env.CUEX_TTS_TIMEOUT_MS??'30000'},
  });
  demo.once('exit',code=>{tunnel?.kill('SIGTERM');process.exitCode=code??1;});
  demo.once('error',error=>{console.error(error.message);stop();process.exitCode=1;});
} catch(error) {console.error(`[demo] ${error.message}`);stop();process.exitCode=1;}
