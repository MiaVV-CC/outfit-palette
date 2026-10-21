import {validateEntry} from './schema.mjs';
let database,saveQueue=Promise.resolve();
function open(){
  database??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('outfit-workbench',1);
    request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('state');db.createObjectStore('archive',{keyPath:'id'});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{database=null;reject(request.error);};
  });
  return database;
}
async function transaction(store,mode,operation){
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,mode),request=operation(tx.objectStore(store));
    tx.oncomplete=()=>resolve(request?.result);
    tx.onerror=()=>reject(tx.error||request?.error);
    tx.onabort=()=>reject(tx.error||request?.error||new Error('Storage aborted'));
  });
}
export async function requestPersistence(){if(navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);}
export async function readRecent(){
  const entry=await transaction('state','readonly',store=>store.get('recent'));
  return validateEntry(entry)?entry:null;
}
export function saveRecent(entry){
  const snapshot=structuredClone(entry);
  const result=saveQueue.catch(()=>{}).then(()=>transaction('state','readwrite',store=>store.put(snapshot,'recent')));
  saveQueue=result;return result;
}
export function patchRecentLook(entryId,lookId,patch){
  const snapshot=structuredClone(patch);
  const result=saveQueue.catch(()=>{}).then(async()=>{
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),request=store.get('recent');
      request.onsuccess=()=>{const entry=request.result,look=entry?.looks.find(l=>l.id===lookId);if(entry?.id===entryId&&look){Object.assign(look,snapshot);store.put(entry,'recent');}};
      tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);
    });
  });
  saveQueue=result;return result;
}
export async function archiveLooks(entry){
  entry=structuredClone(entry);
  const db=await open();
  const reference={id:entry.id,original:entry.original,palette:entry.palette,accessories:entry.accessories,options:entry.options};
  const records=entry.looks.map(look=>({...structuredClone(look),reference:structuredClone(reference),savedAt:new Date().toISOString()}));
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('archive','readwrite'),store=tx.objectStore('archive');
    for(const record of records)store.put(record);
    tx.oncomplete=()=>resolve(records.map(r=>r.id));
    tx.onabort=tx.onerror=()=>reject(tx.error);
  });
}
export function readArchive(){return transaction('archive','readonly',store=>store.getAll());}
export function putArchive(record){return transaction('archive','readwrite',store=>store.put(structuredClone(record)));}
export function removeArchive(id){return transaction('archive','readwrite',store=>store.delete(id));}
export async function updateArchive(record){
  const snapshot=structuredClone(record),db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('archive','readwrite'),store=tx.objectStore('archive'),request=store.get(snapshot.id);
    let found=false;
    request.onsuccess=()=>{if(request.result){found=true;store.put(snapshot);}};
    tx.oncomplete=()=>resolve(found);tx.onabort=tx.onerror=()=>reject(tx.error);
  });
}
export async function mergeArchive(records){
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('archive','readwrite'),store=tx.objectStore('archive'),request=store.getAllKeys();
    let added=0,skipped=0;
    request.onsuccess=()=>{
      const known=new Set(request.result);
      for(const record of records){if(known.has(record.id)){skipped++;continue;}known.add(record.id);store.put(record);added++;}
    };
    tx.oncomplete=()=>resolve({added,skipped});tx.onabort=tx.onerror=()=>reject(tx.error);
  });
}
