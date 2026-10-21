import path from 'node:path';
import fs from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import {optionValues} from '../web/lib/schema.mjs';
import {clothingFor,accessoryFor} from '../web/lib/catalog.mjs';
import {colorInfo} from '../web/lib/colors.mjs';
const categories=['帽子','发饰','墨镜','围巾','首饰','腰带','包','手套','袜子','鞋','配饰','其他'];
const vocabulary=new Map();
for(const weather of optionValues.weather)for(const occasion of optionValues.occasion)for(const model of optionValues.model)for(let index=0;index<3;index++){
  const options={weather,occasion,model},clothes=clothingFor(options,index);
  for(const [key,category] of [['outer','外套'],['top','上装'],['bottom','下装']]){
    if(!clothes[key])continue;
    for(const name of [clothes[key],clothes[key]+'拼色']){if(!vocabulary.has(category))vocabulary.set(category,new Set());vocabulary.get(category).add(name);}
  }
  for(const category of categories){if(!vocabulary.has(category))vocabulary.set(category,new Set());vocabulary.get(category).add(accessoryFor(category,options,index));}
}
export function equals(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);
}
export async function safeFile(root,relative){
  if(typeof relative!=='string'||relative.includes('\0')||relative.includes('\\')||relative.split('/').includes('..'))throw new Error('Invalid path');
  const base=await fs.realpath(root),lexical=path.resolve(base,relative);
  if(lexical!==base&&!lexical.startsWith(base+path.sep))throw new Error('Invalid path');
  const candidate=await fs.realpath(lexical);
  if(candidate!==base&&!candidate.startsWith(base+path.sep))throw new Error('Invalid path');
  return candidate;
}
export function validatedRecipe(payload){
  if(!payload||typeof payload!=='object'||Object.keys(payload).some(k=>!['recipe','options','key'].includes(k)))throw new Error('Invalid request');
  if(payload.key!==undefined&&!/^[a-f0-9-]{36}$/.test(payload.key))throw new Error('Invalid key');
  if(!payload.options||Object.keys(payload.options).length!==4||!Object.entries(optionValues).every(([key,values])=>values.includes(payload.options[key])))throw new Error('Invalid options');
  const source=payload.recipe;
  if(!source||!Array.isArray(source.items)||source.items.length<3||source.items.length>24)throw new Error('Invalid recipe');
  const items=source.items.map(item=>{
    if(!vocabulary.get(item.category)?.has(item.item)||!/^#[0-9a-f]{6}$/i.test(item.hex)||!Number.isFinite(item.area)||item.area<=0||item.area>1||!['outer','inner','top','bottom','detail','accessory'].includes(item.role))throw new Error('Invalid item');
    return {category:item.category,item:item.item,hex:item.hex.toUpperCase(),name:colorInfo(item.hex).name,area:item.area,role:item.role};
  });
  if(!items.some(i=>i.category==='鞋')||items.filter(i=>i.role==='accessory').length<2||items.some(i=>i.role==='outer')&&!items.some(i=>i.role==='inner'))throw new Error('Incomplete recipe');
  return {recipe:{items},options:payload.options,force:Boolean(payload.key)};
}
