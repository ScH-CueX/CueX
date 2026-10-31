import {useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import model from '../../../assets/brand/x-model.json';
import {ramp, EASE} from '../theme';

function Ribbons({frame}: {frame:number}) {
  const geometry=useMemo(()=>{
    const x=model.width/2, y=model.length/2, r=x;
    const shape=new THREE.Shape();
    shape.moveTo(-x,-y+r);shape.lineTo(-x,y-r);shape.quadraticCurveTo(-x,y,0,y);
    shape.quadraticCurveTo(x,y,x,y-r);shape.lineTo(x,-y+r);shape.quadraticCurveTo(x,-y,0,-y);
    shape.quadraticCurveTo(-x,-y,-x,-y+r);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:model.depth,bevelEnabled:true,bevelSegments:4,bevelSize:model.bevel,bevelThickness:model.bevel,curveSegments:16,steps:1});
    geo.translate(0,0,-model.depth/2);return geo;
  },[]);
  const turn=ramp(frame,0,90,EASE.inOut);
  const a=ramp(frame,5,40),b=ramp(frame,18,66);
  return <group rotation={[-.27+.09*turn,-.62+.34*turn,-.025]}>
    <mesh geometry={geometry} rotation={[0,0,model.crossingAngle]} position={[0,(1-a)*.35,-.08]} scale={[1,Math.max(.01,a),1]}>
      <meshPhysicalMaterial color={model.amber} metalness={.48} roughness={.22} clearcoat={1} clearcoatRoughness={.13}/>
    </mesh>
    <mesh geometry={geometry} rotation={[0,0,-model.crossingAngle]} position={[0,-(1-b)*.35,.08]} scale={[1,Math.max(.01,b),1]}>
      <meshPhysicalMaterial color={model.lavender} metalness={.44} roughness={.21} clearcoat={1} clearcoatRoughness={.12}/>
    </mesh>
  </group>;
}

export function DimensionalX({frame,width=640,height=640}: {frame:number;width?:number;height?:number}) {
  return <ThreeCanvas width={width} height={height} dpr={1.5} gl={{alpha:true,antialias:true}} camera={{position:[0,0,5.4],fov:34,near:.1,far:30}}>
    <ambientLight intensity={.7}/>
    <directionalLight position={[-2,4,5]} intensity={3.8} color="#fff5e4"/>
    <directionalLight position={[4,-1,3]} intensity={2.5} color="#c5c7ff"/>
    <pointLight position={[-3,-2,2]} intensity={16} color="#ffbe80"/>
    <Ribbons frame={frame}/>
  </ThreeCanvas>;
}
