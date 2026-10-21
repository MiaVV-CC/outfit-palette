import fs from 'node:fs/promises';
import path from 'node:path';
import {childEnvironment,findExecutable,runCommand} from '../server/process.mjs';

const environment=['CODEX_HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_STATE_HOME'];
const instruction='只用内置 image_gen 工具生成一张图片。禁止重试、调用 API、安装依赖或调用其他 agent。不要读取任何项目照片或凭据。生成后把图片复制到当前工作目录 look.png。只写当前工作目录。工具不可用时直接结束。';
const quotaPattern=/usage.limit|quota.exceeded|insufficient.quota|rate.limit.exceeded|limit.reached/i;

const command=()=>findExecutable('codex');

export default {
  id:'codex',
  label:'Codex',
  cost:'subscription',
  background:true,
  cancel:'discard',
  cacheKey:'codex/imagegen/workspace-write',
  environment,
  concurrency:3,
  timeoutMs:180000,
  async status({directory}){
    const executable=await command();
    if(!executable)return 'missing';
    try{
      const result=await runCommand(executable,['login','status'],{cwd:directory,env:childEnvironment(directory,environment)});
      const text=result.output+'\n'+result.error;
      if(/api[ _-]?key/i.test(text))return 'api-key';
      if(result.code===0&&/Logged in using ChatGPT/i.test(text))return 'ready';
      return 'login';
    }catch(error){return error.code==='missing'?'missing':'login';}
  },
  async generate({prompt,directory,timeoutMs,signal}){
    const executable=await command();
    if(!executable)throw Object.assign(new Error('missing'),{code:'missing'});
    const logs=async ({output='',error=''})=>{
      await fs.writeFile(path.join(directory,'events.jsonl'),output,{mode:0o600}).catch(()=>{});
      await fs.writeFile(path.join(directory,'stderr.log'),error,{mode:0o600}).catch(()=>{});
    };
    let result;
    try{result=await runCommand(executable,['exec','--skip-git-repo-check','--ephemeral','--sandbox','workspace-write','--json','-'],{cwd:directory,env:childEnvironment(directory,environment),timeout:timeoutMs,signal,input:`$imagegen\n${instruction}\n${prompt}`});}
    catch(cause){await logs(cause);throw cause;}
    await logs(result);
    if(quotaPattern.test(result.output+'\n'+result.error))throw Object.assign(new Error('quota'),{code:'quota'});
    if(result.code!==0)throw Object.assign(new Error('failed'),{code:'failed'});
    return 'look.png';
  }
};
