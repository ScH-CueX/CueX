const base = (process.env.CUEX_S1_URL ?? 'http://127.0.0.1:18080').replace(/\/(?:v1\/?)?$/, '');
const times:number[]=[];
for(let i=0;i<20;i++){
  const start=performance.now();
  const response=await fetch(`${base}/health`,{signal:AbortSignal.timeout(10000)});
  await response.arrayBuffer();
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  if(i)times.push(performance.now()-start);
}
times.sort((a,b)=>a-b);
console.log(JSON.stringify({url:base,samples:times.length,httpRttP50Ms:times[Math.ceil(times.length*.5)-1],httpRttP95Ms:times[Math.ceil(times.length*.95)-1]},null,2));
