import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {resolveTtsSshConfig} from './tts-ssh-config.mjs';

const config=resolveTtsSshConfig();
if(!existsSync(config))throw new Error('Missing private SSH config; see infra/windows/tts/README.md.');
const dir=mkdtempSync(path.join(os.tmpdir(),'cuex-tts-bridge-'));
const socket=path.join(dir,'control');
const children=new Set();
const base=['-F',config,'-T','-o','BatchMode=yes','-o','ConnectTimeout=10','-o','LogLevel=ERROR','-o','ControlMaster=auto','-o','ControlPersist=60','-o',`ControlPath=${socket}`];
const server=http.createServer(async(req,res)=>{
  const route=req.url;
  if(!((req.method==='GET'&&route==='/health')||(req.method==='POST'&&route==='/tts'))){res.writeHead(404).end();return;}
  let child;
  res.once('close',()=>{if(!res.writableEnded)child?.kill('SIGTERM');});
  const fail=(status,message)=>{if(!res.destroyed&&!res.writableEnded)res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify({error:message}));};
  try {
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>8192){fail(413,'Speech request too large');return;}chunks.push(chunk);}
    const body=route==='/tts'?JSON.parse(Buffer.concat(chunks).toString('utf8')):undefined;
    if(route==='/tts'&&(typeof body.text!=='string'||!body.text.trim()||body.text.length>500||!['doctor','narrator'].includes(body.voice??'doctor'))){fail(400,'Invalid speech request');return;}
    if(res.destroyed)return;
    child=spawn('ssh',[...base,'rtx-home','E:/CueX-TTS/.venv/Scripts/python.exe','-u','E:/CueX-TTS/ssh_request.py'],{stdio:['pipe','pipe','pipe']});
    children.add(child);
    let output='';let stderr='';let bytes=0;
    const timer=setTimeout(()=>{fail(504,'Windows TTS request timed out');child.kill('SIGTERM');},route==='/health'?10000:125000);
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>16_100_000){fail(502,'Windows TTS response too large');child.kill('SIGTERM');}else output+=chunk.toString('utf8');});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString('utf8')).slice(-1000);});
    child.once('error',error=>{clearTimeout(timer);children.delete(child);fail(502,error.message);});
    child.once('close',code=>{
      clearTimeout(timer);children.delete(child);
      if(res.destroyed||res.writableEnded)return;
      try {
        const reply=JSON.parse(output);
        if(code!==0||reply.error)throw new Error(reply.error??stderr??'SSH request failed');
        if(!Number.isInteger(reply.status)||reply.status<100||reply.status>599||typeof reply.body!=='string')throw new Error('Invalid remote response');
        const data=Buffer.from(reply.body,'base64');
        res.writeHead(reply.status,{...reply.headers,'Content-Length':data.length});res.end(data);
      }catch(error){fail(502,error.message);}
    });
    child.stdin.on('error',()=>{});
    child.stdin.end(JSON.stringify({path:route,body}));
  }catch(error){fail(400,error.message);}
});
server.listen(18766,'127.0.0.1',()=>console.log('Windows Ming SSH bridge listening on 127.0.0.1:18766'));
let stopping=false;
function stop(){
  if(stopping)return;stopping=true;
  for(const child of children)child.kill('SIGTERM');
  server.close();server.closeAllConnections();
  const close=spawn('ssh',['-F',config,'-S',socket,'-O','exit','rtx-home'],{stdio:'ignore'});
  const timer=setTimeout(()=>close.kill('SIGTERM'),2000);
  close.once('error',()=>{clearTimeout(timer);rmSync(dir,{recursive:true,force:true});});
  close.once('close',()=>{clearTimeout(timer);rmSync(dir,{recursive:true,force:true});});
}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
server.once('error',error=>{console.error(error.message);stop();process.exitCode=1;});
