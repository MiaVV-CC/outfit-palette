import {colorInfo,delta} from './colors.mjs';
import {config} from './config.mjs';
export const smallCategories=new Set(['首饰','手套','袜子','发饰','其他','配饰']);
export function validateColors(recipe,extraction){
  if(extraction.hasPerson===false)throw new Error('未识别到人物。换一张。');
  const items=recipe.items.map(item=>{
    const accessory=item.role==='accessory';
    const candidates=accessory?extraction.accessories.filter(a=>a.category===item.category):extraction.palette;
    if(!candidates.length)return {item:item.item,category:item.category,status:accessory&&smallCategories.has(item.category)?'small':'missing',deltaE:null};
    const visible=candidates.filter(c=>!accessory||c.source!=='model'||c.pixels>=config.minimumAccessoryPixels);
    if(!visible.length)return {item:item.item,category:item.category,status:'small',deltaE:null};
    const target=colorInfo(item.hex).lab,distance=Math.min(...visible.map(c=>delta(target,c.lab)));
    return {item:item.item,category:item.category,status:distance>config.colorTolerance?'difference':'pass',deltaE:distance};
  });
  const status=items.some(i=>i.status==='difference')?'difference':items.some(i=>['missing','small'].includes(i.status))?'unchecked':'pass';
  return {status,items};
}
