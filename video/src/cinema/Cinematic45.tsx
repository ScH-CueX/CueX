import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Backdrop, Grain} from '../components/Backdrop';
import {RevealText} from '../components/RevealText';
import {TextParticles} from '../components/TextParticles';
import {ConversationLine} from '../scenes/Prologue';
import {ArchField, type ArchBeats} from '../three/ArchField';
import {cameraPose, FOV, project, type Vec} from '../three/camera';
import {DimensionalX} from '../three/DimensionalX';
import {C, EASE, FONT, H, W, mix, ramp} from '../theme';

export const CINEMA_TOTAL=1350;
export const CINEMA_SHOTS=[
  {id:'opening',from:0,duration:150,label:'对话改变方向',voice:'problem'},
  {id:'conversation',from:150,duration:270,label:'让对话跟着你改变',voice:'enter'},
  {id:'parallel',from:420,duration:210,label:'判断与准备同时发生',voice:'interrupt'},
  {id:'withdraw',from:630,duration:300,label:'一句不必说出的追问',voice:'withdraw'},
  {id:'practice',from:930,duration:240,label:'回到这一刻',voice:'review'},
  {id:'brand',from:1170,duration:180,label:'CueX',voice:'brand'},
] as const;
type ShotId=typeof CINEMA_SHOTS[number]['id'];

const BrandCorner: React.FC=()=> <div style={{position:'absolute',zIndex:20,left:64,top:38,fontFamily:FONT.display,color:C.paper,fontSize:42,display:'flex',alignItems:'baseline',gap:4}}>Cue<Img src={staticFile('brand/cuex-symbol-dimensional.svg')} style={{width:30,height:30}}/></div>;

const Plane:React.FC<{src?:string;video?:string;frame:number;shift?:number;scale?:number;opacity?:number;offsetY?:number}>=({src,video,frame,shift=0,scale=.66,opacity=1,offsetY=30})=>{
  const p=ramp(frame,0,42,EASE.inOut);
  return <div style={{position:'absolute',zIndex:0,inset:0,perspective:1800,perspectiveOrigin:'50% 50%',opacity,clipPath:'inset(180px 36px 120px 36px)'}}>
    <div style={{position:'absolute',width:1920,height:1080,overflow:'hidden',borderRadius:12,background:'#ecede8',transformOrigin:'50% 50%',transform:`translate(${shift}px,${offsetY+(1-p)*70}px) rotateY(${mix(-7,-2,p)}deg) rotateX(${mix(5,0,p)}deg) scale(${scale})`,boxShadow:'0 38px 90px rgba(0,0,0,.34)'}}>
      {src?<Img src={staticFile(src)} style={{width:1920,maxWidth:'none'}}/>:null}
      {video?<OffthreadVideo src={staticFile(video)} muted style={{width:1920,height:1080}}/>:null}
    </div>
  </div>;
};

export const Opening:React.FC=()=>{
  const f=useCurrentFrame();
  return <AbsoluteFill>
    <ConversationLine frame={f*1.25}/>
    <div style={{position:'absolute',left:0,right:0,top:285,textAlign:'center'}}>
      <RevealText text="对话，不会按准备稿来。" frame={f} start={8} stagger={1.4} style={{fontFamily:FONT.serif,fontSize:88,fontWeight:600,color:C.paper}}/>
      <div style={{fontFamily:FONT.display,fontSize:118,color:C.paper,marginTop:28,opacity:ramp(f,45,72),display:'flex',alignItems:'baseline',justifyContent:'center',gap:4}}>Cue<Img src={staticFile('brand/cuex-symbol-dimensional.svg')} style={{width:84,height:84}}/></div>
      <div style={{fontFamily:FONT.serif,fontSize:38,color:C.soft,marginTop:12,opacity:ramp(f,65,90)}}>医药代表的临场应对训练</div>
    </div>
  </AbsoluteFill>;
};

export const Conversation:React.FC=()=>{
  const f=useCurrentFrame();const emphasis=ramp(f,125,155,EASE.inOut);
  return <AbsoluteFill>
    {f<60?<Plane src="captures/live-listening.png" frame={f}/>:<Sequence from={60} style={{zIndex:0}}><Plane video="captures/live-interrupt.mp4" frame={100} shift={-505*emphasis} scale={mix(.66,.38,emphasis)} opacity={mix(1,.9,emphasis)}/></Sequence>}
    <div style={{position:'absolute',zIndex:10,left:140,top:80,fontFamily:FONT.serif,fontSize:64,color:f<155?C.paper:C.cue,opacity:ramp(f,10,30)}}>{f<155?'继续听。':'追问。'}</div>
    {f>=160?<div style={{position:'absolute',zIndex:10,left:900,top:365,right:90,padding:'25px 0'}}>
      <RevealText text="“先停一下。”" frame={f} start={160} stagger={.2} style={{fontFamily:FONT.serif,fontSize:82,color:C.paper,fontWeight:600}}/>
      <div style={{height:2,background:C.cue,width:780*ramp(f,160,180),margin:'26px 0'}}/>
      <RevealText text="结论能用在他们身上吗？" frame={f} start={175} stagger={.15} style={{fontFamily:FONT.serif,fontSize:60,color:C.paper}}/>
    </div>:null}
  </AbsoluteFill>;
};

