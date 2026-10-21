const localFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=(input,options)=>{
  const url=new URL(input instanceof Request?input.url:input,location.href);
  if(url.origin!==location.origin)return Promise.reject(new TypeError('External request blocked'));
  return localFetch(input,options);
};
let segmenter,runtime,jobs=Promise.resolve();
self.onmessage=({data})=>{jobs=jobs.catch(()=>{}).then(()=>processImage(data));};
async function processImage(data){
  let result;
  try{
    runtime??=Promise.all([import('../vendor/mediapipe/vision_bundle.mjs'),import('./extraction.mjs')]);
    const [{ImageSegmenter,FilesetResolver},{extract}]=await runtime;
    if(!segmenter){
      const probe=typeof OffscreenCanvas==='function'?new OffscreenCanvas(1,1):null;
      if(!probe||!(probe.getContext('webgl2')||probe.getContext('webgl')))throw new Error('no-webgl');
      const vision=await FilesetResolver.forVisionTasks(new URL('../vendor/mediapipe/wasm',location.href).href);
      segmenter=await ImageSegmenter.createFromOptions(vision,{baseOptions:{modelAssetPath:new URL('../models/selfie_multiclass_256x256.tflite',location.href).href,delegate:'CPU'},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false});
    }
    result=segmenter.segment(data.bitmap);
    const mask=result.categoryMask;
    self.postMessage({id:data.id,result:extract(data.pixels,mask.getAsUint8Array(),mask.width,mask.height,{includeMask:true})});
  }catch(error){
    self.postMessage({id:data.id,error:error.message});
  }finally{
    result?.close();
    data.bitmap.close();
  }
}
