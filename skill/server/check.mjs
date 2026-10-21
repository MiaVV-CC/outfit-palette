import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {config} from '../web/lib/config.mjs';
import {loadAdapter,readSelection,selectedAdapter} from './adapters.mjs';
import {imageInfo} from './process.mjs';
import {generateRecipes} from '../web/lib/recipes.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),runtime=path.join(root,'.runtime'),origin=`http://127.0.0.1:${config.port}`;
const [major,minor]=process.versions.node.split('.').map(Number);
const report={node:{version:process.versions.node,ok:major>=22||(major===21&&minor>=2)||(major===20&&minor>=11)},platform:process.platform,port:config.port};

try{
  const response=await fetch(origin+'/api/ping',{signal:AbortSignal.timeout(1500)});
  report.portState=await response.json().then(data=>data.service==='outfit-palette'?'workbench':'other',()=>'other');
}catch(error){report.portState=error.cause?.code==='ECONNREFUSED'?'free':'other';}

await fs.mkdir(runtime,{recursive:true,mode:0o700});
const selection=await readSelection(root);
report.selected=selection.adapter;
if(selection.problem)report.selectionProblem=selection.problem;

report.adapters={};
let names=[];
try{names=(await fs.readdir(path.join(root,'adapters'))).filter(name=>name.endsWith('.mjs')).map(name=>name.slice(0,-4));}catch{}
for(const name of names){
  if(name==='template-cli')continue;
  const {adapter,problems}=await loadAdapter(root,name);
  if(!adapter){report.adapters[name]={valid:false,problems};continue;}
  let state;
  try{state=await adapter.status({directory:runtime,runtime});}catch{state='invalid';}
  report.adapters[name]={valid:true,label:adapter.label,background:adapter.background,cost:adapter.cost,status:state};
}
if(process.argv.includes('--try')){
  const {adapter,problems}=await selectedAdapter(root);
  const state=adapter&&adapter.id!=='none'?await adapter.status({directory:runtime,runtime}).catch(()=>'invalid'):null;
  if(!adapter||adapter.id==='none')report.try={ok:false,reason:problems.join('；')||'未接入：先写 generator.json'};
  else if(!adapter.background)report.try={ok:false,reason:'AI 助手代生成需要在对话里完成，按 ADAPTERS.md 第 4 节操作'};
  else if(state!=='ready')report.try={ok:false,reason:state};
  else{
    const sample={palette:[{hex:'#202C46',share:.6,position:'upper'},{hex:'#B5A17C',share:.4,position:'lower'}],accessories:[{category:'帽子',hex:'#782F40',accent:true}],options:{occasion:'日常',weather:'温和',model:'女',background:'影棚'}};
    const recipe=generateRecipes(sample).recipes[0],directory=path.join(runtime,'try',String(Date.now()));
    await fs.rm(path.join(runtime,'try'),{recursive:true,force:true});
    await fs.appendFile(path.join(runtime,'calls.jsonl'),JSON.stringify({id:'try',adapter:adapter.id,time:new Date().toISOString(),requested:1,key:'check --try'})+'\n',{mode:0o600});
    await fs.mkdir(directory,{recursive:true,mode:0o700});
    try{
      const file=await adapter.generate({id:'try',prompt:recipe.prompt,directory,runtime,timeoutMs:adapter.timeoutMs||config.generationTimeoutMs});
      const target=path.join(directory,String(file)),info=imageInfo(await fs.readFile(target),{maxBytes:config.maxUploadBytes});
      report.try=info&&path.dirname(path.resolve(target))===directory?{ok:true,file:target,type:info.type,width:info.width,height:info.height}:{ok:false,reason:'没有得到可用的图片文件'};
    }catch(error){report.try={ok:false,reason:error.code||'failed'};}
  }
}
console.log(JSON.stringify(report,null,2));
