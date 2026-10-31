import {useCurrentFrame} from 'remotion';
import {useAssetJson} from '../assets/useAssetJson';
import {FONT,ramp,EASE} from '../theme';

type CaptionFile={fps:number;cues:{id:string;from:number;to:number;text:string}[]};
export function NarrationCaptions({fontSize=44,bottom=48,color='#F7F6F2',backgroundOpacity=.58}:{fontSize?:number;bottom?:number;color?:string;backgroundOpacity?:number}){
  const frame=useCurrentFrame();
  const data=useAssetJson<CaptionFile>('captions/cinematic45.json');
  const cue=data?.cues.find(caption=>frame>=caption.from&&frame<caption.to);
  if(!cue)return null;
  const opacity=ramp(frame,cue.from,cue.from+3,EASE.linear)*(1-ramp(frame,cue.to-3,cue.to,EASE.linear));
  return <div data-narration-caption={cue.id} style={{position:'absolute',left:80,right:80,bottom,zIndex:40,pointerEvents:'none',display:'flex',justifyContent:'center',opacity}}>
    <span style={{fontFamily:FONT.serif,fontSize,fontWeight:500,lineHeight:1.35,color,whiteSpace:'nowrap',padding:'7px 18px',background:`rgba(0,0,0,${backgroundOpacity})`,borderRadius:4,textShadow:'0 2px 3px rgba(0,0,0,.72)',WebkitTextStroke:'0.6px rgba(0,0,0,.55)',paintOrder:'stroke fill'}}>{cue.text}</span>
  </div>;
}
