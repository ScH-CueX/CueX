import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@cuex/protocol';
import { WebSocketGateway } from '../src/gateway/WebSocketGateway';
import { FakeSystemTwo, SilentTts, TextOnlyAsr } from '../src/fakes/engines';
import { LlamaSystemOne, HeuristicSystemOne, FallbackSystemOne } from '../src/system1/index';
import { ANSHU_PACK } from '../src/scenario/anshu';
import { encodeSystemOneState, type SystemOneClient } from '../src/contracts';

async function fakeLlama(stall = false) {
  const calls: any[] = [];
  const server = createServer(async(req,res)=>{
    let raw=''; for await(const chunk of req) raw+=chunk;
    res.setHeader('content-type','application/json');
    if(req.url==='/health'){res.end('{"status":"ok"}');return;}
    if(stall)return;
    const body=JSON.parse(raw); calls.push(body);
    const prompt=body.prompt as string;
    // This fake serves canned probabilities for the Chinese demo phrases, not a second model.
    assert.equal(body.n_predict,1);assert.equal(body.lora[0].id,0);assert.equal(body.lora[0].scale,1);
    assert.equal(body.cache_prompt,true);assert.equal(body.post_sampling_probs,true);
    assert.match(prompt,/^\[kind\] noul\n\[state\]/);
    const state=JSON.parse(prompt.split('[state] ')[1].split('\n[question] ')[0]);
    const question=prompt.split('[question] ')[1].split('\n[options]')[0];
    const speech=state.repSpeechSinceConcern as string;
    const recent=state.recentSpeech as string;
    const answering=/我先回答|75岁|eGFR/.test(recent);
    let truth=false;
    if(question.includes('候选追问')||question.includes('candidate follow-up')) truth=!answering;
    else if(question.includes('继续介绍无关')||question.includes('continuing unrelated')||question.includes('describing overall study')) truth=!answering;
    else if(question.includes('是否正在回应')||question.includes('responding to the doctor')) truth=answering;
    else if(question.includes('75 岁')||question.includes('over 75')) truth=/75岁以上约占11%/.test(speech);
    else if(question.includes('30–60')||question.includes('30-60')) truth=/eGFR30到60.{0,12}412/.test(speech);
    else if(question.includes('低于 30')||question.includes('below 30')) truth=/eGFR低于30.{0,20}不建议/.test(speech);
    res.end(JSON.stringify({probs:[{top_probs:[{id:3721,token:'false',prob:truth?.02:.98},{id:1802,token:'true',prob:truth?.98:.02}]}]}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${(server.address() as {port:number}).port}`,calls,close:async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}

async function session(system1:SystemOneClient){
  const gateway=new WebSocketGateway({port:0,host:'127.0.0.1',pack:ANSHU_PACK,createEngines:()=>({system1,system2:new FakeSystemTwo(5),asr:new TextOnlyAsr(),tts:new SilentTts()}),controller:{debounceMs:1,minDriftMs:0,minDriftChars:10,candidateHoldMs:100,minInterruptGapMs:0}});
  await gateway.start();const ws=new WebSocket(`ws://127.0.0.1:${gateway.port}/ws/session`);const events:ServerMessage[]=[];
  ws.on('message',raw=>events.push(JSON.parse(raw.toString())));await once(ws,'open');
  async function wait(predicate:(e:ServerMessage)=>boolean,from=0){
    const existing=events.slice(from).find(predicate);if(existing)return existing;
    return new Promise<ServerMessage>((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',listener);reject(new Error('demo event timeout'));},4000);const listener=(raw:unknown)=>{const event=JSON.parse(String(raw)) as ServerMessage;if(predicate(event)){clearTimeout(timer);ws.off('message',listener);resolve(event);}};ws.on('message',listener);});
  }
  const send=(type:string,payload:unknown)=>ws.send(JSON.stringify({type,payload}));
  send('session.start',{scenarioId:ANSHU_PACK.scenario.id,mode:'performance'});await wait(e=>e.type==='session.ready');await wait(e=>e.type==='controller.dispatch'&&e.payload.pose==='listening');
  async function speech(text:string,isFinal=false){const from=events.length;send('speech.delta',{text,isFinal});return wait(e=>e.type==='system1.verdict',from);}
  return {events,wait,speech,gateway,close:async()=>{ws.close();await gateway.stop();}};
}

for(const transport of ['model','timeout-fallback'] as const) test(`Chinese demo prepares and withdraws a follow-up through gateway with ${transport}`,async()=>{
  const server=await fakeLlama(transport==='timeout-fallback');
  const primary=new LlamaSystemOne({baseUrl:server.url,promptFormat:'jev-v1',timeoutMs:transport==='model'?1000:30});
  const engine=transport==='model'?primary:new FallbackSystemOne(primary,new HeuristicSystemOne(ANSHU_PACK));
  const h=await session(engine);
  try{
    await h.speech('主要终点是12周收缩压，多降6.2毫米汞柱，');
    assert(!h.events.some(e=>e.type==='system2.candidate'));
    await h.speech('而且不良反应率与安慰剂相当，另有上市后真实世界研究的疗效结果，');
    await h.wait(e=>e.type==='system2.candidate'&&e.payload.candidate.phase==='ready');
    await h.speech('我先回答您的人群问题，');
    await h.wait(e=>e.type==='system2.candidate'&&e.payload.candidate.phase==='withdrawn');
    assert(!h.events.some(e=>e.type==='system2.candidate'&&e.payload.candidate.phase==='spoken'));
    assert.deepEqual(h.gateway.inspectSessions()[0].resolvedPointIds,[],'answering promise must not resolve any point');
    await h.speech('75岁以上约占11%，eGFR30到60亚组412人，降压幅度与总体一致。',true);
    await h.speech('eGFR低于30被排除，没有证据，说明书不建议使用。',true);
    await h.wait(e=>e.type==='controller.dispatch'&&e.payload.concernProgress.concernId==='concern-dose');
    assert.equal(h.gateway.inspectSessions()[0].candidates[0].fate,'withdrawn');
    if(transport==='model')assert(server.calls.length>=10,'real HTTP model readout was used throughout the visit');
  }finally{await h.close();await server.close();}
});

test('typed decision round trip uses JEV token slots and published calibration over HTTP',async()=>{
  const seen:any[]=[];
  const server=createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);seen.push(body);const kind=body.prompt.split('\n')[0].slice(7);const entries=kind==='score'?Array.from({length:6},(_,i)=>({id:15+i,token:String(i),prob:i===4?.9:.02})):kind==='choice'?[{id:32,token:'A',prob:.1},{id:33,token:'B',prob:.9}]:[{id:3721,token:'false',prob:.25},{id:1802,token:'true',prob:.75}];res.setHeader('content-type','application/json');res.end(JSON.stringify({probs:[{top_probs:entries}]}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const client=new LlamaSystemOne({baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}`,promptFormat:'jev-v1',timeoutMs:1000});
    const result=await client.decide(encodeSystemOneState({concernId:'concern-scope',concern:'适用范围',unresolvedPointIds:['c1'],repSpeechSinceConcern:'75岁以上患者约占11%。'}),{responding:{kind:'noul',question:'代表是否正在回应？'},action:{kind:'choice',question:'下一步',options:['追问','继续听']},relevance:{kind:'score',question:'回应程度'}});
    assert.equal(result.answers.responding.top,'true');assert.equal(result.answers.action.top,'继续听');assert.equal(result.answers.relevance.top,'4');
    const expected=Math.exp((Math.log(.75)-.0004479771596379578)/1.0022178236691426)/(Math.exp((Math.log(.25)+.00044773018453270197)/1.0022178236691426)+Math.exp((Math.log(.75)-.0004479771596379578)/1.0022178236691426));
    assert.ok(Math.abs(result.answers.responding.value-expected)<1e-10);
    assert.equal(seen.length,3);for(const body of seen){assert.equal(body.n_predict,1);assert.equal(body.lora[0].scale,1);assert.equal(body.temperature,1);assert.ok(body.logit_bias.every((pair:number[])=>pair[1]===100));}
  }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});


test('remote JEV engine answers a Chinese live state with the adapter active', {skip:!process.env.CUEX_S1_REMOTE_TEST_URL}, async()=>{
  const client=new LlamaSystemOne({baseUrl:process.env.CUEX_S1_REMOTE_TEST_URL,promptFormat:'jev-v1',timeoutMs:30000,loraScale:1});
  assert.equal((await client.health()).ok,true);
  const result=await client.decide(encodeSystemOneState({concernId:'concern-scope',concern:'适用范围',unresolvedPointIds:['c1','c2','c3'],repSpeechSinceConcern:'我先回答您的人群问题，75岁以上的具体亚组数据我接下来说明。',recentSpeech:'我先回答您的人群问题，75岁以上的具体亚组数据我接下来说明。'}),{responding:{kind:'noul',question:'代表最近的话是否正在回应医生的人群关切？明确表示马上回答也算回应。'},resolved_c1:{kind:'noul',question:'代表是否已经实质给出75岁以上亚组的比例或研究结果？仅表示接下来说明不算实质回答。'}});
  assert.equal(result.answers.responding.top,'true');assert.equal(result.answers.resolved_c1.top,'false');
});


test('fallback keeps an earlier answer when later speech exceeds the neural 120-character window',async()=>{
  const server=await fakeLlama(true);
  const engine=new FallbackSystemOne(new LlamaSystemOne({baseUrl:server.url,timeoutMs:30}),new HeuristicSystemOne(ANSHU_PACK));
  const h=await session(engine);
  try{
    await h.speech('75岁以上约占11%，降压幅度与总体一致。'+ '主要终点是12周收缩压，研究结果与总体一致。'.repeat(8),true);
    assert(h.gateway.inspectSessions()[0].resolvedPointIds.includes('c1'));
    await h.speech('eGFR30到60亚组有412人，结果与总体一致。',true);
    await h.speech('eGFR低于30被排除，没有证据，说明书不建议使用。',true);
    await h.wait(e=>e.type==='controller.dispatch'&&e.payload.concernProgress.concernId==='concern-dose');
  }finally{await h.close();await server.close();}
});


test('remote JEV gateway visit prepares on a continued pitch and withdraws on an answering promise', {skip:!process.env.CUEX_S1_REMOTE_TEST_URL}, async()=>{
  const engine=new LlamaSystemOne({baseUrl:process.env.CUEX_S1_REMOTE_TEST_URL,promptFormat:'jev-v1',timeoutMs:1460,loraScale:1});
  const h=await session(engine);
  try{
    await h.speech('主要终点是12周收缩压，多降6.2毫米汞柱，');
    await h.speech('而且不良反应率与安慰剂相当，另有上市后真实世界研究的疗效结果，');
    await h.wait(e=>e.type==='system2.candidate'&&e.payload.candidate.phase==='ready');
    await h.speech('我先回答您的人群问题，');
    await h.wait(e=>e.type==='system2.candidate'&&e.payload.candidate.phase==='withdrawn');
    assert(!h.events.some(e=>e.type==='system2.candidate'&&e.payload.candidate.phase==='spoken'));
    assert.deepEqual(h.gateway.inspectSessions()[0].resolvedPointIds,[]);
  }finally{await h.close();}
});


test('remote JEV gateway interrupts a continued pitch without waiting for final speech', {skip:!process.env.CUEX_S1_REMOTE_TEST_URL}, async()=>{
  const h=await session(new LlamaSystemOne({baseUrl:process.env.CUEX_S1_REMOTE_TEST_URL,timeoutMs:1460}));
  try{
    await h.speech('主要终点是12周收缩压，多降6.2毫米汞柱，');
    await h.speech('而且不良反应率与安慰剂相当，另有上市后真实世界研究的疗效结果，');
    await h.wait(e=>e.type==='system2.candidate'&&e.payload.candidate.phase==='spoken');
    assert.equal(h.gateway.inspectSessions()[0].candidates[0].fate,'asked');
    assert(h.events.some(e=>e.type==='controller.dispatch'&&e.payload.action.type==='interrupt_speak'));
  }finally{await h.close();}
});

test('remote JEV gateway listens to subgroup answers and advances without a follow-up', {skip:!process.env.CUEX_S1_REMOTE_TEST_URL}, async()=>{
  const h=await session(new LlamaSystemOne({baseUrl:process.env.CUEX_S1_REMOTE_TEST_URL,timeoutMs:1460}));
  try{
    await h.speech('75岁以上约占11%，降压幅度与总体一致。',true);
    await h.speech('eGFR30到60亚组有412人，结果与总体一致。',true);
    await h.speech('eGFR低于30被排除，没有证据，说明书不建议使用。',true);
    await h.wait(e=>e.type==='controller.dispatch'&&e.payload.concernProgress.concernId==='concern-dose');
    assert.equal(h.gateway.inspectSessions()[0].candidates.length,0);
  }finally{await h.close();}
});