const FLOW_BEATS:ArchBeats={aFrom:48,aGate:96,bFrom:108,bStop:151,bGone:190};
const FlowLabel:React.FC<{frame:number;anchor:Vec;text:string;sub:string;color:string;dx?:number;dy?:number}>=({frame,anchor,text,sub,color,dx=0,dy=0})=>{
  const [x,y]=project(frame,210,anchor);
  return <div style={{position:'absolute',zIndex:5,left:x+dx,top:y+dy,fontFamily:FONT.serif,color,opacity:ramp(frame,14,40),whiteSpace:'nowrap'}}><div style={{fontSize:56,fontFamily:FONT.display}}>{text}</div><div style={{fontSize:38,color:C.paper,marginTop:10}}>{sub}</div></div>;
};
export const Parallel:React.FC=()=>{
  const f=useCurrentFrame();const start=cameraPose(0,210);
  return <AbsoluteFill>
    <ThreeCanvas width={W} height={H} dpr={1} linear flat gl={{antialias:true,alpha:true}} camera={{fov:FOV,near:.1,far:100,position:start.pos}}><ArchField frame={f} dur={210} beats={FLOW_BEATS}/></ThreeCanvas>
    <div style={{position:'absolute',left:0,right:0,top:100,textAlign:'center',fontFamily:FONT.serif,fontSize:68,color:C.paper}}>同时发生。</div>
    <FlowLabel frame={f} anchor={[-.8,1.45,0]} dx={-240} dy={-160} text="System 1" sub="判断" color={C.cue}/>
    <FlowLabel frame={f} anchor={[-.2,-1.5,0]} dx={55} dy={65} text="System 2" sub="准备" color={C.deep}/>
    <FlowLabel frame={f} anchor={[3.6,.2,0]} dx={-20} dy={-160} text="" sub="输出前复核" color={C.paper}/>
  </AbsoluteFill>;
};

export const Withdrawal:React.FC=()=>{
  const f=useCurrentFrame();const lift=ramp(f,40,70,EASE.inOut);const dissolve=ramp(f,170,245,EASE.inOut);const relay=ramp(f,140,170,EASE.inOut);
  // Frozen with the captures: apps/web/src/lib/scenario.ts, candidate k2.
  const quote='那 eGFR 低于 30 的呢？这部分患者能用吗？';
  return <AbsoluteFill>
    <Plane src={f<132?'captures/live-ready.png':'captures/live-answered.png'} frame={100} shift={-505*lift} scale={mix(.66,.37,lift)} opacity={mix(1,.9,lift)}/>
    <div style={{position:'absolute',zIndex:10,left:128,top:825,fontFamily:FONT.serif,fontSize:56,color:C.ok,opacity:ramp(f,112,132)}}>“这部分目前没有证据。”</div>
    <svg width={1920} height={1080} style={{position:'absolute',zIndex:9,inset:0,opacity:ramp(f,132,142)*(1-ramp(f,185,205))}}>
      <path d="M 650 813 Q 825 780 902 530" fill="none" stroke={C.ok} strokeOpacity=".38" strokeWidth="2"/>
      <circle cx={mix(650,902,relay)} cy={813-283*relay*relay} r="7" fill={C.ok}/>
    </svg>
    <div style={{position:'absolute',zIndex:10,left:900,top:260,opacity:ramp(f,72,85)}}>
      <div style={{fontFamily:FONT.serif,fontSize:38,color:f<170?C.deep:C.ok,marginBottom:38}}>{f<170?'已准备，未说出':'撤销追问'}</div>
      <TextParticles lines={quote.match(/[^？]+？/g) ?? [quote]} fontSize={68} weight={600} family={FONT.serif} lineHeight={1.55} width={950} color={C.paper} progress={dissolve}/>
      <div style={{fontFamily:FONT.serif,fontSize:76,color:C.ok,marginTop:18,opacity:ramp(f,250,270)}}>继续听。</div>
    </div>
  </AbsoluteFill>;
};

