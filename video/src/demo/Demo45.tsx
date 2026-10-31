import React from 'react';
import {AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {CueXMark} from '../components/CueXMark';
import {DEMO_SHOTS, DEMO_TOTAL, type DemoShotId} from '../content/demo45';
import {FONT, ramp} from '../theme';
import {PageCam, type CamKey} from './PageCam';

const EASE = Easing.bezier(0.55, 0, 0.18, 1);
const GROUND = '#ecede8';

export const Caption: React.FC<{text?: string}> = ({text = ''}) => {
  const f=useCurrentFrame();
  return <div style={{position:'absolute',left:0,right:0,bottom:0,height:155,background:'#141716',padding:'32px 76px',display:'flex',alignItems:'center'}}>
    <div style={{fontFamily:FONT.sans,fontSize:60,lineHeight:1.35,fontWeight:600,color:'#f6f6f2',opacity:ramp(f,0,15),transform:`translateY(${(1-ramp(f,0,21))*12}px)`}}>{text}</div>
  </div>;
};

const SourceLabel: React.FC<{home?: boolean}> = ({home=false}) => <div style={{position:'absolute',right:44,top:25,padding:'10px 16px',background:'#f6f6f2',color:'#4a504d',fontFamily:FONT.sans,fontSize:32,fontWeight:500}}>{home ? '实际产品界面' : '演示回放 · 虚构资料'}</div>;

export const ProblemShot: React.FC = () => <AbsoluteFill>
  <PageCam src="captures/home.png" pageH={2573} keys={[
    {frame:0,cx:960,cy:475,zoom:1.04},
    {frame:135,cx:960,cy:450,zoom:1.13},
    {frame:164,cx:960,cy:450,zoom:1.13},
  ]}/><SourceLabel home />
</AbsoluteFill>;

export const EnterShot: React.FC = () => <AbsoluteFill>
  <PageCam src="captures/live-holding.png" pageH={1420} keys={[
    {frame:0,cx:960,cy:550,zoom:0.94},
    {frame:45,cx:1005,cy:520,zoom:1.08},
    {frame:160,cx:1020,cy:500,zoom:1.13},
    {frame:194,cx:1020,cy:500,zoom:1.13},
  ]}/><SourceLabel />
</AbsoluteFill>;

function cameraAt(frame: number, keys: CamKey[]) {
  let a=keys[0], b=keys[keys.length-1];
  for(let i=0;i<keys.length-1;i++)if(frame>=keys[i].frame&&frame<=keys[i+1].frame){a=keys[i];b=keys[i+1];break;}
  const p=interpolate(frame,[a.frame,b.frame],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:EASE});
  return {cx:a.cx+(b.cx-a.cx)*p,cy:a.cy+(b.cy-a.cy)*p,zoom:a.zoom+(b.zoom-a.zoom)*p};
}

const Recording: React.FC<{src: string; keys: CamKey[]}> = ({src,keys}) => {
  const f=useCurrentFrame();const cam=cameraAt(f,keys);
  return <AbsoluteFill style={{background:GROUND,overflow:'hidden'}}>
    <div style={{position:'absolute',width:1920,height:1080,transformOrigin:'0 0',transform:`translate(${960-cam.cx*cam.zoom}px,${540-cam.cy*cam.zoom}px) scale(${cam.zoom})`}}>
      <OffthreadVideo src={staticFile(src)} muted style={{width:1920,height:1080}} />
    </div>
    <SourceLabel />
  </AbsoluteFill>;
};

export const InterruptShot: React.FC = () => <Recording src="captures/live-interrupt.mp4" keys={[
  {frame:0,cx:1030,cy:520,zoom:1.08},
  {frame:95,cx:1030,cy:520,zoom:1.08},
  {frame:135,cx:1300,cy:490,zoom:1.48},
  {frame:239,cx:1300,cy:490,zoom:1.48},
]} />;

export const WithdrawShot: React.FC = () => {
  const f=useCurrentFrame();
  return <AbsoluteFill style={{background:GROUND}}>
    <Recording src="captures/live-withdraw.mp4" keys={[
      {frame:0,cx:1020,cy:530,zoom:1.08},
      {frame:269,cx:1020,cy:530,zoom:1.08},
    ]}/>
    {f>=170&&<AbsoluteFill style={{background:GROUND,opacity:ramp(f,170,190)}}>
      <div style={{position:'absolute',left:115,top:155,fontFamily:FONT.sans,fontWeight:600,fontSize:72,color:'#141716'}}>已经准备好，也可以不说。</div>
      <div style={{position:'absolute',left:105,top:345,width:1710,height:395,overflow:'hidden'}}>
        <Img src={staticFile('captures/live-withdrawn-decisions.png')} style={{position:'absolute',width:3420,maxWidth:'none',left:-1710,top:0}}/>
      </div>
      <SourceLabel />
    </AbsoluteFill>}
  </AbsoluteFill>;
};

export const ReviewShot: React.FC = () => <AbsoluteFill>
  <PageCam src="captures/review.png" pageH={1981} ease={EASE} keys={[
    {frame:0,cx:960,cy:530,zoom:1.0},
    {frame:70,cx:960,cy:530,zoom:1.0},
    {frame:110,cx:1125,cy:750,zoom:1.3},
    {frame:170,cx:1125,cy:750,zoom:1.3},
    {frame:215,cx:1280,cy:1320,zoom:1.25},
    {frame:299,cx:1280,cy:1320,zoom:1.25},
  ]}/><SourceLabel />
</AbsoluteFill>;

export const BrandShot: React.FC<{tagline?:string}> = ({tagline='让每一次临场应对，都有准备。'}) => {
  const f=useCurrentFrame();
  return <AbsoluteFill style={{background:'#07080b',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:FONT.sans}}>
    <div style={{display:'flex',alignItems:'center',flexDirection:'column',gap:38,transform:'translateY(-24px)'}}>
      <CueXMark frame={f} start={5} size={240}/>
      <div style={{fontSize:60,color:'#ece8df',opacity:ramp(f,38,66)}}>{tagline}</div>
      <div style={{fontSize:34,color:'#b9b5ac',opacity:ramp(f,54,78)}}>记性好了一点　　AI + 医疗健康</div>
    </div>
  </AbsoluteFill>;
};

export const SHOT_COMPONENTS: Record<DemoShotId,React.FC> = {problem:ProblemShot,enter:EnterShot,interrupt:InterruptShot,withdraw:WithdrawShot,review:ReviewShot,brand:BrandShot};
export const DEMO_VOICE = DEMO_SHOTS.map(s=>({from:s.from+8,duration:s.duration-8,src:`audio/narration/${s.id}.wav`,volume:1}));
export const DEMO_CAPTIONS = DEMO_SHOTS.filter(s=>s.id!=='brand');

export const Demo45: React.FC<{voice?:boolean}> = ({voice=true}) => <AbsoluteFill style={{background:GROUND}}>
  {DEMO_SHOTS.map(s=>{const Shot=SHOT_COMPONENTS[s.id];return <Sequence key={s.id} from={s.from} durationInFrames={s.duration}><Shot/></Sequence>;})}
  {DEMO_CAPTIONS.map(s=><Sequence key={s.id} from={s.from} durationInFrames={s.duration}><Caption text={s.title}/></Sequence>)}
  {voice&&DEMO_VOICE.map(v=><Sequence key={v.src} from={v.from} durationInFrames={v.duration}><Audio src={staticFile(v.src)} volume={v.volume}/></Sequence>)}
</AbsoluteFill>;

export {DEMO_TOTAL};
