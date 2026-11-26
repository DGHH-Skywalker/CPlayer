import { app } from "electron";
import { createHash } from "node:crypto";
import { coreLog } from "@main/utils/logger";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { effectiveDynamics } from "./audioEffects";
import { dynamicsSafetyCeilingDb } from "@shared/types/audioEffects";
let resources: { wasm: string; processor: string } | undefined;
/** 固定资源按应用版本加载一次，不依赖 Core 或网络 */
const loadResources = (): NonNullable<typeof resources> => {
  if (!resources) {
    const root = join(
      app.isPackaged ? process.resourcesPath : join(app.getAppPath(), "vendor"),
      "noiselimiter",
    );
    const wasm = readFileSync(join(root, "dynamics.wasm"));
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
    if (createHash("sha256").update(wasm).digest("hex") !== manifest.wasmSha256)
      throw new Error("NoiseLimiter 校验失败");
    resources = {
      wasm: wasm.toString("base64"),
      processor: readFileSync(join(root, "processor.js"), "utf8"),
    };
  }
  return resources;
};
/** 构建不含特权接口的页面音频图，首个 play 前先连接保守输出保护 */
export const noiseLimiterBootstrap = (): string => {
  const state = effectiveDynamics();
  let r: NonNullable<typeof resources>;
  try {
    r = loadResources();
  } catch (error) {
    coreLog.error("NoiseLimiter 本地资源不可用", error);
    return `(()=>{
      if(location.protocol!=='https:'||!(location.hostname==='bilibili.com'||location.hostname.endsWith('.bilibili.com')))return;
      let enabled=${JSON.stringify(state.enabled)};const original=HTMLMediaElement.prototype.play,muted=new WeakMap();
      const block=media=>{if(!enabled||!(media instanceof HTMLMediaElement))return;if(!muted.has(media))muted.set(media,media.muted);media.muted=true;media.pause();try{carbonvMedia(JSON.stringify({audioEffect:{state:'error',reductionDb:0}}))}catch{}};
      const update=state=>{enabled=state.enabled;for(const media of document.querySelectorAll('video,audio')){if(enabled)block(media);else if(muted.has(media)){media.muted=muted.get(media);muted.delete(media);}}};
      for(const event of ['play','playing','loadedmetadata','canplay'])addEventListener(event,e=>block(e.target),true);
      HTMLMediaElement.prototype.play=function(...args){if(!enabled)return original.apply(this,args);block(this);return Promise.reject(new Error('NoiseLimiter 资源不可用'))};
      window.__carbonvDynamics={update,status:()=>({enabled,error:true})};update({enabled});
    })();`;
  }
  return `(() => {
  if(location.protocol!=='https:' || !(location.hostname==='bilibili.com'||location.hostname.endsWith('.bilibili.com')))return;
  const initial=${JSON.stringify(state)};
  if(window.__carbonvDynamics){window.__carbonvDynamics.update(initial);return;}
  let config=initial,ctx=null,modulePromise=null,ended=false;
  const active=new Set(),records=new WeakMap();
  const originalPlay=HTMLMediaElement.prototype.play;
  const report=(state,reductionDb=0)=>{try{carbonvMedia(JSON.stringify({audioEffect:{state,reductionDb}}))}catch{}};
  const safetyCeiling=${dynamicsSafetyCeilingDb.toString()};
  const curve=()=>{if(!config.enabled)return null;const c=10**(safetyCeiling(config.config)/20),v=new Float32Array(65537);for(let i=0;i<v.length;i++)v[i]=Math.max(-c,Math.min(c,i*2/(v.length-1)-1));return v;};
  const ready=()=>{
    if(!ctx){ctx=new AudioContext({latencyHint:'interactive'});
      const source=${JSON.stringify(r.processor)};
      const url=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));
      modulePromise=Promise.all([ctx.audioWorklet.addModule(url),WebAssembly.compile(Uint8Array.from(atob(${JSON.stringify(r.wasm)}),c=>c.charCodeAt(0)))]).then(([,module])=>module).finally(()=>URL.revokeObjectURL(url));
    }
    return ctx;
  };
  const attach=(media)=>{
    let record=records.get(media);

    if(!record?.attached && active.size>=16)throw new Error('音效媒体数量超限');
    const context=ready();
    // 只接受同源、MSE 或明确启用 CORS 的媒体，不能静默把受限制媒体接成无声
    const sourceURL=media.currentSrc||media.src;
    if(sourceURL && !media.srcObject && !sourceURL.startsWith('blob:') && !sourceURL.startsWith('data:') && new URL(sourceURL,location.href).origin!==location.origin && !media.crossOrigin)throw new Error('音效不支持当前跨域媒体');
    if(record?.attached)return record;
    if(!record){record={media,source:context.createMediaElementSource(media),fallback:context.createWaveShaper(),node:null,attached:false};records.set(media,record);}
    record.attached=true;record.fallback.curve=curve();record.source.connect(record.fallback);record.fallback.connect(context.destination);active.add(record);report('fallback');
    modulePromise.then(module=>{
      if(!record.attached||ended)return;
      const node=new AudioWorkletNode(context,'carbonv-dynamics',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{module,config}});
      record.node=node;node.port.onmessage=({data})=>{if(!ended&&record.attached){record.last=data;report(data.state,data.reductionDb);}};
      node.onprocessorerror=()=>{if(!record.attached||record.node!==node)return;record.source.disconnect();node.disconnect();node.port.onmessage=null;node.port.close();record.node=null;record.fallback.disconnect();record.source.connect(record.fallback);record.fallback.connect(context.destination);record.last={state:'fallback',peak:0,reductionDb:0};report('fallback');};
      node.connect(context.destination);record.source.disconnect();record.fallback.disconnect();record.source.connect(node);
    }).catch(()=>report('fallback'));
    return record;
  };
  const update=(state)=>{
    config=state;
    for(const record of active){record.fallback.curve=curve();record.node?.port.postMessage({config});}
    if(state.enabled)for(const media of document.querySelectorAll('video,audio'))if(!media.paused){try{attach(media);ctx.resume().catch(()=>{})}catch{media.pause();report('error')}}
  };
  const suspendIdle=()=>{if(ctx&&[...active].every(record=>record.media.paused||record.media.ended))ctx.suspend().then(()=>{if([...active].every(record=>record.media.paused||record.media.ended))report('idle',0)}).catch(()=>{});};
  for(const name of ['pause','ended'])document.addEventListener(name,()=>queueMicrotask(suspendIdle),true);
  document.addEventListener('play',event=>{const media=event.target;if(!(media instanceof HTMLMediaElement)||media.paused)return;try{if(config.enabled)attach(media);if(records.get(media)?.attached)ctx.resume().catch(()=>{})}catch{media.pause();report('error')}},true);
  HTMLMediaElement.prototype.play=function(...args){
    if(!config.enabled)return originalPlay.apply(this,args);
    try{attach(this);return Promise.all([ctx.resume(),originalPlay.apply(this,args)]).then(()=>undefined);}
    catch(error){this.pause();report('error');return Promise.reject(error);}
  };
  document.addEventListener('loadedmetadata',event=>{if(config.enabled && event.target instanceof HTMLMediaElement){try{attach(event.target)}catch{event.target.pause();report('error')}}},true);
  const observer=new MutationObserver(()=>{
    for(const record of active)if(!record.media.isConnected){record.media.pause();record.source.disconnect();record.node?.port.postMessage({dispose:true});record.node?.disconnect();record.fallback.disconnect();record.node=null;record.attached=false;active.delete(record);}
    queueMicrotask(suspendIdle);
  });observer.observe(document,{childList:true,subtree:true});
  window.__carbonvDynamics={update,status:()=>({enabled:config.enabled,connected:active.size,context:ctx?.state,latency:ctx?.baseLatency??0,reports:[...active].map(r=>r.last)})};
  addEventListener('pagehide',()=>{ended=true;report('idle',0);observer.disconnect();for(const record of active){record.media.pause();record.node?.port.postMessage({dispose:true});record.source.disconnect();record.node?.disconnect();record.fallback.disconnect();}active.clear();ctx?.close().catch(()=>{});},{once:true});
 })();`;
};
