import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRecipes,promptFor} from '../skill/web/lib/recipes.mjs';
import {optionValues} from '../skill/web/lib/schema.mjs';

test('三套搭配规则：64 种选项组合 × 4 组合成配色',()=>{
const samples=[
  {palette:[{hex:'#181818',share:1,position:'both'}],accessories:[]},
  {palette:[{hex:'#202C46',share:.6,position:'upper'},{hex:'#B5A17C',share:.4,position:'lower'}],accessories:[{category:'帽子',hex:'#782F40',accent:true}]},
  {palette:[{hex:'#181818',share:.7,position:'lower'},{hex:'#E23432',share:.3,position:'upper'}],accessories:[{category:'腰带',hex:'#3156B4',accent:true}]},
  {palette:[{hex:'#E23432',share:.4,position:'upper'},{hex:'#3156B4',share:.3,position:'lower'},{hex:'#777C4D',share:.2,position:'lower'},{hex:'#F5F5F3',share:.1,position:'both'}],accessories:[{category:'帽子',hex:'#782F40',accent:true},{category:'包',hex:'#E3C541',accent:true}]}
];
let count=0;
for(const occasion of optionValues.occasion)for(const weather of optionValues.weather)for(const model of optionValues.model)for(const background of optionValues.background)for(const sample of samples){
  const result=generateRecipes({...sample,options:{occasion,weather,model,background}});
  assert.equal(result.recipes.length,3);
  assert.equal(new Set(result.recipes.map(r=>r.items.map(i=>i.item).join('|'))).size,3);
  for(const recipe of result.recipes){
    const clothes=recipe.items.filter(i=>i.role!=='accessory'),accessories=recipe.items.filter(i=>i.role==='accessory');
    assert.ok(accessories.length>=2);
    assert.ok(accessories.some(i=>i.category==='鞋'));
    assert.ok(Math.abs(clothes.reduce((s,i)=>s+i.area,0)-1)<1e-8);
    assert.ok(!recipe.items.some(i=>!Number.isFinite(i.area)||i.area<=0));
    if(clothes.some(i=>i.role==='outer'))assert.ok(clothes.some(i=>i.role==='inner'));
    if(model==='男')assert.ok(!recipe.items.some(i=>i.item.includes('裙')));
    for(const item of recipe.items)assert.ok(recipe.prompt.includes(`- ${item.item}：${item.name}（${item.hex}）`));
    assert.ok(!recipe.prompt.includes('附图只是颜色参考'));
    assert.ok(promptFor(recipe,result.options,true).endsWith('附图只是颜色参考，不要修改这张图，按上面的要求生成真人照片。'));
    count++;
  }
  for(const item of sample.accessories)assert.ok(result.recipes[0].items.some(i=>i.category===item.category&&i.hex.toLowerCase()===item.hex.toLowerCase()));
}
const single=generateRecipes(samples[0]);
assert.equal(single.recipes[1].description,'加 米白');
const colored=generateRecipes(samples[2]);
assert.ok(colored.recipes[2].items.some(i=>i.category==='腰带'&&i.hex==='#3156B4'));
const tinyUpper=generateRecipes({palette:[{hex:'#181818',share:.93,position:'both',upperShare:.4},{hex:'#EEE9DD',share:.07,position:'upper',upperShare:1}],accessories:[]});
assert.equal(tinyUpper.recipes[0].items.find(i=>i.role==='outer').hex,'#181818');
assert.equal(tinyUpper.recipes[0].items.find(i=>i.role==='inner').hex,'#EEE9DD');
assert.equal(tinyUpper.recipes[1].items.find(i=>i.role==='bottom').hex,'#181818');
assert.equal(count,4*4*2*2*4*3);
});
