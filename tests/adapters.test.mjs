import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {checkAdapter,loadAdapter,readSelection,selectedAdapter} from '../skill/server/adapters.mjs';
import {childEnvironment,imageInfo,runCommand} from '../skill/server/process.mjs';
import {syntheticPng,syntheticJpegHeader,syntheticWebpHeader,temporaryFolder} from './helpers.mjs';

const skill=path.resolve(import.meta.dirname,'../skill');

test('图片校验：识别 PNG / JPEG / WebP 的类型和尺寸，拒绝文字和超限尺寸',()=>{
  assert.deepEqual(imageInfo(syntheticPng(96,128)),{type:'image/png',width:96,height:128});
  assert.deepEqual(imageInfo(syntheticJpegHeader(200,300)),{type:'image/jpeg',width:200,height:300});
  assert.deepEqual(imageInfo(syntheticWebpHeader(300,400)),{type:'image/webp',width:300,height:400});
  assert.equal(imageInfo(Buffer.from('image generated successfully')),null);
  assert.equal(imageInfo(syntheticPng(32,32)),null);
  assert.equal(imageInfo(syntheticPng(96,128),{maxBytes:10}),null);
});

test('子进程环境：只传白名单和声明的变量；OPENAI_API_KEY、CODEX_API_KEY 即使声明也不传',()=>{
  const saved={...process.env};
  Object.assign(process.env,{OPENAI_API_KEY:'synthetic',CODEX_API_KEY:'synthetic',SOME_VENDOR_API_KEY:'synthetic',CODEX_HOME:'/synthetic',HTTPS_PROXY:'http://127.0.0.1:9'});
  try{
    const env=childEnvironment('/tmp/job',['CODEX_HOME','OPENAI_API_KEY']),declared=childEnvironment('/tmp/job',['SOME_VENDOR_API_KEY']);
    assert.equal(declared.SOME_VENDOR_API_KEY,'synthetic','声明了的第三方变量会传入');
    assert.equal(env.TMPDIR,'/tmp/job');
    assert.ok(!('OPENAI_API_KEY' in env)&&!('CODEX_API_KEY' in env)&&!('SOME_VENDOR_API_KEY' in env));
    assert.equal(env.CODEX_HOME,'/synthetic');assert.equal(env.HTTPS_PROXY,'http://127.0.0.1:9');assert.ok(Object.keys(env).some(key=>key.toUpperCase()==='PATH'));
  }finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});

test('子进程环境（Windows 写法）：名字不分大小写、保留原样，临时目录指向任务目录',()=>{
  const source={Path:'C:\\bin',SystemRoot:'C:\\Windows',ComSpec:'C:\\Windows\\cmd.exe',PATHEXT:'.EXE;.CMD',Codex_Home:'C:\\codex',https_proxy:'http://127.0.0.1:9',Temp:'C:\\old',OpenAI_Api_Key:'synthetic',Other:'x'};
  const env=childEnvironment('C:\\job',['CODEX_HOME'],{platform:'win32',source});
  assert.equal(env.Path,'C:\\bin');assert.equal(env.SystemRoot,'C:\\Windows');assert.equal(env.ComSpec,'C:\\Windows\\cmd.exe');assert.equal(env.PATHEXT,'.EXE;.CMD');
  assert.equal(env.Codex_Home,'C:\\codex');assert.equal(env.https_proxy,'http://127.0.0.1:9');
  assert.equal(env.TEMP,'C:\\job');assert.equal(env.TMP,'C:\\job');assert.ok(!('Temp' in env));
  assert.ok(!('OpenAI_Api_Key' in env)&&!('Other' in env));
});

test('子进程：超时与取消都会结束进程并返回对应代码',async()=>{
  await assert.rejects(runCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:300}),{code:'timeout'});
  const controller=new AbortController();setTimeout(()=>controller.abort(),200);
  await assert.rejects(runCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:5000,signal:controller.signal}),{code:'cancelled'});
  await assert.rejects(runCommand('outfit-command-that-does-not-exist',[]),{code:'missing'});
});

test('适配器契约：现成适配器合规，错误定义被指出',async()=>{
  for(const id of ['codex','agent','template-cli']){const {adapter,problems}=await loadAdapter(skill,id);assert.ok(adapter,id+' '+problems.join('；'));}
  assert.ok(checkAdapter({id:'x'},'y').length>3);
  assert.ok(checkAdapter({id:'a',label:'A',cost:'cheap',background:true,cancel:'stop',cacheKey:'a',status(){},generate(){}},'a').some(p=>p.includes('cost')));
});

test('适配器选择：缺省为未接入；名称和路径受限；配置错误可识别',async()=>{
  const root=await temporaryFolder();
  try{
    await fs.mkdir(path.join(root,'adapters'));
    assert.equal((await readSelection(root)).adapter,'none');
    assert.equal((await selectedAdapter(root)).adapter.id,'none');
    await fs.writeFile(path.join(root,'generator.json'),'{oops');
    assert.equal((await readSelection(root)).adapter,'invalid');
    assert.equal((await selectedAdapter(root)).adapter,null);
    for(const id of ['../codex','Codex','a/b','']){const {adapter}=await loadAdapter(root,id);assert.equal(adapter,null,id);}
    const outside=path.join(root,'outside.mjs');await fs.writeFile(outside,'export default {}');
    let linked=true;try{await fs.symlink(outside,path.join(root,'adapters','link.mjs'));}catch{linked=false;}
    if(linked)assert.match((await loadAdapter(root,'link')).problems.join(),/adapters/);
    assert.match((await loadAdapter(root,'absent')).problems.join(),/找不到/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
