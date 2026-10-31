#!/usr/bin/env node
import net from 'node:net';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

const port=Number(process.env.CUEX_S1_LOCAL_PORT??18080);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('CUEX_S1_LOCAL_PORT must be a TCP port');
const streams=new Map();let sequence=0;let ssh;let ready=false;let stopping=false;let retry;
const maxFrame=1024*1024;
function frame(id,kind,data=Buffer.alloc(0)){
  if(!ready||!ssh?.stdin.writable)return false;
  return ssh.stdin.write(`${id} ${kind} ${data.toString('base64')}\n`);
}
function failStreams(reason){
  for(const socket of streams.values())socket.destroy(new Error(reason));
  streams.clear();
}
function start(){
  if(stopping)return;
  const child=spawn('ssh',['-F',`${homedir()}/.ssh/rtx-home/ssh-config`,'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2','-T','rtx-home','D:\\cuex\\convert-env\\Scripts\\python.exe -u D:\\cuex\\relay\\s1_relay.py'],{stdio:['pipe','pipe','pipe']});
  ssh=child;ready=true;
  const lines=createInterface({input:child.stdout,crlfDelay:Infinity});
  lines.on('line',line=>{
    const match=/^(\d+) (open|data|close) ([A-Za-z0-9+/=]*)$/.exec(line);
    if(!match||line.length>maxFrame*2){console.error('[s1-relay] ignored invalid remote frame');return;}
    const [,id,kind,encoded]=match;const socket=streams.get(id);if(!socket)return;
    if(kind==='data')socket.write(Buffer.from(encoded,'base64'));
    else if(kind==='close'){streams.delete(id);socket.end();}
  });
  child.stderr.on('data',data=>process.stderr.write(data));
  child.stdin.on('error',()=>{});
  child.on('error',error=>console.error(`[s1-relay] SSH start: ${error.message}`));
  child.on('close',()=>{
    lines.close();if(ssh!==child)return;ready=false;ssh=undefined;failStreams('System 1 relay disconnected');
    if(!stopping){console.error('[s1-relay] SSH closed; reconnecting in 1 second');retry=setTimeout(start,1000);}
  });
  child.stdin.on('drain',()=>{for(const socket of streams.values())socket.resume();});
}
const server=net.createServer({allowHalfOpen:true},socket=>{
  socket.setNoDelay(true);socket.on('error',()=>{});
  if(!ready){socket.destroy();return;}
  const id=String(++sequence);streams.set(id,socket);frame(id,'open');
  socket.on('data',data=>{
    for(let offset=0;offset<data.length;offset+=maxFrame){if(!frame(id,'data',data.subarray(offset,offset+maxFrame)))socket.pause();}
  });
  socket.on('close',()=>{if(streams.delete(id))frame(id,'close');});
});
server.on('error',error=>{console.error(`[s1-relay] listen failed: ${error.message}`);stop(1);});
function stop(code=0){
  if(stopping)return;stopping=true;clearTimeout(retry);ready=false;failStreams('System 1 relay stopped');
  server.close();if(ssh){ssh.stdin.end();ssh.kill('SIGTERM');}
  setTimeout(()=>process.exit(code),250).unref();
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
server.listen(port,'127.0.0.1',()=>{console.error(`[s1-relay] listening on 127.0.0.1:${port}`);start();});
