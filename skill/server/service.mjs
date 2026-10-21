import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {config as defaults} from '../web/lib/config.mjs';
import {recipeKey} from '../web/lib/schema.mjs';
import {promptFor} from '../web/lib/recipes.mjs';
import {equals,safeFile,validatedRecipe} from './security.mjs';
import {childEnvironment,imageInfo,removeQuietly,runCommand} from './process.mjs';
import {errorCodes,publicAdapter,selectedAdapter,statusCodes} from './adapters.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));

const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.woff2':'font/woff2','.tflite':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg','.txt':'text/plain'};
const csp="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'";
const expiredPage='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>穿搭工作台</title><link rel="stylesheet" href="/style.css"></head><body><main class="expired"><p>页面已过期。重新启动穿搭工作台后再打开。</p></main></body></html>';
const transient=['input','convert','jobs','agent-queue','try'];

export async function createService({root=path.resolve(here,'..'),configuration={},adapter:injected}={}){
  const config={...defaults,...configuration},runtime=path.join(root,'.runtime'),web=path.join(root,'web'),origin=`http://127.0.0.1:${config.port}`,host=`127.0.0.1:${config.port}`;
  await fs.mkdir(runtime,{recursive:true,mode:0o700});
  const loaded=injected?{adapter:injected,problems:[]}:await selectedAdapter(root);
  const adapter=loaded.adapter,providerKey=adapter?`${adapter.id}:${adapter.cacheKey}`:null;
  const concurrency=adapter?.concurrency||config.concurrency,timeout=adapter?.timeoutMs||config.generationTimeoutMs;
  const token=randomBytes(32).toString('hex'),instance=randomUUID(),cookieName=`outfit_${config.port}`,jobs=new Map(),queue=[],cached=new Map();
  let active=0,count=0,closing=false,counterQueue=Promise.resolve();
  const counterFile=path.join(runtime,'counter.json');
  if(config.developmentMode){
    try{const counter=JSON.parse(await fs.readFile(counterFile,'utf8'));if(!Number.isSafeInteger(counter.count)||counter.count<0)throw new Error('Invalid counter');count=counter.count;}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  async function currentStatus(){
    if(!adapter)return 'invalid';
    try{const value=await adapter.status({directory:runtime,runtime});return statusCodes.includes(value)?value:'invalid';}catch{return 'invalid';}
  }
  const send=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const cookie=req=>(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  async function body(req,limit){
    let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>limit)throw Object.assign(new Error('Too large'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);
  }
  async function reserve(){
    const reservation=counterQueue.then(async()=>{
      if(config.developmentMode&&config.countImages!==false&&count>=config.developmentImageLimit)throw Object.assign(new Error('limit'),{code:'limit'});
      count++;
      if(config.developmentMode&&config.countImages!==false)await fs.writeFile(counterFile,JSON.stringify({count}),{mode:0o600});
    });
    counterQueue=reservation.catch(()=>{});return reservation;
  }
  async function work(job){
    active++;job.state=adapter.background?'generating':'queued';job.startedAt=new Date().toISOString();
    try{
      const state=await currentStatus();if(state!=='ready'&&!(state==='waiting-agent'&&!adapter.background))throw Object.assign(new Error(state),{code:state});
      if(job.state==='cancelled')return;
      await reserve();job.counted=true;
      await fs.appendFile(path.join(runtime,'calls.jsonl'),JSON.stringify({id:job.id,adapter:adapter.id,time:job.startedAt,requested:1,key:job.key})+'\n',{mode:0o600});
      const directory=path.join(runtime,'jobs',job.id);await fs.mkdir(directory,{recursive:true,mode:0o700});
      if(job.state==='cancelled')return;
      const signal=job.controller.signal;
      const stopped=new Promise((resolve,reject)=>{
        const fail=()=>reject(Object.assign(new Error(job.timedOut?'timeout':'cancelled'),{code:job.timedOut?'timeout':'cancelled'}));
        if(signal.aborted)fail();else signal.addEventListener('abort',fail,{once:true});
      });
      job.timer=setTimeout(()=>{job.timedOut=true;job.controller.abort();},timeout+config.timeoutGraceMs);
      const output=await Promise.race([adapter.generate({id:job.id,prompt:job.prompt,directory,runtime,timeoutMs:timeout,signal,started:()=>{if(job.state==='queued')job.state='generating';}}),stopped]);
      if(job.state==='cancelled')return;
      if(typeof output!=='string')throw new Error('Invalid output');
      const image=await safeFile(directory,output),stat=await fs.lstat(path.join(directory,output));
      if(!stat.isFile())throw new Error('Invalid output');
      const info=imageInfo(await fs.readFile(image),{maxBytes:config.maxUploadBytes});
      if(!info)throw new Error('Invalid image');
      if(job.state==='cancelled')return;
      job.file=image;job.type=info.type;job.state='complete';cached.set(job.key,job.id);
    }catch(error){
      if(job.state!=='cancelled'){job.state='failed';job.error=['limit',...errorCodes,...statusCodes].includes(error.code)&&error.code!=='ready'?error.code:'failed';}
    }finally{
      clearTimeout(job.timer);job.endedAt=new Date().toISOString();active--;
      await fs.appendFile(path.join(runtime,'jobs.jsonl'),JSON.stringify({id:job.id,adapter:adapter?.id,state:job.state,error:job.error,startedAt:job.startedAt,endedAt:job.endedAt,counted:job.counted||false})+'\n',{mode:0o600}).catch(()=>{});
      pump();
    }
  }
  function pump(){while(!closing&&active<concurrency&&queue.length){const job=queue.shift();if(job.state==='queued')void work(job);}}
  function cancel(job){if(['queued','generating'].includes(job.state)){job.state='cancelled';job.controller.abort();}}
  function publicJob(job){return {id:job.id,instance,state:job.state,error:job.error,startedAt:job.startedAt,endedAt:job.endedAt,counted:job.counted||false};}
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    if(req.headers.host!==host){send(res,403,{error:'forbidden'});return;}
    let url;
    try{
      const raw=decodeURIComponent((req.url||'').split('?')[0]);
      if(raw.includes('\\')||raw.includes('\0')||raw.split('/').includes('..')){send(res,403,{error:'path'});return;}
      url=new URL(req.url,origin);
    }catch{send(res,400,{error:'request'});return;}
    if(req.method==='GET'&&url.pathname==='/'&&url.searchParams.has('access')){
      if(!equals(url.searchParams.get('access'),token)){res.writeHead(401,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':csp,'Cache-Control':'no-store'});res.end(expiredPage);return;}
      const input=url.searchParams.get('input'),name=url.searchParams.get('name')||'image.jpg';
      const fragment=/^[a-f0-9-]{36}$/.test(input)?`#input=${input}&name=${encodeURIComponent(name.slice(0,200))}`:'';
      res.writeHead(303,{'Set-Cookie':`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,Location:'/index.html'+fragment,'Cache-Control':'no-store'});res.end();return;
    }
    if(req.method==='GET'&&url.pathname==='/api/ping'){send(res,200,{service:'outfit-palette'});return;}
    if(url.pathname.startsWith('/api/')){
      if(!equals(cookie(req),token)){send(res,401,{error:'expired'});return;}
      if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==origin||!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin){send(res,403,{error:'origin'});return;}
      try{
        if(req.method==='GET'&&url.pathname==='/api/status'){
          const state=await currentStatus();
          send(res,200,{service:'outfit-palette',instance,status:state,adapter:state==='none'?null:publicAdapter(adapter),providerKey:state==='none'?null:providerKey,developmentMode:config.developmentMode,automaticDefault:Boolean(adapter?.background)&&!config.developmentMode,count,limit:config.developmentMode?config.developmentImageLimit:null});return;
        }
        if(req.method==='POST'&&url.pathname==='/api/generate'){
          if(req.headers['content-type']?.split(';')[0]!=='application/json'){send(res,415,{error:'type'});return;}
          if(!adapter||adapter.id==='none'){send(res,409,{error:'none'});return;}
          const payload=validatedRecipe(JSON.parse((await body(req,32768)).toString('utf8')));
          const key=createHash('sha256').update(recipeKey(payload.recipe,payload.options)+'\n'+providerKey).digest('hex');
          const previous=cached.get(key);if(previous&&!payload.force){send(res,200,publicJob(jobs.get(previous)));return;}
          const running=[...jobs.values()].find(j=>j.key===key&&['queued','generating'].includes(j.state));if(running){send(res,200,publicJob(running));return;}
          if(config.developmentMode&&config.countImages!==false&&count>=config.developmentImageLimit){send(res,429,{error:'limit'});return;}
          if(queue.length>=12){send(res,429,{error:'busy'});return;}
          const job={id:randomUUID(),key,prompt:promptFor(payload.recipe,payload.options),state:'queued',controller:new AbortController()};
          jobs.set(job.id,job);queue.push(job);send(res,202,publicJob(job));pump();return;
        }
        const match=url.pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})(\/image|\/cancel)?$/);
        if(match){
          const job=jobs.get(match[1]);if(!job){send(res,404,{error:'missing-job',instance});return;}
          if(req.method==='POST'&&match[2]==='/cancel'){cancel(job);send(res,200,publicJob(job));return;}
          if(req.method==='GET'&&match[2]==='/image'&&job.state==='complete'){
            const file=await safeFile(runtime,path.relative(runtime,job.file));res.writeHead(200,{'Content-Type':job.type,'Cache-Control':'no-store'});res.end(await fs.readFile(file));return;
          }
          if(req.method==='GET'&&!match[2]){send(res,200,publicJob(job));return;}
        }
        if(req.method==='POST'&&url.pathname==='/api/convert'&&process.platform==='darwin'){
          if(req.headers['content-type']!=='application/octet-stream'){send(res,415,{error:'type'});return;}
          const bytes=await body(req,config.maxUploadBytes);
          if(bytes.length<12||bytes.toString('ascii',4,8)!=='ftyp'||!['heic','heix','hevc','hevx','mif1','msf1'].includes(bytes.toString('ascii',8,12))){send(res,415,{error:'heic'});return;}
          const directory=path.join(runtime,'convert',randomUUID());await fs.mkdir(directory,{recursive:true,mode:0o700});
          try{
            const source=path.join(directory,'image.heic'),output=path.join(directory,'image.jpg');await fs.writeFile(source,bytes,{mode:0o600});
            const result=await runCommand('/usr/bin/sips',['-s','format','jpeg','-Z',String(config.imageLongEdge),source,'--out',output],{cwd:directory,env:childEnvironment(directory)});
            if(result.code!==0){send(res,422,{error:'heic'});return;}
            const jpeg=await fs.readFile(await safeFile(directory,'image.jpg'));
            res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store'});res.end(jpeg);return;
          }finally{await removeQuietly(directory);}
        }
        const input=url.pathname.match(/^\/api\/input\/([a-f0-9-]{36})$/);
        if(req.method==='GET'&&input){
          const file=await safeFile(path.join(runtime,'input'),input[1]),data=await fs.readFile(file);
          await removeQuietly(file);
          if(data.length>config.maxUploadBytes){send(res,413,{error:'size'});return;}
          res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store'});res.end(data);return;
        }
        send(res,404,{error:'missing'});
      }catch(error){send(res,error.status||400,{error:'request'});}
      return;
    }
    if(req.method!=='GET'){send(res,405,{error:'method'});return;}
    try{
      const requested=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)),file=await safeFile(web,requested);
      let data=await fs.readFile(file);
      if(requested==='index.html')data=Buffer.from(data.toString().replace('<head>','<head><meta name="outfit-local" content="true">'));
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Security-Policy':csp,'Cache-Control':'no-store'});res.end(data);
    }catch{send(res,404,{error:'missing'});}
  });
  async function clearTransient(keepInput=null){
    for(const name of transient){
      if(name!=='input'||!keepInput){await removeQuietly(path.join(runtime,name));continue;}
      const folder=path.join(runtime,'input');
      for(const file of await fs.readdir(folder).catch(()=>[]))if(file!==keepInput)await removeQuietly(path.join(folder,file));
    }
  }
  return {server,runtime,origin,token,instance,cookieName,config,adapter,problems:loaded.problems,clearTransient,close(){closing=true;for(const job of jobs.values())cancel(job);return new Promise(resolve=>server.close(resolve));}};
}
