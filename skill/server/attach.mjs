import fs from 'node:fs/promises';
import {requireNode} from './node-version.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {config} from '../web/lib/config.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
requireNode();

const source=path.resolve(process.argv[2]||''),runtime=path.resolve(here,'../.runtime');
const fail=message=>{console.log(JSON.stringify({ready:false,reason:message}));process.exit(1);};
if(!(process.platform==='darwin'?/\.(jpe?g|png|webp|heic|heif)$/i:/\.(jpe?g|png|webp)$/i).test(source))fail('仅支持 JPG、PNG、WebP。');
const info=await fs.stat(source).catch(()=>null);
if(!info||!info.isFile())fail('找不到这个图片文件。');
if(info.size>config.maxUploadBytes)fail('图片超过 20MB。');
const directory=path.join(runtime,'input');await fs.mkdir(directory,{recursive:true,mode:0o700});
const id=randomUUID();await fs.copyFile(source,path.join(directory,id));await fs.chmod(path.join(directory,id),0o600);
const file=path.join(runtime,'input.json');await fs.writeFile(file,JSON.stringify({id,name:path.basename(source)}),{mode:0o600});
console.log(JSON.stringify({ready:true,next:'node server/start.mjs --input'}));
