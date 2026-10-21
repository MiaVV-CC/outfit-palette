import {config} from './config.mjs';
import {lab,delta,hex,colorInfo} from './colors.mjs';

function sameShade(a,b){
  const ac=Math.hypot(a[1],a[2]),bc=Math.hypot(b[1],b[2]);
  const angle=Math.acos(Math.max(-1,Math.min(1,(a[1]*b[1]+a[2]*b[2])/(ac*bc))))*180/Math.PI;
  return Math.min(ac,bc)>=config.shadeMinChroma&&Math.min(ac,bc)/Math.max(ac,bc)>=config.shadeMinChromaRatio&&angle<config.shadeHueDegrees&&Math.abs(a[0]-b[0])<config.shadeLightnessRange;
}

export function cluster(samples,options={}){
  if(!samples.length)return [];
  const points=samples.map(p=>({...p,lab:lab(p.rgb)}));
  const centers=[points[Math.floor(points.length/2)].lab];
  while(centers.length<Math.min(config.clusterCount,points.length)){
    let farthest=null,maximum=0;
    for(const p of points){const d=Math.min(...centers.map(c=>delta(p.lab,c)));if(d>maximum){maximum=d;farthest=p.lab;}}
    if(maximum<config.mergeDeltaE||!farthest)break;
    centers.push([...farthest]);
  }
  let groups;
  for(let iteration=0;iteration<config.clusterIterations;iteration++){
    groups=centers.map(()=>[]);
    for(const p of points){let selected=0,d=Infinity;centers.forEach((c,i)=>{const next=delta(p.lab,c);if(next<d){d=next;selected=i;}});groups[selected].push(p);}
    groups.forEach((g,i)=>{if(g.length)centers[i]=[0,1,2].map(j=>g.reduce((sum,p)=>sum+p.lab[j],0)/g.length);});
  }
  const merged=[];
  groups.filter(g=>g.length).sort((a,b)=>b.length-a.length).forEach(g=>{
    const mean=[0,1,2].map(i=>g.reduce((sum,p)=>sum+p.lab[i],0)/g.length);
    const target=merged.find(m=>delta(m.lab,mean)<config.mergeDeltaE||sameShade(m.lab,mean)||[m.lab,mean].every(c=>c[0]>config.lightNeutralLightness&&Math.hypot(c[1],c[2])<config.lightNeutralChroma)&&Math.abs(m.lab[0]-mean[0])<config.lightNeutralLightnessRange&&Math.hypot(m.lab[1]-mean[1],m.lab[2]-mean[2])<config.lightNeutralToneDifference);
    if(target){target.points.push(...g);target.lab=[0,1,2].map(i=>target.points.reduce((s,p)=>s+p.lab[i],0)/target.points.length);}else merged.push({lab:mean,points:[...g]});
  });
  const selected=merged.filter(g=>g.points.length/points.length>=(options.minShare??config.minColorShare)).sort((a,b)=>b.points.length-a.points.length).slice(0,options.maxColors??config.maxColors);
  const total=selected.reduce((s,g)=>s+g.points.length,0);
  const result=selected.map(g=>{
    const channels=[0,1,2].map(i=>g.points.reduce((s,p)=>s+p.rgb[i],0)/g.points.length);
    const upper=g.points.filter(p=>p.y<config.positionSplit).length/g.points.length;
    return {...colorInfo(hex(channels)),share:g.points.length/total,upperShare:upper,position:upper>config.positionUpperShare?'upper':upper<config.positionLowerShare?'lower':'both'};
  });
  let assigned=0;
  return result.map((c,i)=>{const percent=i===result.length-1?100-assigned:Math.round(c.share*100);assigned+=percent;return {...c,percent};});
}

