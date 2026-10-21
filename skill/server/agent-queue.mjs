import fs from 'node:fs/promises';
import path from 'node:path';

export const jobPattern=/^[a-f0-9-]{36}$/;
export const queueRoot=runtime=>path.join(runtime,'agent-queue');
export function queueFolder(runtime,id){
  if(!jobPattern.test(id))throw new Error('Invalid job');
  return path.join(queueRoot(runtime),id);
}
export async function heartbeatAge(runtime){
  try{return Date.now()-(await fs.stat(path.join(queueRoot(runtime),'heartbeat'))).mtimeMs;}catch{return null;}
}
export async function writeAtomic(file,text){
  const temporary=`${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary,text,{mode:0o600});await fs.rename(temporary,file);
}
export async function hasClaimed(runtime){
  let names=[];
  try{names=await fs.readdir(queueRoot(runtime));}catch{return false;}
  for(const name of names){
    if(!jobPattern.test(name))continue;
    try{await fs.access(path.join(queueRoot(runtime),name,'claimed.json'));return true;}catch{}
  }
  return false;
}
export async function touchHeartbeat(runtime){
  await fs.mkdir(queueRoot(runtime),{recursive:true,mode:0o700});
  await fs.writeFile(path.join(queueRoot(runtime),'heartbeat'),new Date().toISOString(),{mode:0o600});
}
export async function claimNext(runtime){
  let names=[];
  try{names=await fs.readdir(queueRoot(runtime));}catch{return null;}
  const waiting=[];
  for(const name of names){
    if(!jobPattern.test(name))continue;
    try{const info=await fs.stat(path.join(queueRoot(runtime),name,'request.json'));waiting.push({name,time:info.mtimeMs});}catch{}
  }
  waiting.sort((a,b)=>a.time-b.time);
  for(const {name} of waiting){
    const folder=path.join(queueRoot(runtime),name);
    try{
      await fs.rename(path.join(folder,'request.json'),path.join(folder,'claimed.json'));
      return JSON.parse(await fs.readFile(path.join(folder,'claimed.json'),'utf8'));
    }catch{}
  }
  return null;
}
