import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import codex from '../skill/adapters/codex.mjs';
import {fakeCodex,temporaryFolder} from './helpers.mjs';

const skip=process.platform==='win32'?'假 Codex 命令依赖 Unix 可执行脚本':false;

test('Codex 适配器（模拟命令行）：状态、生成、额度、失败、超时、取消、环境隔离',{skip},async()=>{
  const folder=await temporaryFolder(),savedPath=process.env.PATH,savedKey=process.env.OPENAI_API_KEY;
  const job=async()=>{const directory=path.join(folder,'job-'+Math.random().toString(16).slice(2));await fs.mkdir(directory);return directory;};
  try{
    process.env.PATH='';
    assert.equal(await codex.status({directory:folder,runtime:folder}),'missing');
    const fake=await fakeCodex(folder);
    process.env.PATH=fake.bin+path.delimiter+savedPath;process.env.OPENAI_API_KEY='synthetic';
    assert.equal(await codex.status({directory:folder,runtime:folder}),'ready');
    await fake.setMode('api-key');assert.equal(await codex.status({directory:folder,runtime:folder}),'api-key');
    await fake.setMode('logged-out');assert.equal(await codex.status({directory:folder,runtime:folder}),'login');

    await fake.setMode('ok');
    let directory=await job();
    assert.equal(await codex.generate({prompt:'合成提示词',directory,timeoutMs:10000}),'look.png');
    assert.ok((await fs.stat(path.join(directory,'look.png'))).size>0);
    const prompt=await fs.readFile(path.join(folder,'last-prompt.txt'),'utf8');
    assert.ok(prompt.startsWith('$imagegen\n')&&prompt.endsWith('合成提示词'));
    const call=(await fake.calls()).at(-1);
    assert.deepEqual(call.args,['exec','--skip-git-repo-check','--ephemeral','--sandbox','workspace-write','--json','-']);
    assert.ok(!call.env.includes('OPENAI_API_KEY')&&!call.env.includes('CODEX_API_KEY'));
    assert.equal(await fs.realpath(call.cwd),await fs.realpath(directory));

    await fake.setMode('quota');await assert.rejects(codex.generate({prompt:'p',directory:await job(),timeoutMs:10000}),{code:'quota'});
    await fake.setMode('fail');await assert.rejects(codex.generate({prompt:'p',directory:await job(),timeoutMs:10000}),{code:'failed'});
    await fake.setMode('hang');
    directory=await job();
    await assert.rejects(codex.generate({prompt:'p',directory,timeoutMs:500}),{code:'timeout'});
    assert.ok((await fs.stat(path.join(directory,'stderr.log'))).isFile(),'超时也留下日志');
    const controller=new AbortController();setTimeout(()=>controller.abort(),300);
    await assert.rejects(codex.generate({prompt:'p',directory:await job(),timeoutMs:10000,signal:controller.signal}),{code:'cancelled'});
  }finally{
    process.env.PATH=savedPath;if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;
    await fs.rm(folder,{recursive:true,force:true});
  }
});
