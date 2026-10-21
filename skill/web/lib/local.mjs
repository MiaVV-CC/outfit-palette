const latin=character=>/[A-Za-z0-9]/.test(character||'');
const fill=(text,label)=>text.replace(/( ?)\{供应方\}( ?)/g,(match,before,after)=>(before&&latin(label[0])?' ':'')+label+(after&&latin(label.at(-1))?' ':''));
const statusText={
  missing:'找不到 {供应方}，无法自动生成。用下方三步生成。',
  login:'{供应方} 未登录，无法自动生成。用下方三步生成。',
  quota:'{供应方} 额度不足。用下方三步生成。',
  invalid:'生图接入配置有误，无法自动生成。用下方三步生成。',
  'waiting-agent':'等待 AI 助手。回到对话，让它生成效果图。'
};
const codexText={
  login:'Codex 未登录 ChatGPT 账号，无法自动生成。用下方三步生成。',
  'api-key':'Codex 正在使用 API 密钥，自动生成会按量计费，已暂停。改用 ChatGPT 账号登录后可继续。',
  quota:'Codex 额度不足。用下方三步生成。'
};
const jobText={
  expired:'页面已过期。重新启动穿搭工作台后再打开。',
  timeout:'生成超时',limit:'已达测试上限',failed:'生成失败',busy:'排队已满。稍后再试。',
  interrupted:'上次生成已中断'
};
const costText={subscription:'消耗你的 {供应方} 额度。',metered:'按 {供应方} 的规则计费。',free:'费用以 {供应方} 的规则为准。',unknown:'费用以 {供应方} 的规则为准。'};
export function createLocal({onChange,onError}){
  if(!document.querySelector('meta[name="outfit-local"]'))return null;
  let state={status:'none',adapter:null,automaticDefault:false},enabled=false;
  const running=new Map();
  const label=()=>state.adapter?.label||'';
  function describe(code){
    if(!code||code==='ready'||code==='none'||code==='cancelled')return '';
    if(state.adapter?.id==='codex'&&codexText[code])return codexText[code];
    if(jobText[code])return jobText[code];
    return statusText[code]?fill(statusText[code],label()):jobText.failed;
  }
  async function api(route,{method='GET',body,type='application/json'}={}){
    let response;
    try{response=await fetch(`./api/${route}`,{method,credentials:'same-origin',headers:body?{'Content-Type':type}:{},body:body&&type==='application/json'?JSON.stringify(body):body});}
    catch{throw Object.assign(new Error('failed'),{code:'failed'});}
    if(!response.ok){const data=await response.json().catch(()=>({error:'failed'}));throw Object.assign(new Error(data.error),{code:data.error});}
    return response;
  }
  const ready=api('status').then(r=>r.json()).then(data=>{
    state=data;enabled=state.automaticDefault;
    try{const saved=localStorage.getItem('outfit-auto');if(saved!==null)enabled=saved==='true';}catch{}
    if(state.developmentMode)enabled=false;
    onChange();return state;
  }).catch(error=>{state={status:error.code==='expired'?'expired':'unreachable',adapter:null};onError(error.code==='expired'?describe('expired'):'加载失败。检查网络后刷新。');onChange();return state;});
  async function refresh(){
    try{
      const data=await(await api('status')).json(),before=state.status;
      state={...data};if(before!==state.status)onChange();
    }catch{}
  }
  void ready.then(()=>{if(state.adapter&&!state.adapter.background)setInterval(refresh,15000);});
  function cost(credits=true){
    if(!state.adapter)return '';
    let text=state.adapter.id==='agent'?'费用以 AI 助手所用服务的规则为准。':fill(costText[state.adapter.cost]||costText.unknown,label());
    if(credits&&state.adapter.id==='codex')text+='额度用完后，如果你买过加量包，会开始扣费。';
    return text;
  }
  function settings(){
    const dialog=document.querySelector('#settings-dialog'),toggle=document.querySelector('#automatic-toggle');
    const connected=Boolean(state.adapter)&&!['none','invalid'].includes(state.status);
    document.querySelector('#settings-provider').textContent=state.status==='invalid'?describe('invalid'):connected?`生图　${label()}`:'未接入自动生成';
    document.querySelector('#settings-automatic').hidden=!connected||!state.adapter.background;
    document.querySelector('#settings-description').textContent=connected&&state.adapter.background?fill('上传后用 {供应方} 生成 3 张效果图。',label()):'';
    document.querySelector('#settings-cost').textContent=cost();
    toggle.checked=enabled;toggle.disabled=state.status!=='ready';
    toggle.onchange=()=>{enabled=toggle.checked;try{localStorage.setItem('outfit-auto',String(enabled));}catch{}onChange();};
    dialog.showModal();
  }
  async function generate(look,options,change,{force=false,job=null}={}){
    if(running.has(look.id))return null;
    const task={cancelled:false,id:null};running.set(look.id,task);
    try{
      if(job&&job.instance!==state.instance){change({state:'interrupted',error:jobText.interrupted});return null;}
      const payload={recipe:look.recipe,options};
      if(force)payload.key=crypto.randomUUID();
      let current;
      try{current=job?await(await api(`jobs/${encodeURIComponent(job.id)}`)).json():await(await api('generate',{method:'POST',body:payload})).json();}
      catch(error){if(error.code==='missing-job'){change({state:'interrupted',error:jobText.interrupted});return null;}throw error;}
      task.id=current.id;change({state:current.state,id:current.id,instance:current.instance});
      if(task.cancelled){await api(`jobs/${current.id}/cancel`,{method:'POST'});change({state:'cancelled'});return null;}
      let previous='';
      while(['queued','generating'].includes(current.state)){
        if(previous!==current.state){change({state:current.state,id:current.id,instance:current.instance});previous=current.state;}
        await new Promise(resolve=>setTimeout(resolve,1000));
        current=await(await api(`jobs/${current.id}`)).json();
      }
      if(current.state==='cancelled'){change({state:'cancelled'});return null;}
      if(current.state!=='complete')throw Object.assign(new Error(current.error),{code:current.error});
      return (await api(`jobs/${current.id}/image`)).blob();
    }catch(error){
      if(error.code==='busy'){change({state:'busy',error:jobText.busy});return null;}
      change({state:'failed',error:describe(error.code)||jobText.failed});return null;
    }finally{running.delete(look.id);if(state.adapter&&!state.adapter.background)void refresh();}
  }
  async function cancel(id){const task=running.get(id);if(!task)return;task.cancelled=true;if(task.id)await api(`jobs/${task.id}/cancel`,{method:'POST'}).catch(()=>{});}
  return {
    ready,settings,generate,cancel,
    get connected(){return state.status==='invalid'||Boolean(state.adapter)&&!['none','expired'].includes(state.status);},
    get invalid(){return state.status==='invalid';},
    get invalidText(){return describe('invalid');},
    get available(){return state.status==='ready'||state.status==='waiting-agent'&&state.adapter?.background===false;},
    get automatic(){return enabled&&state.status==='ready'&&Boolean(state.adapter?.background);},
    get label(){return label();},
    fill(text){return fill(text,label());},
    get providerKey(){return state.providerKey||null;},
    get instance(){return state.instance||null;},
    get discardOnCancel(){return state.adapter?.cancel==='discard';},
    get message(){return ['waiting-agent','invalid'].includes(state.status)?'':describe(state.status);},
    get waitingAgent(){return state.status==='waiting-agent';},
    get waitingText(){return describe('waiting-agent');},
    notice(){
      let seen=false;try{seen=localStorage.getItem('outfit-notice')==='true';localStorage.setItem('outfit-notice','true');}catch{}
      return seen?'':`自动生成 3 张效果图，${cost(false)}可在 SETTINGS 关闭。`;
    },
    async convert(file){return (await api('convert',{method:'POST',body:file,type:'application/octet-stream'})).blob();},
    async input(id){return (await api(`input/${id}`)).blob();}
  };
}
