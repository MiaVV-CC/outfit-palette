import {schemaVersion,optionValues} from './schema.mjs';
import {config} from './config.mjs';
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const hex=/^#[\da-f]{6}$/i;
const categories=new Set(['外套','上装','下装','连衣裙','帽子','发饰','墨镜','围巾','首饰','腰带','包','手套','袜子','鞋','配饰','其他']);
const short=(value,max=100)=>typeof value==='string'&&value.length<=max;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const validColor=color=>color&&hex.test(color.hex)&&short(color.name,30)&&Array.isArray(color.lab)&&color.lab.length===3&&color.lab.every(finite);
function checkRecord(record){
  if(!record||record.version!==schemaVersion||!uuid.test(record.id)||!uuid.test(record.entryId)||![1,2,3,'personal'].includes(record.cardType))return false;
  if(!record.reference||record.reference.id!==record.entryId||!Array.isArray(record.reference.palette)||!record.reference.palette.length||record.reference.palette.length>5||!record.reference.palette.every(c=>validColor(c)&&finite(c.share)&&c.share>=0))return false;
  if(!Array.isArray(record.reference.accessories)||record.reference.accessories.length>5||!record.reference.accessories.every(c=>validColor(c)&&categories.has(c.category)))return false;
  if(!Object.entries(optionValues).every(([key,values])=>values.includes(record.reference.options?.[key])))return false;
  if(!record.recipe||!['原样','好穿','跳色','我的穿搭'].includes(record.recipe.name)||!short(record.recipe.description,240)||!Array.isArray(record.recipe.items)||record.recipe.items.length>24)return false;
  if(!record.recipe.items.every(i=>short(i.item,64)&&short(i.name,30)&&categories.has(i.category)&&hex.test(i.hex)&&finite(i.area)&&i.area>0&&i.area<=1&&['outer','inner','top','bottom','dress','detail','accessory'].includes(i.role)))return false;
  if(!record.tags||!optionValues.weather.includes(record.tags.weather)||!optionValues.occasion.includes(record.tags.occasion)||!Array.isArray(record.tags.moods)||record.tags.moods.length>10||!record.tags.moods.every(m=>short(m,32)))return false;
  if(!Array.isArray(record.wornDates)||!record.wornDates.every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))))return false;
  if(!['manual','auto','codex','personal',null].includes(record.imageSource)||!(record.imageProvider===undefined||record.imageProvider===null||short(record.imageProvider,20))||!record.validation||!['pass','difference','unchecked'].includes(record.validation.status)||!Array.isArray(record.validation.items)||record.validation.items.length>24)return false;
  if(!record.validation.items.every(i=>i&&typeof i==='object'&&['pass','difference','small','missing'].includes(i.status)&&categories.has(i.category)))return false;
  return short(record.createdAt,40)&&short(record.updatedAt,40)&&short(record.savedAt,40);
}
function asBase64(blob){
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.slice(reader.result.indexOf(',')+1));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
}
async function digest(blob){
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));
  return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function exportBackup(records){
  const images={},looks=[];
  async function imageId(blob){
    if(!blob)return null;
    const id=await digest(blob);
    if(!images[id])images[id]={type:blob.type,data:await asBase64(blob)};
    return id;
  }
  for(const record of records){
    const copy=structuredClone(record);
    copy.image=await imageId(record.image);copy.reference.original=await imageId(record.reference.original);
    looks.push(copy);
  }
  return new Blob([JSON.stringify({format:'outfit-workbench',version:schemaVersion,createdAt:new Date().toISOString(),images,looks})],{type:'application/json'});
}
export async function parseBackup(file){
  const data=JSON.parse(await file.text());
  if(data?.format!=='outfit-workbench'||data.version!==schemaVersion||!Array.isArray(data.looks)||!data.images||typeof data.images!=='object'||!data.looks.every(checkRecord))throw new Error('Invalid backup');
  const blobs=new Map();
  async function decode(id){
    if(id===null)return null;
    if(!/^[\da-f]{64}$/.test(id))throw new Error('Invalid image reference');
    if(blobs.has(id))return blobs.get(id);
    const encoded=data.images[id];
    if(!encoded||!['image/jpeg','image/png','image/webp'].includes(encoded.type)||typeof encoded.data!=='string'||encoded.data.length>config.maxUploadBytes*4/3+4)throw new Error('Invalid image');
    const binary=atob(encoded.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:encoded.type});
    if(await digest(blob)!==id)throw new Error('Invalid image checksum');
    const bitmap=await createImageBitmap(blob);bitmap.close();blobs.set(id,blob);return blob;
  }
  const records=[];
  for(const record of data.looks){
    const image=await decode(record.image),original=await decode(record.reference.original);
    if(!original)throw new Error('Missing original image');
    records.push({...record,image,reference:{...record.reference,original}});
  }
  return records;
}
