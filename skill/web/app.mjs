import {config} from './lib/config.mjs';
import {colorInfo,hex,delta,lab} from './lib/colors.mjs';
import {createWorkspace} from './lib/workspace.mjs';
import {decodeImage} from './lib/media.mjs';
import {createLibrary} from './lib/library.mjs';

const $=selector=>document.querySelector(selector);
const canvas=$('#reference'),context=canvas.getContext('2d',{willReadFrequently:true});
const categories=['帽子','发饰','墨镜','围巾','首饰','腰带','包','手套','袜子','鞋','其他'];
let worker,sequence=0,busy=false,current=null,pick=null,keyPoint=null,categoryTarget=null,cropStart=null,cropRect=null,workspace,library,readOnly=false,sourceKind='reference',page='home';
const pending=new Map();
function getWorker(){
  if(worker)return worker;
  worker=new Worker(new URL('./lib/segment-worker.mjs',import.meta.url));
  worker.onmessage=({data})=>{
    const request=pending.get(data.id);if(!request)return;
    pending.delete(data.id);
    data.error?request.reject(new Error(data.error)):request.resolve(data.result);
  };
  worker.onerror=()=>{
    for(const request of pending.values())request.reject(new Error('加载失败。检查网络后刷新。'));
    pending.clear();worker.terminate();worker=null;
  };
  return worker;
}
function setBusy(value){
  busy=value;
  for(const selector of ['#upload','#upload-again','#crop','#add-color','#add-accessory'])$(selector).disabled=value;
}
function notify(text){$('#status').textContent=text;}
function showView(name){
  page=name;resetPicking();notify('');
  for(const id of ['home','archive','today','result','archive-detail'])$('#'+id).hidden=id!==(name==='detail'?'result':name);
  $('#back').hidden=name==='home';$('#upload-again').hidden=name==='home';
  if(name==='detail')$('#archive-detail').hidden=false;
}
async function extractImage(source){
  const pixels=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height),bitmap=await createImageBitmap(source),id=++sequence;
  return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});getWorker().postMessage({id,pixels,bitmap},[bitmap,pixels.data.buffer]);});
}
function resetPicking(){
  pick=null;keyPoint=null;canvas.classList.remove('picking','cropping');$('#pick-marker').hidden=true;
  $('#pick-message').textContent='';$('#pick-cancel').hidden=true;
  $('#crop-box').hidden=true;$('#crop-confirm').hidden=true;$('#crop-cancel').hidden=true;$('#crop').hidden=false;
}
function normalize(){
  const sum=current.palette.reduce((n,c)=>n+c.share,0);
  current.palette.sort((a,b)=>b.share-a.share);
  let assigned=0;
  current.palette.forEach((c,i)=>{c.share/=sum;c.percent=i===current.palette.length-1?100-assigned:Math.round(c.share*100);assigned+=c.percent;});
}
function button(text,handler,className=''){
  const b=document.createElement('button');b.textContent=text;b.className=className;b.addEventListener('click',handler);return b;
}
function questionIcon(){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 20 20');svg.setAttribute('role','img');svg.setAttribute('aria-label','品类待确认');svg.classList.add('uncertain');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16M7.5 7a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2M10 13v1');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.4');svg.append(path);return svg;
}
function render(){
  $('#palette-bar').replaceChildren();$('#palette-list').replaceChildren();$('#accessories').replaceChildren();
  current.palette.forEach((color,index)=>{
    const block=document.createElement('div');block.className='color-block';block.style.background=color.hex;block.style.width=`${color.percent}%`;$('#palette-bar').append(block);
    const label=document.createElement('div');label.className='color-label';
    const marker=document.createElement('span');marker.className='color-marker';marker.style.background=color.hex;marker.setAttribute('aria-hidden','true');
    label.append(marker,document.createTextNode(`${color.name} ${color.percent}%`));
    const remove=button('移除',()=>{current.palette.splice(index,1);normalize();render();},'remove');
    remove.disabled=current.palette.length<=1;label.append(remove);$('#palette-list').append(label);
  });
  current.accessories.forEach((item,index)=>{
    const card=document.createElement('div'),swatch=document.createElement('div');swatch.className='accessory-color';swatch.style.background=item.hex;
    const name=button(`${item.name} ${item.category}`,()=>{categoryTarget={index};$('#category-dialog').showModal();},'accessory-name');
    if(item.guessed)name.append(questionIcon());
    card.append(swatch,name,button('移除',()=>{current.accessories.splice(index,1);render();},'remove'));$('#accessories').append(card);
  });
  if(!current.accessories.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='未识别到配饰';$('#accessories').append(empty);}
  $('#add-color').disabled=busy||current.palette.length>=config.maxColors;
  $('#add-accessory').disabled=busy||current.accessories.length>=config.maxAccessories;
  for(const element of document.querySelectorAll('#analysis .remove,#add-color,#add-accessory'))element.hidden=readOnly;
  for(const element of document.querySelectorAll('.accessory-name'))element.disabled=readOnly;
  if(readOnly)for(const element of document.querySelectorAll('.image-actions button'))element.hidden=true;
  workspace?.update(current);
}
async function analyze(){
  setBusy(true);resetPicking();notify('识别中');
  $('#image-stage').style.maxWidth=`${Math.min(300,config.previewMaxHeight*canvas.width/canvas.height)}px`;
  $('#analysis').hidden=true;
  workspace?.hide();
  try{
    current=await extractImage(canvas);
    if(current.multiple){notify('图中有多人。框选一人后重试。');return;}
    notify('');$('#analysis').hidden=false;await workspace.start(current,canvas,sourceKind);render();
  }catch(error){
    const allowed=['未识别到服装。换一张人物清晰的全身照。','人物太小。框选人物后重试。'];
    notify(allowed.includes(error.message)?error.message:error.message==='no-webgl'?'这个浏览器无法运行识别。换用最新版 Chrome、Edge 或 Safari 再试。':'加载失败。检查网络后刷新。');
  }finally{setBusy(false);if(current&&!current.multiple&&!$('#analysis').hidden)render();}
}
async function loadFile(file,kind='reference'){
  if(!file||busy)return;
  if(file.size>config.maxUploadBytes){notify('图片超过 20MB。');return;}
  const heic=/\.(heic|heif)$/i.test(file.name)||/heic|heif/i.test(file.type);
  if(!heic&&!['image/jpeg','image/png','image/webp'].includes(file.type)&&!/\.(jpe?g|png|webp)$/i.test(file.name)){notify('仅支持 JPG、PNG、WebP。');return;}
  setBusy(true);
  let url=URL.createObjectURL(file);const img=new Image();
  try{
    img.src=url;
    try{await img.decode();}
    catch(error){
      if(!heic||!workspace.local)throw error;
      const converted=await workspace.local.convert(file);URL.revokeObjectURL(url);url=URL.createObjectURL(converted);img.src=url;await img.decode();
    }
    canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;context.drawImage(img,0,0);
    sourceKind=kind;readOnly=false;showView('result');
    await analyze();
  }catch{notify(heic?'无法打开 HEIC 格式。截图后上传，或转为 JPG。':'仅支持 JPG、PNG、WebP。');}
  finally{URL.revokeObjectURL(url);$('#file').value='';setBusy(false);if(current&&!current.multiple&&!$('#analysis').hidden)render();}
}
function startPicking(mode){
  if(!current||busy)return;
  resetPicking();pick=mode;canvas.classList.add('picking');
  $('#pick-message').textContent=mode==='color'?'点击图片取色。':'点击图片中的配饰。';$('#pick-cancel').hidden=false;canvas.focus();
}
function imagePoint(event){
  const rect=canvas.getBoundingClientRect();
  return [Math.max(0,Math.min(canvas.width-1,(event.clientX-rect.left)/rect.width*canvas.width)),Math.max(0,Math.min(canvas.height-1,(event.clientY-rect.top)/rect.height*canvas.height))];
}
function samplePoint(x,y){
  const radius=config.manualSampleRadius,size=radius*2+1,left=Math.max(0,Math.floor(x)-radius),top=Math.max(0,Math.floor(y)-radius);
  const pixels=context.getImageData(left,top,Math.min(size,canvas.width-left),Math.min(size,canvas.height-top));
  const sum=[0,0,0];
  for(let p=0;p<pixels.data.length;p+=4)for(let c=0;c<3;c++)sum[c]+=pixels.data[p+c];
  return colorInfo(hex(sum.map(v=>v/(pixels.data.length/4))));
}
function measurePalette(){
  if(!current.clothingMask)return normalize();
  const data=context.getImageData(0,0,canvas.width,canvas.height).data;
  const counts=current.palette.map(()=>0),upperCounts=current.palette.map(()=>0),step=Math.max(1,Math.floor(Math.sqrt(canvas.width*canvas.height/config.colorSamples)));
  let total=0;
  for(let y=0;y<canvas.height;y+=step)for(let x=0;x<canvas.width;x+=step){
    const maskIndex=Math.floor(y/canvas.height*current.height)*current.width+Math.floor(x/canvas.width*current.width);
    if(!current.clothingMask[maskIndex])continue;
    const p=(y*canvas.width+x)*4,value=lab([data[p],data[p+1],data[p+2]]);
    let nearest=0,distance=Infinity;
    current.palette.forEach((color,i)=>{const d=delta(value,color.lab);if(d<distance){distance=d;nearest=i;}});
    counts[nearest]++;total++;
    if((y/canvas.height-current.bounds[1])/(current.bounds[3]-current.bounds[1])<config.positionSplit)upperCounts[nearest]++;
  }
  if(total)current.palette.forEach((color,i)=>{
    color.share=counts[i]/total||config.manualColorShare;
    if(counts[i]){color.upperShare=upperCounts[i]/counts[i];color.position=color.upperShare>config.positionUpperShare?'upper':color.upperShare<config.positionLowerShare?'lower':'both';}
  });
  normalize();
}
canvas.addEventListener('click',event=>{
  if(!pick||pick==='crop')return;
  const [x,y]=imagePoint(event),color=samplePoint(x,y);
  if(pick==='color'){
    const match=current.palette.find(c=>delta(c.lab,color.lab)<config.mergeDeltaE);
    if(!match){const relative=(y/canvas.height-current.bounds[1])/(current.bounds[3]-current.bounds[1]);current.palette.push({...color,share:config.manualColorShare,position:relative<config.positionSplit?'upper':'lower'});measurePalette();}
    resetPicking();render();
  }else{
    categoryTarget={item:{...color,pixels:0,position:[x/canvas.width,y/canvas.height],guessed:false,source:'manual',accent:color.chroma>=config.accentChroma||delta(color.lab,current.palette[0].lab)>config.accentContrast}};
    $('#category-dialog').showModal();
  }
});
function drawCropBox(){
  const box=$('#crop-box');box.hidden=false;
  box.style.left=`${cropRect[0]/canvas.width*100}%`;box.style.top=`${cropRect[1]/canvas.height*100}%`;box.style.width=`${cropRect[2]/canvas.width*100}%`;box.style.height=`${cropRect[3]/canvas.height*100}%`;
  $('#crop-confirm').disabled=cropRect[2]<config.minCropPixels||cropRect[3]<config.minCropPixels;
}
const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
canvas.addEventListener('keydown',event=>{
  if(event.key==='Escape'){resetPicking();return;}
  if(!pick)return;
  const move=arrows[event.key];
  if(pick==='crop'){
    if(event.key==='Enter'&&!$('#crop-confirm').disabled){event.preventDefault();$('#crop-confirm').click();return;}
    if(!move)return;event.preventDefault();
    if(!cropRect)cropRect=[canvas.width*0.2,canvas.height*0.2,canvas.width*0.6,canvas.height*0.6];
    const step=Math.max(4,Math.round(Math.min(canvas.width,canvas.height)*0.02));
    if(event.shiftKey){cropRect[2]=Math.max(config.minCropPixels,Math.min(canvas.width-cropRect[0],cropRect[2]+move[0]*step));cropRect[3]=Math.max(config.minCropPixels,Math.min(canvas.height-cropRect[1],cropRect[3]+move[1]*step));}
    else{cropRect[0]=Math.max(0,Math.min(canvas.width-cropRect[2],cropRect[0]+move[0]*step));cropRect[1]=Math.max(0,Math.min(canvas.height-cropRect[3],cropRect[1]+move[1]*step));}
    drawCropBox();return;
  }
  if(move){
    event.preventDefault();keyPoint??=[canvas.width/2,canvas.height/2];
    const step=Math.max(2,Math.round(Math.min(canvas.width,canvas.height)*(event.shiftKey?0.1:0.02)));
    keyPoint=[Math.max(0,Math.min(canvas.width-1,keyPoint[0]+move[0]*step)),Math.max(0,Math.min(canvas.height-1,keyPoint[1]+move[1]*step))];
    const marker=$('#pick-marker');marker.hidden=false;marker.style.left=`${keyPoint[0]/canvas.width*100}%`;marker.style.top=`${keyPoint[1]/canvas.height*100}%`;
    return;
  }
  if(event.key==='Enter'||event.key===' '){
    event.preventDefault();const rect=canvas.getBoundingClientRect(),point=keyPoint||[canvas.width/2,canvas.height/2];
    canvas.dispatchEvent(new MouseEvent('click',{clientX:rect.left+point[0]/canvas.width*rect.width,clientY:rect.top+point[1]/canvas.height*rect.height}));
  }
});
for(const category of categories)$('#categories').append(button(category,()=>{
  if(categoryTarget?.item)current.accessories.push({...categoryTarget.item,category});
  else if(categoryTarget)Object.assign(current.accessories[categoryTarget.index],{category,guessed:false});
  $('#category-dialog').close();categoryTarget=null;resetPicking();render();
}));
$('#category-dialog').addEventListener('close',()=>{categoryTarget=null;});
$('#crop').addEventListener('click',()=>{
  if(busy)return;resetPicking();pick='crop';cropRect=null;
  canvas.classList.add('cropping');$('#crop').hidden=true;$('#crop-confirm').hidden=false;$('#crop-confirm').disabled=true;$('#crop-cancel').hidden=false;
  $('#pick-message').textContent='拖动框出人物，再点确定。';canvas.focus();
});
canvas.addEventListener('pointerdown',event=>{if(pick!=='crop')return;event.preventDefault();cropStart=imagePoint(event);canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{
  if(pick!=='crop'||!cropStart)return;
  const [x,y]=imagePoint(event),[sx,sy]=cropStart;
  cropRect=[Math.min(x,sx),Math.min(y,sy),Math.abs(x-sx),Math.abs(y-sy)];
  drawCropBox();
});
canvas.addEventListener('pointerup',()=>{cropStart=null;});
canvas.addEventListener('pointercancel',()=>{cropStart=null;});
$('#crop-confirm').addEventListener('click',async()=>{
  if(!cropRect)return;
  const [x,y,w,h]=cropRect.map(Math.round),data=context.getImageData(x,y,w,h);
  canvas.width=w;canvas.height=h;context.putImageData(data,0,0);await analyze();
});
for(const id of ['#pick-cancel','#crop-cancel'])$(id).addEventListener('click',resetPicking);
$('#add-color').addEventListener('click',()=>startPicking('color'));
$('#add-accessory').addEventListener('click',()=>startPicking('accessory'));
for(const id of ['#upload','#upload-again'])$(id).addEventListener('click',()=>$('#file').click());
$('#file').addEventListener('change',event=>loadFile(event.target.files[0]));
$('#personal-file').addEventListener('change',event=>{void loadFile(event.target.files[0],'personal');event.target.value='';});
$('#back').addEventListener('click',()=>{
  if(page==='detail'){workspace.leave();void library.back();}
  else{workspace.leave();showView('home');}
});
document.addEventListener('dragover',event=>{event.preventDefault();if(!busy)document.body.classList.add('dragging');});
document.addEventListener('dragleave',event=>{if(!event.relatedTarget)document.body.classList.remove('dragging');});
document.addEventListener('drop',event=>{
  event.preventDefault();document.body.classList.remove('dragging');
  const file=[...event.dataTransfer.files].find(f=>f.type.startsWith('image/')||/\.(heic|heif)$/i.test(f.name));
  file?loadFile(file):notify('先保存图片，再拖入或粘贴。');
});
document.addEventListener('paste',event=>{
  if(event.target.closest('input,textarea,[contenteditable]'))return;
  const item=[...(event.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));
  if(item){event.preventDefault();loadFile(item.getAsFile());}
});
window.addEventListener('pagehide',()=>{worker?.terminate();worker=null;});
workspace=createWorkspace({
  extractImage,onError:notify,onArchiveChange:()=>library?.changed(),
  async onRestore(entry,archived=false){
    const image=await decodeImage(entry.original);
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;context.drawImage(image,0,0);
    current={palette:structuredClone(entry.palette),accessories:structuredClone(entry.accessories),...entry.geometry,multiple:false};
    readOnly=archived;sourceKind=entry.kind;showView(archived?'detail':'result');$('#analysis').hidden=false;
    $('#image-stage').style.maxWidth=`${Math.min(300,config.previewMaxHeight*canvas.width/canvas.height)}px`;
    resetPicking();notify('');render();
  }
});
library=createLibrary({showView,openLook:record=>workspace.openArchive(record),addPersonal:()=>$('#personal-file').click(),onError:notify});
if(workspace.local){
  const input=new URLSearchParams(location.hash.slice(1)),id=input.get('input');
  if(/^[a-f0-9-]{36}$/.test(id)){
    history.replaceState(null,'',location.pathname);
    void workspace.local.ready.then(async()=>{
      const blob=await workspace.local.input(id),name=input.get('name')||'image.jpg';
      await loadFile(new File([blob],name));
    }).catch(()=>notify('加载失败。检查网络后刷新。'));
  }
}