export function components(mask,width,height,predicate){
  const seen=new Uint8Array(mask.length),groups=[];
  for(let i=0;i<mask.length;i++){
    if(seen[i]||!predicate(mask[i]))continue;
    const queue=[i];seen[i]=1;
    let x0=width,y0=height,x1=0,y1=0;
    for(let q=0;q<queue.length;q++){
      const v=queue[q],x=v%width,y=Math.floor(v/width);
      x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
      for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
        if(nx<0||ny<0||nx>=width||ny>=height)continue;
        const j=ny*width+nx;if(!seen[j]&&predicate(mask[j])){seen[j]=1;queue.push(j);}
      }
    }
    groups.push({indices:queue,area:queue.length,box:[x0,y0,x1+1,y1+1],cx:(x0+x1)/2,cy:(y0+y1)/2});
  }
  return groups.sort((a,b)=>b.area-a.area);
}

function joinFaceFragments(groups){
  const joined=[];
  for(const group of groups){
    const target=joined.find(face=>{
      const width=face.box[2]-face.box[0],height=face.box[3]-face.box[1];
      const gap=Math.max(0,group.box[1]-face.box[3],face.box[1]-group.box[3]);
      return group.area>=face.area*config.faceFragmentAreaRatio&&Math.abs(group.cx-face.cx)<width*config.faceFragmentCenterRatio&&gap<height*config.faceFragmentGapRatio;
    });
    if(!target){joined.push({...group,box:[...group.box]});continue;}
    target.box=[Math.min(target.box[0],group.box[0]),Math.min(target.box[1],group.box[1]),Math.max(target.box[2],group.box[2]),Math.max(target.box[3],group.box[3])];
    target.area+=group.area;target.cx=(target.box[0]+target.box[2]-1)/2;target.cy=(target.box[1]+target.box[3]-1)/2;
  }
  return joined.sort((a,b)=>b.area-a.area);
}

