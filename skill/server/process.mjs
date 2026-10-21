import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseEnvironment=['PATH','HOME','USER','LOGNAME','LANG','TERM','SHELL','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA','USERPROFILE','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','ALL_PROXY','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS'];
const forbidden=['OPENAI_API_KEY','CODEX_API_KEY'];

export function childEnvironment(directory,extra=[],{platform=process.platform,source=process.env}={}){
  const windows=platform==='win32',env={};
  const allowed=new Set([...baseEnvironment,...extra.map(name=>name.toUpperCase())]);
  for(const [key,value] of Object.entries(source)){
    const name=key.toUpperCase();
    if(forbidden.includes(name))continue;
    const listed=windows||/_PROXY$/.test(name)?allowed.has(name):baseEnvironment.includes(key)||extra.includes(key);
    if(listed||name.startsWith('LC_'))env[key]=value;
  }
  env.TMPDIR=directory;
  if(windows)env.TEMP=env.TMP=directory;
  return env;
}

export async function findExecutable(name){
  if(!/^[A-Za-z0-9._-]{1,64}$/.test(name))return null;
  const extensions=process.platform==='win32'?(process.env.PATHEXT||'.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean).map(e=>e.toLowerCase()):[''];
  for(const folder of (process.env.PATH||'').split(path.delimiter)){
    if(!folder)continue;
    for(const extension of extensions){
      const candidate=path.join(folder,name+extension);
      try{await fs.access(candidate,fs.constants.X_OK);if((await fs.stat(candidate)).isFile())return candidate;}catch{}
    }
  }
  return null;
}

export function runCommand(command,args,{cwd,env,timeout=10000,signal,input}={}){
  return new Promise((resolve,reject)=>{
    const windows=process.platform==='win32',script=windows&&/\.(cmd|bat)$/i.test(command);
    if(script&&args.some(arg=>!/^[A-Za-z0-9._:\/-]*$/.test(arg))){reject(Object.assign(new Error('unsafe arguments'),{code:'failed'}));return;}
    const child=script?spawn(`"${command}"`,args,{cwd,env,stdio:['pipe','pipe','pipe'],shell:true,windowsHide:true}):spawn(command,args,{cwd,env,stdio:['pipe','pipe','pipe'],detached:!windows,windowsHide:true});
    let output='',error='',settled=false;
    const stop=()=>{
      if(windows){if(child.pid)spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true}).on('error',()=>child.kill());return;}
      try{process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}
      const force=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}},2000);force.unref();
    };
    const finish=(callback,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);callback(value);};
    const timer=setTimeout(()=>{stop();finish(reject,Object.assign(new Error('timeout'),{code:'timeout',output,error}));},timeout);
    const abort=()=>{stop();finish(reject,Object.assign(new Error('cancelled'),{code:'cancelled',output,error}));};
    if(signal?.aborted){abort();}else signal?.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',chunk=>{if(output.length<2000000)output+=chunk;});
    child.stderr.on('data',chunk=>{if(error.length<2000000)error+=chunk;});
    child.on('error',cause=>finish(reject,Object.assign(cause,{code:cause.code==='ENOENT'?'missing':cause.code})));
    child.on('close',code=>finish(resolve,{code,output,error}));
    child.stdin.on('error',()=>{});child.stdin.end(input||'');
  });
}

function pngSize(bytes){
  if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('ascii',12,16)!=='IHDR')return null;
  return {type:'image/png',width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
}
function jpegSize(bytes){
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return null;
  let offset=2;
  while(offset+9<bytes.length){
    if(bytes[offset]!==0xff){offset++;continue;}
    const marker=bytes[offset+1];
    if(marker===0xd8||marker===0x01||(marker>=0xd0&&marker<=0xd7)){offset+=2;continue;}
    const length=bytes.readUInt16BE(offset+2);
    if(length<2)return null;
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {type:'image/jpeg',height:bytes.readUInt16BE(offset+5),width:bytes.readUInt16BE(offset+7)};
    offset+=2+length;
  }
  return null;
}
function webpSize(bytes){
  if(bytes.length<30||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')return null;
  const chunk=bytes.toString('ascii',12,16);
  if(chunk==='VP8X')return {type:'image/webp',width:1+bytes.readUIntLE(24,3),height:1+bytes.readUIntLE(27,3)};
  if(chunk==='VP8 '&&bytes[23]===0x9d&&bytes[24]===0x01&&bytes[25]===0x2a)return {type:'image/webp',width:bytes.readUInt16LE(26)&0x3fff,height:bytes.readUInt16LE(28)&0x3fff};
  if(chunk==='VP8L'&&bytes[20]===0x2f){const bits=bytes.readUInt32LE(21);return {type:'image/webp',width:(bits&0x3fff)+1,height:((bits>>14)&0x3fff)+1};}
  return null;
}
export function imageInfo(bytes,{maxBytes=20*1024*1024,minSide=64,maxSide=8192}={}){
  if(!Buffer.isBuffer(bytes)||bytes.length>maxBytes)return null;
  const info=pngSize(bytes)||jpegSize(bytes)||webpSize(bytes);
  if(!info||!(info.width>=minSide&&info.height>=minSide&&info.width<=maxSide&&info.height<=maxSide))return null;
  return info;
}

export async function removeQuietly(target){await fs.rm(target,{recursive:true,force:true}).catch(()=>{});}
