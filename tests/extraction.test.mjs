import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.ImageData??=class{constructor(width,height){this.width=width;this.height=height;this.data=new Uint8ClampedArray(width*height*4);}};
const {extract}=await import('../skill/web/lib/extraction.mjs');

function fixture(height=128,shoe=true){
  const width=64,pixels=new ImageData(width,height),mask=new Uint8Array(width*height);
  function region(x0,y0,x1,y1,category,color){
    for(let y=y0;y<Math.min(y1,height);y++)for(let x=x0;x<x1;x++){const i=y*width+x;mask[i]=category;pixels.data.set([...color,255],i*4);}
  }
  region(26,8,38,20,3,[200,150,120]);
  region(20,25,44,118,4,[230,20,20]);
  region(22,118,40,125,shoe?5:4,shoe?[20,40,230]:[230,20,20]);
  if(height<128)region(39,86,43,95,5,[150,90,20]);
  return extract(pixels,mask,width,height);
}

test('取色：合成人像的鞋、服装、半身与占比',()=>{
  const withShoes=fixture(),withoutShoes=fixture(128,false),half=fixture(96);
  assert.ok(withShoes.accessories.some(a=>a.category==='鞋'&&a.hex==='#1428E6'),'鞋色仅来自鞋区');
  assert.ok(withShoes.palette.every(c=>c.hex==='#E61414'),'服装色不含鞋色');
  assert.ok(!withoutShoes.accessories.some(a=>a.category==='鞋'),'裤脚不能作为鞋补色');
  assert.ok(!half.accessories.some(a=>a.category==='鞋')&&!half.fullBody,'半身图底部配饰不能作为鞋');
  assert.ok([withShoes,withoutShoes,half].every(r=>r.palette.reduce((s,c)=>s+c.percent,0)===100),'颜色占比合计 100');
});
