import fs from 'node:fs/promises';
import {requireNode} from './node-version.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
requireNode();

const sessionFile=path.resolve(here,'..','.runtime','session.json');
let session;
try{session=JSON.parse(await fs.readFile(sessionFile,'utf8'));}catch{console.log(JSON.stringify({stopped:false,reason:'没有找到正在运行的穿搭工作台'}));process.exit(0);}
let running=false;
try{
  const origin=new URL(session.origin),response=await fetch(origin.origin+'/api/status',{headers:{Cookie:`outfit_${origin.port}=${session.token}`},signal:AbortSignal.timeout(1500)});
  const data=await response.json();running=response.ok&&data.service==='outfit-palette'&&data.instance===session.instance;
}catch{}
if(!running||!Number.isInteger(session.pid)){console.log(JSON.stringify({stopped:false,reason:'没有找到正在运行的穿搭工作台'}));process.exit(0);}
try{if(process.platform==='win32')spawnSync('taskkill',['/pid',String(session.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else process.kill(session.pid,'SIGTERM');}catch{console.log(JSON.stringify({stopped:false,reason:'无法结束进程'}));process.exit(1);}
await fs.rm(sessionFile,{force:true});
await fs.rm(path.join(path.dirname(sessionFile),'open.html'),{force:true});
console.log(JSON.stringify({stopped:true}));
