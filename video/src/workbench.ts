import {Demo45, SHOT_COMPONENTS, Caption, DEMO_VOICE, DEMO_CAPTIONS} from './demo/Demo45';
import {DEMO_SHOTS, DEMO_TOTAL, DEMO_FPS} from './content/demo45';
import {loadFonts} from './fonts';

loadFonts();

export const WORKBENCH = {
  name:'CueX · 45秒产品演示',fps:DEMO_FPS,width:1920,height:1080,total:DEMO_TOTAL,
  background:'#ecede8',revision:'demo45-v1',
  shots:DEMO_SHOTS.map(s=>({id:s.id,label:s.title,from:s.from,duration:s.duration,component:SHOT_COMPONENTS[s.id]})),
  transitions:[],overlays:[],
  captions:DEMO_CAPTIONS.map(s=>({id:`caption-${s.id}`,label:s.title,from:s.from,duration:s.duration,component:Caption,props:{text:s.title},schema:[{type:'textarea',key:'text',label:'文案',default:s.title}]})),
  sfx:DEMO_VOICE,
  bgm:[],order:['captions'],original:Demo45,
};
