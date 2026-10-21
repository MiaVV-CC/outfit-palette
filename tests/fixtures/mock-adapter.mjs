import fs from 'node:fs/promises';
import path from 'node:path';
import {syntheticPng} from '../helpers.mjs';

const delay=Number(process.env.OUTFIT_MOCK_DELAY||4000);
const sample=process.env.OUTFIT_MOCK_IMAGE||null;

export default {
  id:'mock',label:'模拟工具',cost:'subscription',background:true,cancel:'stop',cacheKey:'mock/v1',concurrency:3,timeoutMs:60000,
  async status(){return 'ready';},
  async generate({directory,signal}){
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(resolve,delay);
      signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(Object.assign(new Error('cancelled'),{code:'cancelled'}));},{once:true});
    });
    if(sample){const name='look'+(path.extname(sample).toLowerCase()==='.png'?'.png':'.jpg');await fs.copyFile(sample,path.join(directory,name));return name;}
    await fs.writeFile(path.join(directory,'look.png'),syntheticPng(600,800,[40,48,80]));return 'look.png';
  }
};