export function extract(pixels,sourceMask,maskWidth,maskHeight,options={}){
  const w=config.maskSize,h=Math.round(w*pixels.height/pixels.width),mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)mask[y*w+x]=sourceMask[Math.min(maskHeight-1,Math.floor(y/h*maskHeight))*maskWidth+Math.min(maskWidth-1,Math.floor(x/w*maskWidth))];
  const clothes=components(mask,w,h,c=>c===4);
  if(!clothes.length)throw new Error('未识别到服装。换一张人物清晰的全身照。');
  if(clothes[0].area/(w*h)<config.minClothingShare)throw new Error('人物太小。框选人物后重试。');
  const main=clothes[0];
  const faces=joinFaceFragments(components(mask,w,h,c=>c===3).filter(c=>c.area>config.minFacePixels));
  const face=faces[0];
  const selected=clothes.filter(c=>c.area>=main.area*config.minClothingComponentRatio&&(Math.abs(c.cx-main.cx)<w*config.subjectCenterTolerance||face&&Math.abs(c.cx-face.cx)<w*config.subjectCenterTolerance&&c.cy>main.cy));
  const accepted=new Uint8Array(w*h);
  for(const c of selected)for(const i of c.indices)accepted[i]=1;
  const mainFaces=faces.filter(c=>c.area>=faces[0]?.area*config.majorFaceRatio);
  const multiple=mainFaces.length>1&&mainFaces.some(c=>Math.abs(c.cx-mainFaces[0].cx)>w*config.multipleFaceSeparation);
  let bounds=[Math.min(...selected.map(c=>c.box[0])),Math.min(...selected.map(c=>c.box[1])),Math.max(...selected.map(c=>c.box[2])),Math.max(...selected.map(c=>c.box[3]))];
  const person=components(mask,w,h,c=>c>0).find(c=>c.indices.some(i=>accepted[i]))||main;
  bounds[1]=Math.min(bounds[1],person.box[1]);bounds[3]=Math.max(bounds[3],person.box[3]);
  const ph=Math.max(1,bounds[3]-bounds[1]),py=y=>(y-bounds[1])/ph;
  let recoveredPixels=0;
  if(!multiple&&selected.some(c=>c!==main&&c.area>main.area*config.fragmentedClothingRatio&&c.cy>main.cy)){
    for(let y=Math.floor(bounds[1]+ph*config.clothingBridgeStart);y<bounds[3];y++){
      const runs=[];
      for(let x=0;x<w;x++){
        if(!accepted[y*w+x])continue;
        const start=x;while(x+1<w&&accepted[y*w+x+1])x++;
        if(x-start+1>=config.clothingBridgeMinRun)runs.push([start,x]);
      }
      for(let r=1;r<runs.length;r++){
        const left=runs[r-1][1],right=runs[r][0];
        if(right-left>w*config.clothingBridgeMaxWidth)continue;
        for(let x=left+1;x<right;x++){const i=y*w+x;if(mask[i]===0&&!accepted[i]){accepted[i]=1;recoveredPixels++;}}
      }
    }
  }
  const fullBody=Boolean(face&&ph/(face.box[3]-face.box[1])>=config.minBodyFaceRatio&&main.box[3]<h-config.edgeInset);
  const sample=(predicate,limit=config.colorSamples)=>{
    const list=[],step=Math.max(1,Math.floor(Math.sqrt(pixels.width*pixels.height/limit)));
    for(let y=0;y<pixels.height;y+=step)for(let x=0;x<pixels.width;x+=step){
      const mx=Math.min(w-1,Math.floor(x/pixels.width*w)),my=Math.min(h-1,Math.floor(y/pixels.height*h)),i=my*w+mx;
      if(predicate(mx,my,i,x,y)){const p=(y*pixels.width+x)*4;list.push({rgb:[pixels.data[p],pixels.data[p+1],pixels.data[p+2]],y:py(my)});}
    }
    return list;
  };
  const palette=cluster(sample((x,y,i)=>accepted[i]));
  const accessoryGroups=components(mask,w,h,c=>c===5).filter(c=>(c.area/(w*h)>=config.minAccessoryShare||fullBody&&py(c.cy)>config.shoeBodyStart&&c.area>=config.minShoePixels)&&c.cx>bounds[0]-w*config.accessoryHorizontalMargin&&c.cx<bounds[2]+w*config.accessoryHorizontalMargin);
  const shoeGroups=accessoryGroups.filter(c=>py(c.cy)>config.shoeBodyStart);
  if(fullBody&&shoeGroups.length>1){
    const merged={indices:shoeGroups.flatMap(c=>c.indices),area:shoeGroups.reduce((s,c)=>s+c.area,0),box:[Math.min(...shoeGroups.map(c=>c.box[0])),Math.min(...shoeGroups.map(c=>c.box[1])),Math.max(...shoeGroups.map(c=>c.box[2])),Math.max(...shoeGroups.map(c=>c.box[3]))]};
    merged.cx=shoeGroups.reduce((s,c)=>s+c.cx*c.area,0)/merged.area;
    merged.cy=shoeGroups.reduce((s,c)=>s+c.cy*c.area,0)/merged.area;
    accessoryGroups.splice(0,accessoryGroups.length,...accessoryGroups.filter(c=>!shoeGroups.includes(c)),merged);
  }
  const accessories=[];
  for(const group of accessoryGroups){
    const relative=py(group.cy);
    let category='配饰';
    if(relative>config.shoeBodyStart){
      if(!fullBody)continue;
      category='鞋';
    }
    else if(face&&(group.box[3]<face.box[1]+(face.box[3]-face.box[1])*config.hatFaceOverlap||group.cy<face.box[1]+(face.box[3]-face.box[1])*config.hatCenterFaceOverlap&&group.box[3]<face.box[1]+(face.box[3]-face.box[1])*config.hatBottomFaceOverlap&&group.box[2]-group.box[0]>(face.box[2]-face.box[0])*config.hatMinFaceWidthRatio))category='帽子';
    else if(relative<config.glassesEnd&&face&&group.cy<face.box[3]&&(group.box[2]-group.box[0])/(group.box[3]-group.box[1])>config.glassesMinAspect)category='墨镜';
    else if(relative>config.scarfStart&&relative<config.scarfEnd)category='围巾';
    else if(relative>config.bagStart&&relative<config.bagEnd)category='包';
    const membership=new Set(group.indices);
    const groupColors=cluster(sample((x,y,i,ox,oy)=>{
      if(!membership.has(i))return false;
      if(category!=='鞋')return true;
      const sx=Math.floor(ox/pixels.width*maskWidth),sy=Math.floor(oy/pixels.height*maskHeight),si=sy*maskWidth+sx;
      return sx>0&&sy>0&&sx<maskWidth-1&&sy<maskHeight-1&&[si,si-1,si+1,si-maskWidth,si+maskWidth].every(j=>sourceMask[j]===5);
    },config.accessoryColorSamples));
    if(!groupColors.length)continue;
    const primary=groupColors[0];
    const match=accessories.find(a=>a.category===category&&delta(a.lab,primary.lab)<config.mergeDeltaE);
    if(match){match.pixels+=group.area;continue;}
    accessories.push({...primary,category,pixels:group.area,position:[group.cx/w,group.cy/h],guessed:true,source:'model',accent:primary.chroma>=config.accentChroma||delta(primary.lab,palette[0].lab)>config.accentContrast});
  }
  if(face&&!accessories.some(a=>a.category==='帽子')){
    const head=cluster(sample((x,y,i)=>mask[i]===4&&x>face.box[0]-config.headHorizontalPadding*w&&x<face.box[2]+config.headHorizontalPadding*w&&y<face.box[1]&&y>face.box[1]-config.hatMaxHeight*ph));
    const skinHair=cluster(sample((x,y,i)=>[1,2,3].includes(mask[i])&&x>face.box[0]&&x<face.box[2]));
    if(head.length&&!skinHair.some(c=>delta(c.lab,head[0].lab)<config.skinHairDifference))accessories.push({...head[0],category:'帽子',pixels:0,position:[face.cx/w,face.box[1]/h],guessed:true,source:'position',accent:head[0].chroma>=config.accentChroma});
  }
  const rows=[];
  for(let y=Math.floor(bounds[1]+config.beltStart*ph);y<bounds[1]+config.beltEnd*ph;y++){
    const row=sample((x,my,i)=>accepted[i]&&my===y&&x>main.cx-w*config.beltHorizontalRadius&&x<main.cx+w*config.beltHorizontalRadius,config.beltColorSamples);
    if(row.length>=config.beltMinRowSamples)rows.push({y,lab:lab([0,1,2].map(k=>row.reduce((sum,p)=>sum+p.rgb[k],0)/row.length)),samples:row});
  }
  let belt=null;
  for(let i=config.beltRowOffset;i<rows.length-config.beltRowOffset;i++){
    const row=rows[i],before=rows[i-config.beltRowOffset],after=rows[i+config.beltRowOffset];
    if(delta(row.lab,before.lab)>config.beltContrast&&delta(row.lab,after.lab)>config.beltContrast&&delta(before.lab,after.lab)<config.mergeDeltaE){
      const c=cluster(row.samples)[0];if(c&&(!belt||c.chroma>belt.chroma))belt={...c,category:'腰带',pixels:row.samples.length,position:[main.cx/w,row.y/h],guessed:true,source:'waist',accent:c.chroma>=config.accentChroma};
    }
  }
  if(belt)accessories.push(belt);
  const sorted=accessories.sort((a,b)=>Number(b.accent)-Number(a.accent)||b.pixels-a.pixels).slice(0,config.maxAccessories);
  return {palette,accessories:sorted,multiple,fullBody,hasPerson:Boolean(face||mask.some(c=>c===2)),recoveredPixels,bounds:bounds.map((v,i)=>v/(i%2?h:w)),clothingPixels:selected.reduce((s,c)=>s+c.area,0)+recoveredPixels,width:w,height:h,...(options.includeMask?{clothingMask:accepted}:{}),...(options.debug?{allColors:cluster(sample((x,y,i)=>accepted[i]),{maxColors:20,minShare:0})}:{})};
}
