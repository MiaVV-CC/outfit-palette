export const schemaVersion=1;
export const defaultOptions=Object.freeze({occasion:'日常',weather:'温和',model:'女',background:'影棚'});
export const optionValues=Object.freeze({occasion:['日常','通勤','约会','正式'],weather:['热','温和','凉','冷'],model:['女','男'],background:['影棚','街头']});
export const moodValues=['显气色','低调','放松','精神'];
export function cleanOptions(value={}){
  return Object.fromEntries(Object.entries(defaultOptions).map(([key,fallback])=>[key,optionValues[key].includes(value[key])?value[key]:fallback]));
}
export function createEntry(extraction,original,options={}){
  const now=new Date().toISOString();
  return {version:schemaVersion,id:crypto.randomUUID(),kind:'reference',createdAt:now,updatedAt:now,original,palette:structuredClone(extraction.palette),accessories:structuredClone(extraction.accessories),geometry:{bounds:extraction.bounds,width:extraction.width,height:extraction.height,clothingMask:extraction.clothingMask,fullBody:extraction.fullBody},options:cleanOptions(options),looks:[],imageCache:[],revision:1};
}
export function createLook(entryId,index,recipe,options,id=crypto.randomUUID()){
  return {version:schemaVersion,id,entryId,cardType:index+1,recipe,image:null,imageSource:null,validation:{status:'unchecked',items:[]},imageRecipeKey:null,tags:{weather:options.weather,occasion:options.occasion,moods:[]},wornDates:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
}
export function recipeKey(recipe,options){
  return JSON.stringify({items:recipe.items.map(({category,item,hex,area,role})=>({category,item,hex,area,role})),options});
}
export function validateEntry(entry){
  return Boolean(entry&&entry.version===schemaVersion&&typeof entry.id==='string'&&['reference','personal'].includes(entry.kind)&&entry.original instanceof Blob&&Array.isArray(entry.palette)&&entry.palette.length>0&&entry.palette.every(c=>/^#[0-9A-F]{6}$/i.test(c.hex)&&Number.isFinite(c.share)&&c.share>=0)&&Array.isArray(entry.accessories)&&Array.isArray(entry.looks));
}
