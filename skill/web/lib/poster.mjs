import {config} from './config.mjs';
import {decodeImage,downloadBlob} from './media.mjs';
const serif='"Cormorant Garamond",Georgia,serif',chinese='"Songti SC","Noto Serif CJK SC",serif',sans='"PingFang SC","Noto Sans CJK SC",sans-serif';
function wrap(ctx,text,width){
  const lines=[];let line='';
  for(const char of text){if(line&&ctx.measureText(line+char).width>width){lines.push(line);line=char;}else line+=char;}
  if(line)lines.push(line);return lines;
}
function contain(ctx,image,x,y,width,height){
  const scale=Math.min(width/image.naturalWidth,height/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;
  ctx.drawImage(image,x+(width-w)/2,y+(height-h)/2,w,h);
}
export async function drawPoster(entry,showOriginal=true){
  await Promise.race([Promise.all([document.fonts.load('40px "Cormorant Garamond"'),document.fonts.ready]).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,config.fontTimeoutMs))]);
  const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=2400;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1800,2400);
  ctx.fillStyle='#000';ctx.font=`80px ${serif}`;ctx.fillText('PALETTE',88,154);
  const paletteWidth=showOriginal?1320:1624;
  let offset=88;
  for(const color of entry.palette){const width=paletteWidth*color.share;ctx.fillStyle=color.hex;ctx.fillRect(offset,212,width,184);offset+=width;}
  ctx.fillStyle='#000';ctx.font=`30px ${sans}`;
  wrap(ctx,entry.palette.map(c=>`${c.name} ${c.percent}%`).join(' / '),paletteWidth).forEach((line,i)=>ctx.fillText(line,88,451+i*46));
  if(showOriginal){const original=await decodeImage(entry.original);contain(ctx,original,1472,94,240,336);ctx.font=`26px ${sans}`;ctx.fillText('原图',1472,474);}
  ctx.font=`38px ${serif}`;ctx.fillText('DETAILS',88,584);
  const step=1624/Math.max(5,entry.accessories.length);
  entry.accessories.forEach((item,index)=>{
    const x=88+index*step;ctx.fillStyle=item.hex;ctx.fillRect(x,626,68,68);ctx.fillStyle='#000';ctx.font=`27px ${sans}`;
    wrap(ctx,`${item.name} ${item.category}`,step-22).forEach((line,i)=>ctx.fillText(line,x,743+i*38));
  });
  if(!entry.accessories.length){ctx.font=`28px ${sans}`;ctx.fillText('未识别到配饰',88,668);}
  ctx.strokeStyle='#000';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(88,820);ctx.lineTo(1712,820);ctx.stroke();
  const gap=32,column=(1624-gap*2)/3;
  for(let index=0;index<entry.looks.length;index++){
    const look=entry.looks[index],x=88+index*(column+gap);
    ctx.fillStyle='#000';ctx.font=`29px ${serif}`;ctx.fillText(`LOOK 0${look.cardType}`,x,892);
    ctx.font=`48px ${chinese}`;ctx.fillText(look.recipe.name,x,965);
    ctx.font=`26px ${sans}`;wrap(ctx,look.recipe.description,column).slice(0,2).forEach((line,i)=>ctx.fillText(line,x,1017+i*38));
    const top=1100,height=710;
    if(look.image){const image=await decodeImage(look.image);contain(ctx,image,x,top,column,height);}
    else{let y=top;for(const item of look.recipe.items.filter(i=>i.role!=='accessory')){ctx.fillStyle=item.hex;ctx.fillRect(x,y,column,height*item.area);y+=height*item.area;}}
    ctx.fillStyle='#000';
    const text=look.recipe.items.map(i=>`${i.name} ${i.item}`).join(' / ');
    let size=42,lines;
    do{ctx.font=`${size}px ${sans}`;lines=wrap(ctx,text,column);if(lines.length*size*1.5<=365)break;size--;}while(size>24);
    lines.forEach((line,i)=>ctx.fillText(line,x,1875+i*size*1.5));
  }
  ctx.strokeStyle='#000';ctx.beginPath();ctx.moveTo(88,2280);ctx.lineTo(1712,2280);ctx.stroke();
  ctx.fillStyle='#000';ctx.font=`26px ${sans}`;ctx.fillText('效果图由 AI 生成',88,2338);ctx.font=`30px ${chinese}`;
  const brand='穿搭工作台';ctx.fillText(brand,1712-ctx.measureText(brand).width,2338);
  return canvas;
}
export async function savePoster(entry,showOriginal){
  const canvas=await drawPoster(entry,showOriginal),blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('Poster failed');
  const file=new File([blob],'穿搭工作台.png',{type:'image/png'});
  const mobile=matchMedia('(max-width:640px)').matches;
  if(mobile&&navigator.canShare?.({files:[file]})){
    try{await navigator.share({files:[file]});return;}
    catch(error){if(error.name==='AbortError')return;}
  }
  if(!mobile){downloadBlob(blob,file.name);return;}
  const dialog=document.querySelector('#poster-dialog'),image=document.querySelector('#poster-image'),url=URL.createObjectURL(blob);
  image.src=url;dialog.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});dialog.showModal();
}
