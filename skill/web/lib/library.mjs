import {readArchive,updateArchive,removeArchive,mergeArchive} from './storage.mjs';
import {optionValues,moodValues} from './schema.mjs';
import {filterLooks,chooseLook,localDate} from './collection.mjs';
import {exportBackup,parseBackup} from './backup.mjs';
import {downloadBlob} from './media.mjs';

const el=(tag,text,cls='')=>{const element=document.createElement(tag);element.className=cls;if(text)element.textContent=text;return element;};
const button=(text,fn,cls='')=>{const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;};
const $=selector=>document.querySelector(selector);
export function createLibrary({showView,openLook,addPersonal,onError}){
  let records=[],urls=[],active=null,view='archive',selected=null,excluded=[];
  const filters={},query={weather:'温和',occasion:'日常',mood:''};
  const fail=error=>onError(error?.name==='QuotaExceededError'?'存储空间不足。导出备份后删除部分收藏。':'无法读取或保存数据。检查浏览器是否禁止网站存储。');
  function release(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
  function image(record){
    const visual=el('div',null,'look-visual');
    if(record.image){const img=el('img');img.src=URL.createObjectURL(record.image);urls.push(img.src);img.alt=record.recipe.name;visual.append(img);}
    else{visual.classList.add('look-placeholder');for(const item of record.recipe.items.filter(i=>i.role!=='accessory')){const block=el('div');block.style.flex=item.area;block.style.background=item.hex;visual.append(block);}}
    return visual;
  }
  function lastWorn(record){
    const date=[...record.wornDates].sort().at(-1);if(!date)return '';
    const [,month,day]=date.split('-').map(Number);return `上次穿　${month}月${day}日`;
  }
  function controls(root,state,all,onChange){
    root.replaceChildren();
    const moods=[...new Set([...moodValues,...records.flatMap(r=>r.tags.moods)])];
    for(const [key,label,values] of [['weather','天气',optionValues.weather],['occasion','场合',optionValues.occasion],['mood','心情',moods]]){
      const container=el('label',label),select=el('select');select.setAttribute('aria-label',label);
      if(all||key==='mood'){const option=el('option','全部');option.value='';select.append(option);}
      for(const value of values){const option=el('option',value);option.value=value;select.append(option);}
      select.value=state[key]||'';
      select.addEventListener('change',()=>{state[key]=select.value;onChange();});
      container.append(select);root.append(container);
    }
  }
  function grid(){
    release();const root=$('#archive-grid');root.replaceChildren();
    const list=filterLooks(records,filters);
    if(!list.length){root.append(el('p',records.length?'无匹配':'暂无收藏'));if(!records.length)root.append(button('上传穿搭',()=>$('#upload-again').click()));return;}
    for(const record of list){
      const card=button('',()=>void detail(record),'archive-card');card.append(image(record),el('h2',record.recipe.name),el('p',[record.tags.weather,record.tags.occasion,...record.tags.moods].join(' / ')));
      if(lastWorn(record))card.append(el('p',lastWorn(record)));
      root.append(card);
    }
  }
  async function refresh(){records=await readArchive();records.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));}
  async function open(mode='archive'){
    try{
      await refresh();active=null;view=mode;showView(mode);$('#archive-detail').hidden=true;
      if(mode==='archive'){controls($('#archive-filters'),filters,true,grid);grid();}
      else{release();excluded=[];selected=null;$('#today-result').replaceChildren();controls($('#today-options'),query,false,()=>{excluded=[];selected=null;$('#today-result').replaceChildren();});}
    }catch(error){fail(error);}
  }
  async function detail(record){
    active=record.id;showView('detail');$('#archive-detail').hidden=false;await openLook(record);
    const root=$('#detail-actions');root.replaceChildren();
    root.append(el('p',[record.tags.weather,record.tags.occasion,...record.tags.moods].join(' / ')),button('标签',()=>tags(record)),button('删除',()=>confirmDelete(record)));
    if(lastWorn(record))root.prepend(el('p',lastWorn(record)));
  }
  function tags(record){
    const dialog=$('#tags-dialog'),root=$('#tags-fields');root.replaceChildren();
    const draft=structuredClone(record.tags);
    for(const [key,label] of [['weather','天气'],['occasion','场合']]){
      const field=el('label',label),select=el('select');select.setAttribute('aria-label',label);
      for(const value of optionValues[key]){const option=el('option',value);option.value=value;select.append(option);}
      select.value=draft[key];select.addEventListener('change',()=>draft[key]=select.value);field.append(select);root.append(field);
    }
    const moodSet=new Set(draft.moods),moods=el('div',null,'mood-options');
    for(const mood of new Set([...moodValues,...draft.moods])){
      const label=el('label'),input=el('input');input.type='checkbox';input.checked=moodSet.has(mood);
      input.addEventListener('change',()=>input.checked?moodSet.add(mood):moodSet.delete(mood));label.append(input,document.createTextNode(mood));moods.append(label);
    }
    const custom=el('input');custom.placeholder='自定义';custom.setAttribute('aria-label','自定义');custom.maxLength=32;
    root.append(el('p','心情'),moods,custom,button('完成',async()=>{
      if(custom.value.trim())moodSet.add(custom.value.trim());draft.moods=[...moodSet].slice(0,10);
      try{const latest=(await readArchive()).find(r=>r.id===record.id);if(latest){latest.tags=draft;latest.updatedAt=new Date().toISOString();await updateArchive(latest);dialog.close();await refresh();await detail(latest);}}
      catch(error){fail(error);}
    }));
    dialog.showModal();
  }
  function confirmDelete(record){
    const dialog=$('#delete-dialog'),confirm=$('#delete-confirm');
    confirm.onclick=async()=>{
      try{await removeArchive(record.id);dialog.close();await open(view);}catch(error){fail(error);}
    };
    dialog.showModal();
  }
  async function pick(){
    try{
      await refresh();selected=chooseLook(records,query,excluded);release();const root=$('#today-result');root.replaceChildren();
      if(!selected){root.append(el('p','暂无收藏'),button('上传穿搭',()=>$('#upload-again').click()));return;}
      excluded.push(selected.record.id);const record=selected.record;
      const card=button('',()=>void detail(record),'archive-card');card.append(image(record),el('h2',record.recipe.name),el('p',record.recipe.items.map(i=>`${i.name} ${i.item}`).join(' / ')));root.append(card);
      if(!selected.exact)root.append(el('p','无完全匹配。这套最接近。'));
      const wear=button('就穿这套',async()=>{
        try{const latest=(await readArchive()).find(r=>r.id===record.id);if(!latest)return;latest.wornDates=[...new Set([...latest.wornDates,localDate()])];latest.updatedAt=new Date().toISOString();await updateArchive(latest);wear.textContent='已记录';wear.disabled=true;}catch(error){fail(error);}
      });
      root.append(wear,button('换一套',()=>void pick()));
    }catch(error){fail(error);}
  }
  $('#open-archive').addEventListener('click',()=>void open('archive'));
  $('#open-today').addEventListener('click',()=>void open('today'));
  $('#add-personal').addEventListener('click',addPersonal);
  $('#today-pick').addEventListener('click',()=>{excluded=[];void pick();});
  $('#export-backup').addEventListener('click',async()=>{
    try{const blob=await exportBackup(await readArchive());downloadBlob(blob,`穿搭工作台备份-${localDate().replaceAll('-','')}.json`);}catch(error){fail(error);}
  });
  $('#import-backup').addEventListener('click',()=>$('#backup-file').click());
  $('#backup-file').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    try{const result=await mergeArchive(await parseBackup(file));await open('archive');onError(result.skipped?`已导入 ${result.added} 套，跳过重复 ${result.skipped} 套`:`已导入 ${result.added} 套`);}
    catch(error){onError(error?.name==='QuotaExceededError'?'存储空间不足。导出备份后删除部分收藏。':'无法导入。选择穿搭工作台导出的备份文件。');}
  });
  window.addEventListener('pagehide',release);
  return {open,back(){return open(view);},changed:refresh};
}
