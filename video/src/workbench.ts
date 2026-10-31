import {Cinematic45, CINEMA_SHOTS, CINEMA_UNITS, CINEMA_VOICE, CINEMA_SFX, CINEMA_TOTAL} from './cinema/Cinematic45';
import {loadFonts} from './fonts';

loadFonts();
export const WORKBENCH={
  name:'CueX · Cinematic 45',fps:30,width:1920,height:1080,total:CINEMA_TOTAL,
  background:'#ECEDE7',revision:'cinematic-light-1',
  shots:CINEMA_SHOTS.map(s=>({id:s.id,label:s.label,from:s.from,duration:s.duration,component:CINEMA_UNITS[s.id]})),
  transitions:[],captions:[],overlays:[],
  sfx:[...CINEMA_VOICE,...CINEMA_SFX],
  bgm:[{from:0,duration:CINEMA_TOTAL,src:'audio/cinematic/bed45.wav',volume:.15}],
  order:[],original:Cinematic45,
};
