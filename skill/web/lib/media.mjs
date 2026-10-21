import {config} from './config.mjs';
export async function decodeImage(file){
  if(file.size>config.maxUploadBytes)throw new Error('图片超过 20MB。');
  const heic=/\.(heic|heif)$/i.test(file.name||'')||/heic|heif/i.test(file.type);
  if(!heic&&!['image/jpeg','image/png','image/webp'].includes(file.type)&&!/\.(jpe?g|png|webp)$/i.test(file.name||''))throw new Error('仅支持 JPG、PNG、WebP。');
  const url=URL.createObjectURL(file),image=new Image();
  try{image.src=url;await image.decode();return image;}
  catch{throw new Error(heic?'无法打开 HEIC 格式。截图后上传，或转为 JPG。':'仅支持 JPG、PNG、WebP。');}
  finally{URL.revokeObjectURL(url);}
}
export function imageCanvas(image){
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;
  canvas.getContext('2d',{willReadFrequently:true}).drawImage(image,0,0);return canvas;
}
export function compressImage(source){
  const scale=Math.min(1,config.imageLongEdge/Math.max(source.width,source.height)),canvas=document.createElement('canvas');
  canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image encoding failed')),'image/jpeg',config.imageQuality));
}
export function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export function drawSwatch(recipe){
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=620;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,960,620);ctx.fillStyle='#000';ctx.font='24px Georgia';ctx.fillText('PALETTE',40,50);
  const clothes=recipe.items.filter(i=>i.role!=='accessory'),accessories=recipe.items.filter(i=>i.role==='accessory');
  let x=40;
  for(const item of clothes){const width=item.area*880;ctx.fillStyle=item.hex;ctx.fillRect(x,80,width,180);x+=width;}
  ctx.fillStyle='#000';ctx.font='20px "PingFang SC",sans-serif';
  clothes.forEach((item,i)=>ctx.fillText(`${item.name} ${item.item}`,40+i%3*300,300+Math.floor(i/3)*30,280));
  ctx.font='24px Georgia';ctx.fillText('DETAILS',40,410);
  accessories.forEach((item,i)=>{const left=40+i%6*150,top=435+Math.floor(i/6)*90;ctx.fillStyle=item.hex;ctx.fillRect(left,top,44,44);ctx.fillStyle='#000';ctx.font='17px "PingFang SC",sans-serif';ctx.fillText(`${item.name} ${item.category}`,left,top+70,140);});
  return canvas;
}
