import {useEffect, useRef, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';

/** Load shared asset metadata through the same public root in Studio and workbench. */
export function useAssetJson<T>(file:string):T|null {
  const [value,setValue]=useState<T|null>(null);
  const [handle]=useState(()=>delayRender(`Loading ${file}`));
  const released=useRef(false);
  useEffect(()=>{
    let active=true;
    const release=()=>{if(!released.current){released.current=true;continueRender(handle);}};
    fetch(staticFile(file)).then(response=>{if(!response.ok)throw new Error(`${file}: ${response.status}`);return response.json();}).then(data=>{
      if(active){setValue(data as T);release();}
    }).catch(error=>{if(active)cancelRender(error);});
    return ()=>{active=false;release();};
  },[file,handle]);
  return value;
}
