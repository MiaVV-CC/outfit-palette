import fs from 'node:fs/promises';
import {requireNode} from './node-version.mjs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createService} from './service.mjs';
import {checkAdapter} from './adapters.mjs';
import {config} from '../web/lib/config.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
requireNode();

const portFlag=process.argv.indexOf('--port'),port=portFlag>=0&&process.argv.includes('--development')?Number(process.argv[portFlag+1]):config.port;
if(!Number.isInteger(port)||port<1024||port>65535){console.error('端口无效。');process.exit(1);}
const root=path.resolve(here,'..'),runtime=path.join(root,'.runtime'),sessionFile=path.join(runtime,'session.json'),launcher=path.join(runtime,'open.html'),origin=`http://127.0.0.1:${port}`;
const shouldOpen=!process.argv.includes('--no-open'),withInput=process.argv.includes('--input');

async function inputQuery(){
  if(!withInput)return '';
  try{
    const file=path.join(runtime,'input.json'),data=JSON.parse(await fs.readFile(file,'utf8'));await fs.rm(file,{force:true});
    if(!/^[a-f0-9-]{36}$/.test(data.id))return '';
    return `&input=${data.id}&name=${encodeURIComponent(String(data.name||'image.jpg').slice(0,200))}`;
  }catch{return '';}
}

async function writeLauncher(token,query=''){
  const address=`${origin}/?access=${token}${query}`.replaceAll('&','&amp;');
  await fs.writeFile(launcher,`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${address}"><title>穿搭工作台</title><a href="${address}">穿搭工作台</a>`,{mode:0o600});
}
function openBrowser(address){
  const [command,args]=process.platform==='darwin'?['open',[address]]:process.platform==='win32'?['explorer.exe',[address]]:['xdg-open',[address]];
  return new Promise(resolve=>{
    try{
      const child=spawn(command,args,{stdio:'ignore',detached:true,windowsHide:true});
      child.on('error',()=>resolve(false));
      child.on('spawn',()=>{child.unref();resolve(true);});
    }catch{resolve(false);}
  });
}
async function ping(){
  try{const response=await fetch(origin+'/api/ping',{signal:AbortSignal.timeout(1500)});return (await response.json()).service==='outfit-palette';}catch{return false;}
}
async function finish(token,reused){
  const query=await inputQuery();
  await writeLauncher(token,query);
  const opened=shouldOpen?await openBrowser(process.platform==='darwin'?`${origin}/?access=${token}${query}`:launcher):false;
  console.log(JSON.stringify({reused,origin,opened,launcher}));
}

let old;
try{old=JSON.parse(await fs.readFile(sessionFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const adapterFile=process.argv.indexOf('--adapter-file');
if(old?.origin===origin&&adapterFile<0){
  try{
    const response=await fetch(origin+'/api/status',{headers:{Cookie:`outfit_${port}=${old.token}`},signal:AbortSignal.timeout(1500)});
    const data=await response.json();
    if(response.ok&&data.service==='outfit-palette'&&data.instance===old.instance){await finish(old.token,true);process.exit(0);}
  }catch{}
}
const development=config.developmentMode||process.argv.includes('--development');
let injected;
if(adapterFile>=0){
  if(!development){console.error('--adapter-file 只能和 --development 一起用。');process.exit(1);}
  injected=(await import(pathToFileURL(path.resolve(process.argv[adapterFile+1]||'')).href)).default;
  const problems=checkAdapter(injected,injected?.id);
  if(problems.length){console.error(problems.join('；'));process.exit(1);}
}
const service=await createService({root,adapter:injected,configuration:{developmentMode:development,countImages:!injected,port}});
service.server.on('error',async error=>{
  if(error.code==='EADDRINUSE')console.error(await ping()?`另一份穿搭工作台正在使用端口 ${port}。先关闭它，再重试。`:`端口 ${port} 已被其他程序占用，穿搭工作台无法启动。关闭占用的程序后重试。`);
  else console.error('穿搭工作台无法启动。');
  process.exit(1);
});
service.server.listen(port,'127.0.0.1',async()=>{
  let keep=null;
  if(withInput){try{const id=JSON.parse(await fs.readFile(path.join(runtime,'input.json'),'utf8')).id;if(/^[a-f0-9-]{36}$/.test(id))keep=id;}catch{}}
  await service.clearTransient(keep);
  await fs.writeFile(sessionFile,JSON.stringify({origin,token:service.token,instance:service.instance,pid:process.pid}),{mode:0o600});
  if(service.problems.length)console.error(JSON.stringify({generator:'invalid',problems:service.problems}));
  await finish(service.token,false);
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void service.close().then(()=>process.exit()));
