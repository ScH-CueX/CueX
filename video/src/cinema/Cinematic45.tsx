import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Backdrop, Grain} from '../components/Backdrop';
import {RevealText} from '../components/RevealText';
import {TextParticles, wrapLines} from '../components/TextParticles';
import {ConversationLine} from '../scenes/Prologue';
import {ArchField, type ArchBeats} from '../three/ArchField';
import {cameraPose, FOV, project, type Vec} from '../three/camera';
import {DimensionalX} from '../three/DimensionalX';
import {C, EASE, FONT, H, W, mix, ramp} from '../theme';
import {CANDIDATES} from '../../../apps/web/src/lib/scenario';

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

const Provenance: React.FC=()=> <div style={{position:'absolute',right:60,bottom:36,fontFamily:FONT.serif,fontSize:32,color:C.soft}}>演示回放 · 虚构资料</div>;
const BrandCorner: React.FC=()=> <div style={{position:'absolute',left:64,top:38,fontFamily:FONT.display,color:C.paper,fontSize:42,display:'flex',alignItems:'baseline',gap:4}}>Cue<Img src={staticFile('brand/cuex-symbol-dimensional.svg')} style={{width:30,height:30}}/></div>;

const Plane:React.FC<{src?:string;video?:string;frame:number;shift?:number;scale?:number;opacity?:number}>=({src,video,frame,shift=0,scale=.8,opacity=1})=>{
  const p=ramp(frame,0,42,EASE.inOut);
  return <div style={{position:'absolute',inset:0,perspective:1800,perspectiveOrigin:'50% 50%',opacity}}>
    <div style={{position:'absolute',width:1920,height:1080,overflow:'hidden',borderRadius:12,background:'#ecede8',transformOrigin:'50% 50%',transform:`translate(${shift}px,${(1-p)*100}px) rotateY(${mix(-9,-2,p)}deg) rotateX(${mix(7,0,p)}deg) scale(${scale})`,boxShadow:'0 38px 90px rgba(0,0,0,.34)'}}>
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
  const f=useCurrentFrame();const emphasis=ramp(f,155,190,EASE.inOut);
  return <AbsoluteFill>
    {f<60?<Plane src="captures/live-listening.png" frame={f}/>:<Sequence from={60}><Plane video="captures/live-interrupt.mp4" frame={100} shift={-230*emphasis} scale={mix(.8,.69,emphasis)} opacity={mix(1,.38,emphasis)}/></Sequence>}
    <div style={{position:'absolute',left:140,top:80,fontFamily:FONT.serif,fontSize:64,color:f<155?C.paper:C.cue,opacity:ramp(f,10,30)}}>{f<155?'继续听。':'追问。'}</div>
    {f>=155?<div style={{position:'absolute',left:870,top:365,right:90,padding:'25px 0',background:'rgba(7,8,11,.86)'}}>
      <RevealText text="“先停一下。”" frame={f} start={164} stagger={2} style={{fontFamily:FONT.serif,fontSize:82,color:C.paper,fontWeight:600}}/>
      <div style={{height:2,background:C.cue,width:780*ramp(f,160,180),margin:'26px 0'}}/>
      <RevealText text="结论能用在他们身上吗？" frame={f} start={185} stagger={1.2} style={{fontFamily:FONT.serif,fontSize:60,color:C.paper}}/>
    </div>:null}
    <Provenance/>
  </AbsoluteFill>;
};

const FLOW_BEATS:ArchBeats={aFrom:48,aGate:96,bFrom:108,bStop:151,bGone:190};
const FlowLabel:React.FC<{frame:number;anchor:Vec;text:string;sub:string;color:string;dx?:number;dy?:number}>=({frame,anchor,text,sub,color,dx=0,dy=0})=>{
  const [x,y]=project(frame,210,anchor);
  return <div style={{position:'absolute',left:x+dx,top:y+dy,fontFamily:FONT.serif,color,opacity:ramp(frame,14,40),whiteSpace:'nowrap'}}><div style={{fontSize:56,fontFamily:FONT.display}}>{text}</div><div style={{fontSize:38,color:C.paper,marginTop:10}}>{sub}</div></div>;
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
  const f=useCurrentFrame();const lift=ramp(f,40,85,EASE.inOut);const dissolve=ramp(f,145,224,EASE.inOut);
  const quote=CANDIDATES[1].text;
  return <AbsoluteFill>
    <Plane src={f<145?'captures/live-ready.png':'captures/live-cue-green.png'} frame={100} shift={-370*lift} scale={mix(.8,.57,lift)} opacity={mix(1,.3,lift)}/>
    <div style={{position:'absolute',right:0,top:0,width:1100,height:1080,background:'linear-gradient(90deg, transparent, rgba(7,8,11,.94) 32%)',opacity:lift}}/>
    <div style={{position:'absolute',left:900,top:260,opacity:lift}}>
      <div style={{fontFamily:FONT.serif,fontSize:38,color:f<145?C.deep:C.ok,marginBottom:38}}>{f<145?'已准备，未说出':'你已经回答'}</div>
      <TextParticles lines={wrapLines(quote,14)} fontSize={68} weight={600} family={FONT.serif} lineHeight={1.55} width={950} color={C.paper} progress={dissolve}/>
      <div style={{fontFamily:FONT.serif,fontSize:76,color:C.ok,marginTop:18,opacity:ramp(f,228,254)}}>继续听。</div>
    </div>
    <Provenance/>
  </AbsoluteFill>;
};

export const Practice:React.FC=()=>{
  const f=useCurrentFrame();const swap=ramp(f,118,162,EASE.inOut);
  return <AbsoluteFill>
    <div style={{position:'absolute',inset:0,opacity:1-swap}}><Plane src="captures/review.png" frame={f} scale={.84}/></div>
    <div style={{position:'absolute',inset:0,opacity:swap,transform:`translateX(${(1-swap)*160}px)`}}><Plane src="captures/live-cue-amber.png" frame={100} scale={.80}/></div>
    <div style={{position:'absolute',left:140,top:80,fontFamily:FONT.serif,fontSize:68,color:C.paper}}>{f<135?'回到这一刻。':'少一点提示。'}</div>
    <div style={{position:'absolute',left:140,bottom:120,fontFamily:FONT.serif,fontSize:62,color:C.paper,opacity:ramp(f,174,200)}}>多一次自己的应对。</div>
    <Provenance/>
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
export const CINEMA_VOICE=CINEMA_SHOTS.map(s=>({from:s.from+8,duration:s.duration-8,src:`audio/narration/${s.voice}.wav`,volume:1}));
export const Cinematic45:React.FC<{bgm?:boolean;voice?:boolean}>=({bgm=true,voice=true})=>{
  const f=useCurrentFrame();
  return <AbsoluteFill>
    <Backdrop intensity={.8}/>
    {CINEMA_SHOTS.map(s=>{const Shot=CINEMA_COMPONENTS[s.id];return <Sequence key={s.id} from={s.from} durationInFrames={s.duration}><Shot/></Sequence>;})}
    {f<1170?<BrandCorner/>:null}
    <Grain opacity={.025}/>
    {voice?CINEMA_VOICE.map(v=><Sequence key={v.src} from={v.from} durationInFrames={v.duration}><Audio src={staticFile(v.src)} volume={v.volume}/></Sequence>):null}
    {bgm?<Audio src={staticFile('audio/music/bed.wav')} volume={.15*ramp(f,0,45)*(1-ramp(f,1300,1350))}/>:null}
  </AbsoluteFill>;
};
