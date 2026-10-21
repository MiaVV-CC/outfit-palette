import {createEntry,createLook,recipeKey,optionValues,defaultOptions} from './schema.mjs';
import {generateRecipes,promptFor} from './recipes.mjs';
import {requestPersistence,readRecent,saveRecent,patchRecentLook,archiveLooks,updateArchive} from './storage.mjs';
import {decodeImage,imageCanvas,compressImage,drawSwatch,downloadBlob} from './media.mjs';
import {validateColors,smallCategories} from './validation.mjs';
import {createLocal} from './local.mjs';
import {savePoster} from './poster.mjs';

const node=(tag,text,className='')=>{const el=document.createElement(tag);if(text)el.textContent=text;el.className=className;return el;};
const action=(text,handler,className='')=>{const el=node('button',text,className);el.type='button';el.addEventListener('click',handler);return el;};
const storageMessage=error=>error?.name==='QuotaExceededError'?'存储空间不足。导出备份后删除部分收藏。':'无法读取或保存数据。检查浏览器是否禁止网站存储。';
export function createWorkspace({extractImage,onRestore,onError,onArchiveChange}){
  const root=document.querySelector('#workspace'),optionsRoot=document.querySelector('#options'),looksRoot=document.querySelector('#looks');
  const saveButton=document.querySelector('#save-collection'),resume=document.querySelector('#resume');
  let entry=null,fingerprint='',urls=[],saving=false,archived=null;
  const processing=new Set();
  const generation=new Map();
  const local=createLocal({onError,onChange(){if(entry){optionsControls();renderCards();}}});
  function releaseUrls(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
  function save(){
    if(!entry)return Promise.resolve();
    entry.updatedAt=new Date().toISOString();entry.revision++;
    if(archived){
      Object.assign(archived,entry.looks[0]);
      return updateArchive(archived).then(()=>onArchiveChange?.()).catch(error=>onError(storageMessage(error)));
    }
    return saveRecent(entry).catch(error=>onError(storageMessage(error)));
  }
  function optionsControls(){
    optionsRoot.replaceChildren();
    optionsRoot.hidden=Boolean(archived);saveButton.hidden=Boolean(archived);
    document.querySelector('#poster-controls').hidden=Boolean(archived)||entry.kind==='personal';
    const labels={occasion:'场合',weather:'天气',model:'模特',background:'背景'};
    for(const [key,values] of Object.entries(optionValues)){
      if(entry.kind==='personal'&&['model','background'].includes(key))continue;
      const label=node('label',labels[key]),select=node('select');select.setAttribute('aria-label',labels[key]);
      for(const value of values){const option=node('option',value);option.value=value;select.append(option);}
      select.value=entry.options[key];
      select.addEventListener('change',()=>{entry.options[key]=select.value;update({palette:entry.palette,accessories:entry.accessories});});
      label.append(select);optionsRoot.append(label);
    }
    if(local)optionsRoot.append(action('SETTINGS',()=>local.settings(),'text-button'));
  }
  function update(extraction){
    if(!entry||archived)return;
    const signature=JSON.stringify({palette:extraction.palette,accessories:extraction.accessories,options:entry.options});
    if(signature===fingerprint)return;
    entry.palette=structuredClone(extraction.palette);entry.accessories=structuredClone(extraction.accessories);
    const recipes=entry.kind==='personal'?[{name:'我的穿搭',description:'',items:[]}]:generateRecipes(entry).recipes;
    entry.looks=recipes.map((recipe,index)=>{
      const old=entry.looks[index];
      if(!old){
        const look=createLook(entry.id,index,recipe,entry.options);
        if(entry.kind==='personal')Object.assign(look,{cardType:'personal',image:entry.original,imageSource:'personal'});
        return look;
      }
      return {...old,recipe,tags:{...old.tags,weather:entry.options.weather,occasion:entry.options.occasion},updatedAt:new Date().toISOString()};
    });
    fingerprint=signature;saveButton.textContent='收藏';renderCards();void save();
  }
  function renderCards(){
    const opened=[...looksRoot.querySelectorAll('.generate-panel')].map(panel=>panel.open);
    releaseUrls();looksRoot.replaceChildren();
    if(entry.kind==='personal')return;
    entry.looks.forEach((look,index)=>{
      const card=node('article',null,'look-card');card.dataset.look=String(index);
      const label=node('p',`LOOK 0${look.cardType}`,'look-number'),title=node('h2',look.recipe.name),description=node('p',look.recipe.description,'look-description');
      const visual=node('div',null,'look-visual');
      if(look.image){
        const image=node('img');const url=URL.createObjectURL(look.image);urls.push(url);image.src=url;image.alt=look.recipe.name;visual.append(image);
      }else{
        visual.classList.add('look-placeholder');
        for(const item of look.recipe.items.filter(i=>i.role!=='accessory')){const block=node('div');block.style.flex=String(item.area);block.style.background=item.hex;visual.append(block);}
      }
      const recipeLine=node('p',null,'recipe-line');
      look.recipe.items.forEach((item,i)=>{if(i)recipeLine.append(document.createTextNode(' / '));recipeLine.append(node('span',`${item.name} ${item.item}`));});
      const notices=node('div',null,'look-notices');
      const stale=look.image&&look.imageRecipeKey!==recipeKey(look.recipe,entry.options);
      if(stale)notices.append(node('p',local?.connected&&!local.invalid?'搭配已更新。点「重新生成」更新效果图。':'搭配已更新。复制新的提示词，重新生成。'));
      if(look.validation.status==='difference'){
        const difference=node('details');difference.append(node('summary','色差'),node('p','效果图颜色有偏差，以色块为准。'));notices.append(difference);
      }
      if(look.validation.items.some(i=>i.status==='small'||i.status==='missing'&&smallCategories.has(i.category)))notices.append(node('p','小件，未核对'));
      const unseen=[...new Set(look.validation.items.filter(i=>i.status==='missing'&&!smallCategories.has(i.category)).map(i=>i.category))];
      if(unseen.length)notices.append(node('p',`未识别到 ${unseen.join(' / ')}，未核对`));
      if(local?.connected){
        const state=generation.get(look.id);
        if(local.message)notices.append(node('p',local.message));
        if(local.invalid){notices.append(node('p',local.invalidText));}
        else if(processing.has(look.id)){notices.append(node('p','核对中'));}
        else if(state?.state==='queued'||state?.state==='generating'){
          notices.append(node('p',state.state==='queued'?'排队中':'生成中'));
          if(local.waitingAgent&&state.state==='queued')notices.append(node('p',local.waitingText));
          notices.append(action('取消',()=>void local.cancel(look.id)));
        }else{
          if(state?.error)notices.append(node('p',state.error));
          if(state?.state==='cancelled'&&local.discardOnCancel)notices.append(node('p','已取消。已开始的生成可能仍会计入用量。'));
          const generate=action(state?.state==='failed'||state?.state==='busy'?'重试':look.image||state?.state==='interrupted'?'重新生成':local.fill('用 {供应方} 生成'),()=>void autoLook(index,Boolean(look.image)||state?.state==='interrupted'));
          generate.disabled=!local.available||processing.has(look.id);notices.append(generate);
        }
      }
      const panel=node('details',null,'generate-panel');panel.open=opened[index]??index===0;
      panel.append(node('summary',look.image?'换一张':'生成效果图'));
      const contents=node('div',null,'generation-contents');
      if(index===0)contents.append(node('p','先选一套生成。','panel-intro'));
      contents.append(node('h3','1　复制提示词'));
      const textarea=node('textarea');textarea.readOnly=true;textarea.value=promptFor(look.recipe,entry.options);textarea.setAttribute('aria-label','1　复制提示词');textarea.spellcheck=false;
      const feedback=node('p',null,'copy-status');feedback.setAttribute('role','status');
      const copy=action('复制',async()=>{
        try{await navigator.clipboard.writeText(textarea.value);copy.textContent='已复制';feedback.textContent='';}
        catch{feedback.textContent=matchMedia('(max-width:640px)').matches?'无法自动复制。长按下方文字，全选复制。':'无法自动复制。全选下方文字后复制。';textarea.focus();textarea.select();}
      });
      contents.append(textarea,copy,feedback,node('h3','2　粘贴到任意能生成图片的 AI'),node('p','豆包、即梦、ChatGPT、Gemini 等。'));
      const input=node('input');input.type='file';input.accept='image/*';input.hidden=true;
      const upload=action('',()=>input.click(),'return-image');
      upload.append(node('span','3　拖入或粘贴生成的图片','desktop-copy'),node('span','3　从相册选择生成的图片','mobile-copy'));
      upload.disabled=processing.has(look.id);
      input.addEventListener('change',()=>{const file=input.files[0];input.value='';if(file)void uploadLook(index,file);});
      const status=node('p',processing.has(look.id)?'核对中':'','look-status');status.setAttribute('role','status');
      contents.append(upload,input,status);
      const swatch=node('details',null,'swatch-panel');swatch.append(node('summary','色卡'),node('p','颜色偏差大时，把色卡和提示词一起发送。'));
      const swatchCanvas=drawSwatch(look.recipe),swatchImage=node('img');swatchImage.src=swatchCanvas.toDataURL('image/png');swatchImage.alt='色卡';
      swatch.append(swatchImage,action('下载色卡',()=>swatchCanvas.toBlob(blob=>blob&&downloadBlob(blob,`色卡-LOOK-0${index+1}.png`)),'desktop-copy'),node('p','长按色卡存入相册。','mobile-copy'));
      swatch.addEventListener('toggle',()=>{textarea.value=promptFor(look.recipe,entry.options,swatch.open);copy.textContent='复制';});
      contents.append(swatch);panel.append(contents);
      card.append(label,title,description,visual,recipeLine,notices,panel);
      card.addEventListener('dragover',event=>{event.preventDefault();event.stopPropagation();card.classList.add('dragging');});
      card.addEventListener('dragleave',()=>card.classList.remove('dragging'));
      card.addEventListener('drop',event=>{
        event.preventDefault();event.stopPropagation();card.classList.remove('dragging');document.body.classList.remove('dragging');
        const file=[...event.dataTransfer.files].find(f=>f.type.startsWith('image/'));
        if(file)void uploadLook(index,file);else status.textContent='先保存图片，再拖入或粘贴。';
      });
      card.addEventListener('paste',event=>{
        const item=[...(event.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));
        if(!item)return;event.preventDefault();event.stopPropagation();void uploadLook(index,item.getAsFile());
      });
      looksRoot.append(card);
    });
  }
  async function uploadLook(index,file,source='manual',snapshot=null){
    const look=entry.looks[index];
    if(processing.has(look.id))return;
    const owner=entry.id,recipe=snapshot?.recipe||structuredClone(look.recipe),key=snapshot?.key||recipeKey(recipe,entry.options),cacheKey=snapshot?.cacheKey||key;
    processing.add(look.id);renderCards();
    try{
      const image=await decodeImage(file),canvas=imageCanvas(image);
      let extraction;
      try{extraction=await extractImage(canvas);}catch{throw new Error('未识别到人物。换一张。');}
      const validation=validateColors(recipe,extraction),blob=await compressImage(canvas);
      if(!entry||entry.id!==owner)return;
      const target=entry.looks.find(l=>l.id===look.id);
      const provider=snapshot?.provider||null;
      Object.assign(target,{image:blob,imageSource:source,imageProvider:provider,validation,imageRecipeKey:key,updatedAt:new Date().toISOString()});
      entry.imageCache=entry.imageCache.filter(c=>c.key!==cacheKey);
      entry.imageCache.push({key:cacheKey,image:blob,imageSource:source,imageProvider:provider,validation,imageRecipeKey:key});
      saveButton.textContent='收藏';await save();
    }catch(error){
      if(entry?.id===owner){
        processing.delete(look.id);renderCards();
        const status=looksRoot.querySelector(`[data-look="${index}"] .look-status`);
        const messages=['图片超过 20MB。','仅支持 JPG、PNG、WebP。','无法打开 HEIC 格式。截图后上传，或转为 JPG。','未识别到人物。换一张。'];
        if(status)status.textContent=messages.includes(error.message)?error.message:'图片保存失败。重新选择图片。';
      }
      return;
    }finally{processing.delete(look.id);}
    if(entry?.id===owner)renderCards();
  }
  async function autoLook(index,force=false,jobId=null){
    const look=entry?.looks[index];if(!look||!local?.connected||generation.get(look.id)?.state==='generating'||generation.get(look.id)?.state==='queued')return;
    const job=jobId?look.generationJob:null;
    const owner=entry.id,options=structuredClone(job?job.options:entry.options),recipe=structuredClone(job?job.recipe:look.recipe),key=job?job.key:recipeKey(recipe,options),providerKey=job?.providerKey||local.providerKey,cacheKey=`${key}\n${providerKey}`,provider=job?.provider||local.label;
    if(!force&&!job&&look.image)return;
    const cached=entry.imageCache.find(c=>c.key===cacheKey);
    if(cached&&!force&&!job){Object.assign(look,{image:cached.image,imageSource:cached.imageSource,imageProvider:cached.imageProvider,validation:cached.validation,imageRecipeKey:key});renderCards();await save();return;}
    generation.set(look.id,{state:'queued'});renderCards();
    const blob=await local.generate({...look,recipe},options,state=>{
      generation.set(look.id,state);
      if(state.id){
        look.generationJob={id:state.id,instance:state.instance,recipe,options,key,providerKey,provider};
        if(entry?.id===owner)entry.looks.find(l=>l.id===look.id).generationJob=look.generationJob;
        void patchRecentLook(owner,look.id,{generationJob:look.generationJob}).catch(()=>{});
      }
      if(entry?.id===owner)renderCards();
    },{force,job});
    if(!blob){
      if(!['failed','busy','interrupted','cancelled'].includes(generation.get(look.id)?.state))generation.delete(look.id);
      void patchRecentLook(owner,look.id,{generationJob:null}).catch(()=>{});
      if(entry?.id===owner){entry.looks.find(l=>l.id===look.id).generationJob=null;renderCards();}
      return;
    }
    generation.delete(look.id);
    if(entry?.id===owner)delete entry.looks.find(l=>l.id===look.id).generationJob;
    if(entry?.id===owner)await uploadLook(entry.looks.findIndex(l=>l.id===look.id),blob,'auto',{recipe,key,cacheKey,provider});
  }
  saveButton.addEventListener('click',async()=>{
    if(!entry||saving)return;saving=true;saveButton.disabled=true;
    try{await archiveLooks(entry);saveButton.textContent='已收藏';}
    catch(error){onError(storageMessage(error));}
    finally{saving=false;saveButton.disabled=false;}
  });
  document.querySelector('#save-poster').addEventListener('click',async event=>{
    if(!entry)return;const button=event.currentTarget;button.disabled=true;
    try{await savePoster(structuredClone(entry),document.querySelector('#poster-original').checked);}
    catch{onError('海报保存失败。稍后重试。');}
    finally{button.disabled=false;}
  });
  document.querySelector('#resume-open').addEventListener('click',async()=>{
    try{
      const recent=await readRecent();if(!recent)return;
      archived=null;entry=recent;entry.imageCache??=[];fingerprint='';
      await onRestore(recent);optionsControls();root.hidden=false;update(recent);
      if(local){await local.ready;for(let index=0;index<entry.looks.length;index++)if(entry.looks[index].generationJob)void autoLook(index,false,entry.looks[index].generationJob.id);}
    }catch(error){onError(storageMessage(error));}
  });
  void requestPersistence();
  void readRecent().then(recent=>{resume.hidden=!recent;}).catch(error=>onError(storageMessage(error)));
  window.addEventListener('pagehide',releaseUrls);
  return {
    async start(extraction,canvas,kind='reference'){
      archived=null;
      entry=createEntry(extraction,await compressImage(canvas),entry?.options||defaultOptions);
      entry.kind=kind;
      fingerprint='';optionsControls();root.hidden=false;update(extraction);
      if(local){
        const owner=entry.id;await local.ready;if(entry?.id!==owner)return;
        const notice=kind==='reference'&&local.automatic?local.notice():'';if(notice)onError(notice);
        if(kind==='reference'&&local.automatic)for(let index=0;index<entry.looks.length;index++)void autoLook(index);
      }
    },
    async openArchive(record){
      archived=structuredClone(record);
      entry={...record.reference,version:record.version,kind:record.cardType==='personal'?'personal':'reference',looks:[structuredClone(record)],imageCache:[],revision:1};
      await onRestore(entry,true);optionsControls();root.hidden=false;renderCards();
    },
    leave(){archived=null;entry=null;root.hidden=true;releaseUrls();},
    update,
    local,
    hide(){root.hidden=true;},
    current(){return entry;}
  };
}