export const Practice:React.FC=()=>{
  const f=useCurrentFrame();const swap=ramp(f,118,162,EASE.inOut);const travel=ramp(f,105,170,EASE.inOut);
  return <AbsoluteFill>
    <div style={{position:'absolute',zIndex:0,inset:0,opacity:1-swap}}><Plane src="captures/review.png" frame={f} scale={.62} offsetY={0}/></div>
    <div style={{position:'absolute',zIndex:0,inset:0,opacity:swap,transform:`translateX(${(1-swap)*160}px)`}}><Plane src="captures/live-cue-amber.png" frame={100} scale={.62} offsetY={0}/></div>
    <div style={{position:'absolute',zIndex:10,left:160,top:725,width:1600,opacity:ramp(f,16,32)*(1-swap)}}>
      <Img src={staticFile('captures/review-timeline.png')} style={{width:1600,height:95,clipPath:'inset(0 0 0 12%)'}}/>
      <div style={{position:'absolute',right:90,top:-68,fontFamily:FONT.serif,fontSize:44,color:C.ok}}>0:55 · 主动补正</div>
    </div>
    <div style={{position:'absolute',zIndex:11,left:mix(1452,405,travel)-8,top:mix(807,250,travel)-8,width:16,height:16,borderRadius:'50%',background:C.ok,boxShadow:`0 0 ${18+18*travel}px ${7*travel}px ${C.ok}`,opacity:ramp(f,30,45)*(1-ramp(f,174,198))}}/>
    <div style={{position:'absolute',zIndex:10,left:140,top:80,fontFamily:FONT.serif,fontSize:68,color:C.paper}}>{f<135?'回到这一刻。':'再练一次。'}</div>
    <div style={{position:'absolute',zIndex:10,left:140,bottom:120,fontFamily:FONT.serif,fontSize:62,color:C.paper,opacity:ramp(f,174,200)}}>少一点提示。</div>
  </AbsoluteFill>;
};

export const CinematicBrand:React.FC=()=>{
  const f=useCurrentFrame();return <AbsoluteFill style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',transform:'translateY(-25px)'}}>
      <div style={{display:'flex',alignItems:'center',height:400,opacity:ramp(f,0,20)}}>
        <span style={{fontFamily:FONT.display,fontSize:270,lineHeight:1,color:C.paper}}>Cue</span>
        <div style={{position:'relative',width:250,height:400}}><div style={{position:'absolute',left:-75}}><DimensionalX frame={f} width={400} height={400}/></div></div>
      </div>
      <div style={{fontFamily:FONT.serif,fontSize:62,color:C.paper,opacity:ramp(f,68,92)}}>让每一次临场应对，都有准备。</div>
      <div style={{fontFamily:FONT.serif,fontSize:34,color:C.soft,marginTop:34,opacity:ramp(f,86,108)}}>记性好了一点　 AI + 医疗健康</div>
    </div>
  </AbsoluteFill>;
};

export const CINEMA_COMPONENTS:Record<ShotId,React.FC>={opening:Opening,conversation:Conversation,parallel:Parallel,withdraw:Withdrawal,practice:Practice,brand:CinematicBrand};
export const CINEMA_UNITS=Object.fromEntries(CINEMA_SHOTS.map(shot=>{
  const Content=CINEMA_COMPONENTS[shot.id];
  const Unit:React.FC=()=>{
    const globalFrame=shot.from+useCurrentFrame();
    return <AbsoluteFill><Backdrop intensity={.8} frame={globalFrame}/><Content/>{shot.id!=='brand'?<BrandCorner/>:null}<Grain opacity={.025} frame={globalFrame}/></AbsoluteFill>;
  };
  return [shot.id,Unit];
})) as Record<ShotId,React.FC>;
export const CINEMA_VOICE=CINEMA_SHOTS.map(s=>({from:s.from+8,duration:s.duration-8,src:`audio/narration/${s.voice}.wav`,volume:1}));
// Source energy peak is 0.875s; align it to the page settling / quote release.
export const CINEMA_SFX=[
  {from:CINEMA_SHOTS[1].from+42-26,duration:74,src:'audio/cinematic/whoosh.wav',volume:.42},
  {from:CINEMA_SHOTS[3].from+170-26,duration:74,src:'audio/cinematic/whoosh.wav',volume:.34},
];
export const Cinematic45:React.FC<{bgm?:boolean;voice?:boolean}>=({bgm=true,voice=true})=>{
  return <AbsoluteFill>
    {CINEMA_SHOTS.map(s=>{const Shot=CINEMA_UNITS[s.id];return <Sequence key={s.id} from={s.from} durationInFrames={s.duration}><Shot/></Sequence>;})}
    {voice?CINEMA_VOICE.map(v=><Sequence key={v.src} from={v.from} durationInFrames={v.duration}><Audio src={staticFile(v.src)} volume={v.volume}/></Sequence>):null}
    {CINEMA_SFX.map(s=><Sequence key={s.from} from={s.from} durationInFrames={s.duration}><Audio src={staticFile(s.src)} volume={s.volume}/></Sequence>)}
    {bgm?<Audio src={staticFile('audio/cinematic/bed45.wav')} volume={.15}/>:null}
  </AbsoluteFill>;
};
