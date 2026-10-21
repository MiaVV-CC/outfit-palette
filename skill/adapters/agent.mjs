import fs from 'node:fs/promises';
import path from 'node:path';
import {queueFolder,heartbeatAge,hasClaimed,writeAtomic} from '../server/agent-queue.mjs';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export default {
  id:'agent',
  label:'AI 助手',
  cost:'unknown',
  background:false,
  cancel:'discard',
  cacheKey:'agent/conversation-tool',
  concurrency:1,
  timeoutMs:600000,
  async status({runtime}){
    const age=await heartbeatAge(runtime);
    return age!==null&&age<120000||await hasClaimed(runtime)?'ready':'waiting-agent';
  },
  async generate({id,prompt,directory,runtime,timeoutMs,signal,started}){
    const folder=queueFolder(runtime,id);
    await fs.mkdir(folder,{recursive:true,mode:0o700});
    await writeAtomic(path.join(folder,'request.json'),JSON.stringify({id,prompt,createdAt:new Date().toISOString()}));
    const deadline=Date.now()+timeoutMs;
    try{
      while(true){
        if(signal?.aborted)throw Object.assign(new Error('cancelled'),{code:'cancelled'});
        if(Date.now()>deadline)throw Object.assign(new Error('timeout'),{code:'timeout'});
        try{
          const done=JSON.parse(await fs.readFile(path.join(folder,'done.json'),'utf8'));
          if(typeof done.file!=='string'||!/^look\.(png|jpg|webp)$/.test(done.file))throw Object.assign(new Error('failed'),{code:'failed'});
          await fs.rename(path.join(folder,done.file),path.join(directory,done.file));
          return done.file;
        }catch(error){if(error.code!=='ENOENT')throw error;}
        if(started)await fs.access(path.join(folder,'claimed.json')).then(()=>{started();started=null;},()=>{});
        try{await fs.access(path.join(folder,'failed.json'));throw Object.assign(new Error('failed'),{code:'failed'});}catch(error){if(error.code!=='ENOENT')throw error;}
        await wait(500);
      }
    }finally{await fs.rm(folder,{recursive:true,force:true}).catch(()=>{});}
  }
};
