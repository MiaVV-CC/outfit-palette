import {colors,colorInfo,delta} from './colors.mjs';
import {config} from './config.mjs';
import {cleanOptions} from './schema.mjs';
import {clothingFor,accessoryFor,modelDescriptions,backgrounds} from './catalog.mjs';

const neutralNames=new Set(colors.slice(0,40).map(c=>c.name));
const neutral=color=>neutralNames.has(color.name)||color.chroma<config.neutralChroma||['藏青','海军蓝'].includes(color.name);
const byName=name=>colorInfo(colors.find(c=>c.name===name).hex);
const bright=color=>!neutralNames.has(color.name)&&color.chroma>=config.accentChroma;
const neutralPool=['米白','炭灰','米色','深咖'].map(byName);
const accentPool=['雾霾蓝','鼠尾草绿','奶茶粉'].map(byName);
const nearest=(color,pool)=>pool.reduce((a,b)=>delta(a.lab,color.lab)<=delta(b.lab,color.lab)?a:b);
function normalizePalette(input){
  if(!Array.isArray(input)||!input.length)throw new Error('未识别到服装。换一张人物清晰的全身照。');
  const values=input.map(c=>{
    if(!/^#[\da-f]{6}$/i.test(c.hex))throw new Error('Invalid color');
    return {...colorInfo(c.hex),share:Number.isFinite(c.share)?c.share:Number(c.percent||0)/100,upperShare:Number.isFinite(c.upperShare)?Math.max(0,Math.min(1,c.upperShare)):undefined,position:['upper','lower','both'].includes(c.position)?c.position:'both'};
  }).filter(c=>c.share>0).sort((a,b)=>b.share-a.share);
  if(!values.length)throw new Error('Invalid color shares');
  const total=values.reduce((s,c)=>s+c.share,0);return values.map(c=>({...c,share:c.share/total}));
}
function garments(palette,options,index){
  const selected=[...palette].sort((a,b)=>b.share-a.share);
  const upperWeight=c=>c.upperShare??(c.position==='upper'?1:c.position==='lower'?0:config.recipeBothUpperShare);
  const upper=[...selected].sort((a,b)=>b.share*upperWeight(b)-a.share*upperWeight(a))[0];
  const lower=[...selected].sort((a,b)=>b.share*(1-upperWeight(b))-a.share*(1-upperWeight(a)))[0];
  const remaining=selected.find(c=>c!==upper&&c!==lower&&c.position!=='lower')||upper;
  const names=clothingFor(options,index),topShare=upper===lower?config.recipeDefaultUpperShare:upper.share/(upper.share+lower.share);
  const pieces=[];
  if(names.outer){
    const innerShare=Math.min(config.recipeInnerShare,topShare*config.recipeInnerFraction);
    pieces.push({category:'外套',item:names.outer,role:'outer',color:upper,area:topShare-innerShare});
    pieces.push({category:'上装',item:names.top,role:'inner',color:remaining,area:innerShare});
  }else pieces.push({category:'上装',item:names.top,role:'top',color:upper,area:topShare});
  pieces.push({category:'下装',item:names.bottom,role:'bottom',color:lower,area:1-topShare});
  for(const color of selected){
    if(pieces.some(p=>p.color.hex===color.hex))continue;
    const base=pieces.find(p=>p.role===(color.position==='lower'?'bottom':names.outer?'outer':'top'));
    pieces.push({category:base.category,item:`${base.item}拼色`,role:'detail',parentRole:base.role,color,area:color.share});
  }
  const colorShares=new Map();
  for(const color of selected)colorShares.set(color.hex,(colorShares.get(color.hex)||0)+color.share);
  const total=[...colorShares.values()].reduce((s,v)=>s+v,0);
  return pieces.map(({color,...item})=>{
    const matching=pieces.filter(p=>p.color.hex===color.hex).reduce((s,p)=>s+p.area,0);
    return {...item,area:item.area/matching*colorShares.get(color.hex)/total,name:color.name,hex:color.hex};
  });
}
function accessory(category,color,options,index){
  return {category,item:accessoryFor(category,options,index),role:'accessory',name:color.name,hex:color.hex,area:config.recipeAccessoryArea};
}
function completeAccessories(source,options,index,fallback){
  const result=source.map(a=>accessory(a.category||'配饰',a,options,index));
  if(!result.some(a=>a.category==='鞋'))result.push(accessory('鞋',fallback,options,index));
  if(result.length<2)result.push(accessory('包',fallback,options,index));
  const shoe=result.find(a=>a.category==='鞋');
  if(!shoe.item.includes('凉鞋')&&!result.some(a=>a.category==='袜子'))result.push(accessory('袜子',fallback,options,index));
  return result;
}
export function promptFor(recipe,options,swatch=false){
  const prompt=`生成一张时尚杂志风格的真人全身照：${modelDescriptions[options.model]}，自然站立，面向镜头，从头到脚完整入镜。\n穿搭（颜色要准确）：\n${recipe.items.map(i=>`- ${i.item}：${i.name}（${i.hex}）`).join('\n')}\n背景：${backgrounds[options.background]}。柔和自然光，面料质感真实，竖版 3:4。\n画面里不要文字、不要 logo、不要水印。`;
  return prompt+(swatch?'\n附图只是颜色参考，不要修改这张图，按上面的要求生成真人照片。':'');
}
export function generateRecipes(input){
  const palette=normalizePalette(input.palette),options=cleanOptions(input.options);
  const original=(input.accessories||[]).filter(a=>/^#[\da-f]{6}$/i.test(a.hex)).map(a=>({...a,...colorInfo(a.hex)}));
  const originalAccents=original.filter(a=>a.accent).sort((a,b)=>Number(!neutral(b))-Number(!neutral(a))||b.chroma-a.chroma);
  const colorful=palette.filter(bright),neutrals=palette.filter(neutral);
  const type=colorful.length===0?'neutral':colorful.length===1?'accent':'colorful';
  const main=palette[0],fallback=nearest(main,neutralPool);
  const coloredClothes=palette.filter(c=>!neutral(c));
  const kept=type==='colorful'?palette.filter(c=>neutral(c)||coloredClothes.indexOf(c)<2):palette;
  const removed=type==='colorful'?coloredClothes.slice(2).map(c=>c.name):[];
  const first={name:'原样',description:removed.length?`原图比例　去掉 ${removed.join(' / ')}`:'原图比例',items:[...garments(kept,options,0),...completeAccessories(original,options,0,fallback)]};
  let easyPalette,easyDescription;
  if(type==='neutral'){
    const opposite=palette.length===1?byName(main.lab[0]<config.lightnessSplit?'米白':'炭灰'):[...palette].sort((a,b)=>Math.abs(b.lab[0]-main.lab[0])-Math.abs(a.lab[0]-main.lab[0]))[0];
    easyPalette=[{...opposite,share:config.recipeDefaultUpperShare,position:'upper',upperShare:1},{...main,share:1-config.recipeDefaultUpperShare,position:'lower',upperShare:0}];
    easyDescription=palette.length===1?`加 ${opposite.name}`:'深浅对调';
  }else if(type==='accent'){
    easyPalette=neutrals.length?neutrals:neutralPool.slice(0,2).map((c,i)=>({...c,share:.5,position:i?'lower':'upper',upperShare:i?0:1}));
    easyDescription=`去掉 ${colorful[0].name}`;
  }else{
    easyPalette=[{...colorful[0],share:config.recipeDefaultUpperShare,position:'upper',upperShare:1},{...(neutrals[0]||fallback),share:1-config.recipeDefaultUpperShare,position:'lower',upperShare:0}];
    easyDescription=`只留 ${colorful[0].name}`;
  }
  const easyAccessories=original.map(a=>{
    if(a===originalAccents[0])return a;
    return {...a,...nearest(a,neutralPool)};
  });
  const second={name:'好穿',description:easyDescription,items:[...garments(easyPalette,options,1),...completeAccessories(easyAccessories,options,1,fallback)]};
  const quietPalette=type==='neutral'?palette:palette.map(c=>neutral(c)?c:{...c,...nearest(c,neutralPool)});
  const baseAccessories=completeAccessories(original.map(a=>({...a,...nearest(a,neutralPool)})),options,2,fallback);
  const distinctAccents=[];
  for(const color of [...originalAccents.filter(c=>!neutral(c)),...colorful])if(!distinctAccents.some(c=>delta(c.lab,color.lab)<config.mergeDeltaE))distinctAccents.push(color);
  const softAccents=accentPool.filter(c=>delta(c.lab,main.lab)>=config.mergeDeltaE);
  const accents=type==='neutral'?[nearest(main,softAccents.length?softAccents:accentPool)]:type==='accent'?[distinctAccents[0]||colorful[0]]:distinctAccents.slice(0,2);
  const preferred=originalAccents.map(a=>a.category).concat(original.map(a=>a.category),['鞋','包','围巾']);
  const picked=[];
  for(const color of accents){
    const category=preferred.find(category=>!picked.some(p=>p.category===category))||'围巾';
    let item=baseAccessories.find(a=>a.category===category);
    if(!item){item=accessory(category,color,options,2);baseAccessories.push(item);}
    Object.assign(item,{name:color.name,hex:color.hex});picked.push(item);
  }
  const third={name:'跳色',description:picked.map(i=>`${i.name} ${i.item}`).join(' / '),items:[...garments(quietPalette,options,2),...baseAccessories]};
  return {type,options,recipes:[first,second,third].map((recipe,index)=>({...recipe,index,prompt:promptFor(recipe,options)}))};
}
