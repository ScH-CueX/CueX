import {Cinematic45, CINEMA_SHOTS, CINEMA_UNITS, CINEMA_VOICE, CINEMA_SFX, CINEMA_TOTAL} from './cinema/Cinematic45';
import {loadFonts} from './fonts';
import {NarrationCaptions} from './cinema/NarrationCaptions';

loadFonts();
export const WORKBENCH={
  name:'CueX · Cinematic 45',fps:30,width:1920,height:1080,total:CINEMA_TOTAL,
  background:'#ECEDE7',revision:'cinematic-light-captions-3',
  shots:CINEMA_SHOTS.map(s=>({id:s.id,label:s.label,from:s.from,duration:s.duration,component:CINEMA_UNITS[s.id]})),
  transitions:[],captions:[{id:'narration-captions',label:'旁白字幕',from:0,duration:CINEMA_TOTAL,component:NarrationCaptions,props:{fontSize:44,bottom:48,backgroundOpacity:.58},schema:[{type:'number',key:'fontSize',label:'字幕字号',min:36,max:64,step:1,default:44},{type:'number',key:'bottom',label:'底部留白',min:32,max:90,step:1,default:48},{type:'slider',key:'backgroundOpacity',label:'底框不透明度',min:0,max:1,step:.01,default:.58}]}],overlays:[],
  sfx:[...CINEMA_VOICE,...CINEMA_SFX],
  bgm:[{from:0,duration:CINEMA_TOTAL,src:'audio/cinematic/bed45.wav',volume:.15}],
  order:['captions'],original:Cinematic45,
};
