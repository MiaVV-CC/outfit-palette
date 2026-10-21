// 接入其他命令行生图工具的模板。复制本文件为 adapters/<名称>.mjs，把 id 改成同一个名称，
// 再按工具的实际用法改写 status() 和 generate()。契约说明见 ../ADAPTERS.md。
import {childEnvironment,findExecutable,runCommand} from '../server/process.mjs';

const tool='your-image-tool';
const environment=[];

export default {
  id:'template-cli',
  label:'示例工具',
  cost:'unknown',
  background:true,
  cancel:'discard',
  cacheKey:'template-cli/model-name',
  environment,
  concurrency:1,
  timeoutMs:180000,
  async status({directory}){
    const executable=await findExecutable(tool);
    if(!executable)return 'missing';
    const result=await runCommand(executable,['--version'],{cwd:directory,env:childEnvironment(directory,environment)}).catch(()=>null);
    return result?.code===0?'ready':'login';
  },
  async generate({prompt,directory,timeoutMs,signal}){
    const executable=await findExecutable(tool);
    if(!executable)throw Object.assign(new Error('missing'),{code:'missing'});
    const result=await runCommand(executable,['--output','look.png','-'],{cwd:directory,env:childEnvironment(directory,environment),timeout:timeoutMs,signal,input:prompt});
    if(result.code!==0)throw Object.assign(new Error('failed'),{code:'failed'});
    return 'look.png';
  }
};
