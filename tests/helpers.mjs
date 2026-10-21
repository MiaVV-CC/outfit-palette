import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(buffer){let c=0xffffffff;for(const byte of buffer)c=crcTable[(c^byte)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(type,data){
  const length=Buffer.alloc(4);length.writeUInt32BE(data.length);
  const body=Buffer.concat([Buffer.from(type,'ascii'),data]),crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length,body,crc]);
}
export function syntheticPng(width=96,height=128,rgb=[32,44,70]){
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  const row=Buffer.alloc(1+width*3);for(let x=0;x<width;x++)row.set(rgb,1+x*3);
  const raw=Buffer.concat(Array.from({length:height},()=>row));
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export function syntheticJpegHeader(width=200,height=300){
  const sof=Buffer.from([0xff,0xc0,0x00,0x11,0x08,height>>8,height&255,width>>8,width&255,0x03,1,0x22,0,2,0x11,1,3,0x11,1]);
  return Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10]),Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0','binary'),sof,Buffer.from([0xff,0xd9])]);
}
export function syntheticWebpHeader(width=300,height=400){
  const data=Buffer.alloc(30);data.write('RIFF',0,'ascii');data.writeUInt32LE(22,4);data.write('WEBP',8,'ascii');data.write('VP8X',12,'ascii');data.writeUInt32LE(10,16);
  data.writeUIntLE(width-1,24,3);data.writeUIntLE(height-1,27,3);return data;
}
export async function temporaryFolder(prefix='outfit-test-'){return fs.mkdtemp(path.join(os.tmpdir(),prefix));}
export function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

export const syntheticExtraction={
  palette:[{hex:'#202C46',share:.6,position:'upper'},{hex:'#B5A17C',share:.4,position:'lower'}],
  accessories:[{category:'帽子',hex:'#782F40',accent:true}]
};

export async function fakeCodex(folder,mode='ok'){
  const bin=path.join(folder,'bin');await fs.mkdir(bin,{recursive:true});
  const modeFile=path.join(folder,'mode.txt'),logFile=path.join(folder,'calls.jsonl');
  await fs.writeFile(modeFile,mode);
  const png=syntheticPng().toString('base64');
  const script=`#!${process.execPath}
const fs=require('node:fs');const path=require('node:path');
const mode=fs.readFileSync(${JSON.stringify(modeFile)},'utf8').trim();
const args=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logFile)},JSON.stringify({args,env:Object.keys(process.env).sort(),cwd:process.cwd()})+'\\n');
if(args[0]==='login'){
  if(mode==='api-key'){console.log('Logged in using an API key');process.exit(0);}
  if(mode==='logged-out'){console.error('Not logged in');process.exit(1);}
  console.log('Logged in using ChatGPT');process.exit(0);
}
let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{
  fs.writeFileSync(path.join(${JSON.stringify(folder)},'last-prompt.txt'),input);
  if(mode==='quota'){console.log('{"type":"error","message":"usage limit reached"}');process.exit(1);}
  if(mode==='fail'){process.exit(3);}
  if(mode==='hang'){setInterval(()=>{},1000);return;}
  if(mode==='text'){fs.writeFileSync('look.png','image generated successfully');process.exit(0);}
  fs.writeFileSync('look.png',Buffer.from(${JSON.stringify(png)},'base64'));process.exit(0);
});
`;
  await fs.writeFile(path.join(bin,'codex'),script,{mode:0o755});
  return {bin,modeFile,logFile,setMode:value=>fs.writeFile(modeFile,value),calls:async()=>(await fs.readFile(logFile,'utf8').catch(()=>'')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))};
}
