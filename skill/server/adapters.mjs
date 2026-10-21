import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const statusCodes=['ready','none','missing','login','api-key','quota','waiting-agent','invalid'];
export const errorCodes=['login','api-key','quota','timeout','missing','failed'];
const costs=['subscription','metered','free','unknown'];
const none=Object.freeze({id:'none',label:'',cost:'unknown',background:false,cancel:'discard',cacheKey:'none',async status(){return 'none';},async generate(){throw Object.assign(new Error('missing'),{code:'missing'});}});

export function checkAdapter(adapter,id){
  const problems=[];
  if(!adapter||typeof adapter!=='object')return ['默认导出必须是对象'];
  if(adapter.id!==id)problems.push('id 必须与文件名一致');
  if(typeof adapter.label!=='string'||!adapter.label.trim()||adapter.label.length>20)problems.push('label 必须是 1–20 个字符');
  if(!costs.includes(adapter.cost))problems.push('cost 必须是 subscription / metered / free / unknown');
  if(typeof adapter.background!=='boolean')problems.push('background 必须是布尔值');
  if(!['stop','discard'].includes(adapter.cancel))problems.push('cancel 必须是 stop 或 discard');
  if(typeof adapter.cacheKey!=='string'||!adapter.cacheKey||adapter.cacheKey.length>200)problems.push('cacheKey 必须是 1–200 个字符');
  if(typeof adapter.status!=='function')problems.push('缺少 status()');
  if(typeof adapter.generate!=='function')problems.push('缺少 generate()');
  if(adapter.environment!==undefined&&(!Array.isArray(adapter.environment)||!adapter.environment.every(name=>/^[A-Z][A-Z0-9_]{0,63}$/.test(name))))problems.push('environment 必须是环境变量名数组');
  if(adapter.concurrency!==undefined&&!(Number.isInteger(adapter.concurrency)&&adapter.concurrency>=1&&adapter.concurrency<=4))problems.push('concurrency 必须是 1–4');
  if(adapter.timeoutMs!==undefined&&!(Number.isInteger(adapter.timeoutMs)&&adapter.timeoutMs>=10000&&adapter.timeoutMs<=900000))problems.push('timeoutMs 必须在 10000–900000 之间');
  return problems;
}

export async function readSelection(root){
  try{
    const data=JSON.parse(await fs.readFile(path.join(root,'generator.json'),'utf8'));
    if(!data||typeof data!=='object'||typeof data.adapter!=='string')return {adapter:'invalid',problem:'generator.json 需要字符串字段 adapter'};
    return {adapter:data.adapter};
  }catch(error){
    if(error.code==='ENOENT')return {adapter:'none'};
    return {adapter:'invalid',problem:'generator.json 无法解析'};
  }
}

export async function loadAdapter(root,id){
  if(id==='none')return {adapter:none,problems:[]};
  if(!/^[a-z0-9-]{1,32}$/.test(id))return {adapter:null,problems:['adapter 名称只能用小写字母、数字和连字符']};
  const folder=path.join(root,'adapters'),file=path.join(folder,id+'.mjs');
  try{
    const [base,real]=await Promise.all([fs.realpath(folder),fs.realpath(file)]);
    if(path.dirname(real)!==base)return {adapter:null,problems:['适配器文件必须直接放在 adapters/ 里']};
    const module=await import(pathToFileURL(real).href);
    const adapter=module.default,problems=checkAdapter(adapter,id);
    return {adapter:problems.length?null:adapter,problems};
  }catch(error){
    return {adapter:null,problems:[error.code==='ENOENT'?`找不到 adapters/${id}.mjs`:'适配器文件无法加载']};
  }
}

export async function selectedAdapter(root){
  const selection=await readSelection(root);
  if(selection.adapter==='invalid')return {adapter:null,problems:[selection.problem]};
  return loadAdapter(root,selection.adapter);
}

export function publicAdapter(adapter){
  if(!adapter)return null;
  return {id:adapter.id,label:adapter.label,cost:adapter.cost,background:adapter.background,cancel:adapter.cancel};
}
