import fs from 'node:fs/promises';
import {requireNode} from './node-version.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {claimNext,queueFolder,touchHeartbeat,writeAtomic} from './agent-queue.mjs';
import {imageInfo} from './process.mjs';
import {config} from '../web/lib/config.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
requireNode();

const runtime=path.resolve(here,'..','.runtime');
const [command,...rest]=process.argv.slice(2);
const print=value=>console.log(JSON.stringify(value));
const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};

async function claimed(id){
  try{const folder=queueFolder(runtime,id);await fs.access(path.join(folder,'claimed.json'));return folder;}catch{return null;}
}

if(command==='next'){
  const index=rest.indexOf('--wait'),seconds=index>=0?Number(rest[index+1]):60;
  const limit=Number.isFinite(seconds)?Math.min(Math.max(seconds,0),110):60,deadline=Date.now()+limit*1000;
  let job=null;
  while(true){
    await touchHeartbeat(runtime);
    job=await claimNext(runtime);
    if(job||Date.now()>=deadline)break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  await touchHeartbeat(runtime);
  if(!job)print({job:null});
  else print({job:job.id,prompt:job.prompt,deliver:`node server/agent.mjs done ${job.id} <图片文件路径>`,fail:`node server/agent.mjs fail ${job.id}`});
}else if(command==='done'){
  const [id,file]=rest,folder=await claimed(id||'');
  if(!folder){print({ok:false,reason:'任务不存在或已取消'});process.exitCode=1;}
  else{
    const bytes=await fs.readFile(path.resolve(file||'')).catch(()=>null),info=bytes&&imageInfo(bytes,{maxBytes:config.maxUploadBytes});
    if(!info){print({ok:false,reason:'不是可用的 PNG、JPEG 或 WebP 图片（边长 64–8192，20MB 以内）'});process.exitCode=1;}
    else{
      const name=`look.${extensions[info.type]}`;
      await writeAtomic(path.join(folder,name),bytes);
      await writeAtomic(path.join(folder,'done.json'),JSON.stringify({file:name}));
      print({ok:true,job:id,width:info.width,height:info.height});
    }
  }
}else if(command==='fail'){
  const [id]=rest,folder=await claimed(id||'');
  if(!folder){print({ok:false,reason:'任务不存在或已取消'});process.exitCode=1;}
  else{await writeAtomic(path.join(folder,'failed.json'),'{}');print({ok:true,job:id});}
}else{
  console.error('用法：node server/agent.mjs next [--wait 秒数] | done <任务> <图片文件路径> | fail <任务>');
  process.exitCode=2;
}
