"use strict";

const fs=require("node:fs"),path=require("node:path");
const {randomUUID,randomBytes}=require("node:crypto");
const {PluginError}=require("./errors.js");
const {packageRelativePath}=require("./manifest.js");
const denied=()=>new PluginError("BRIDGE_UNAUTHORIZED","插件界面凭证无效、过期或已撤销",403);
const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml",".woff2":"font/woff2"};

const BRIDGE_SCRIPT=`(()=>{
  let context,port,pending,serial=Promise.resolve(),counter=0,resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve});
  const send=(action,payload)=>{
    const request=serial.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
      const requestId=String(++counter);pending={resolve,reject,requestId};
      port.postMessage({...context,requestId,action,payload});
    }));serial=request;return request;
  };
  Object.defineProperty(window,'stzh',{value:Object.freeze({ready,invoke:async(tool,input)=>{await ready;return send('tool.invoke',{tool,input})},notify:async(message)=>{await ready;return send('ui.notify',{message})}})});
  addEventListener('message',event=>{
    if(port||event.source!==parent||event.data?.type!=='stzh:init'||!event.ports[0])return;
    context=event.data.context;port=event.ports[0];port.start();
    port.onmessage=event=>{
      const msg=event.data;
      if(!pending||msg.frameId!==context.frameId||msg.frameToken!==context.frameToken||msg.requestId!==pending.requestId)return;
      context.nonce=msg.nonce;const current=pending;pending=null;
      if(msg.error)current.reject(new Error(msg.error.message||msg.error));else current.resolve(msg.result);
    };
    send('ui.ready',{}).then(()=>resolveReady(Object.freeze({pluginId:context.pluginId,projectId:context.projectId,uiSurfaceId:context.uiSurfaceId,slot:context.slot}))).catch(error=>console.error(error.message));
  });
})();`;

class PluginUiAssets {
  constructor({store,generations,clock=Date.now,ttlMs=10*60000}){
    Object.assign(this,{store,generations,clock,ttlMs});this.frames=new Map();this.assets=new Map();
  }
  _purge(){for(const frame of this.frames.values())if(frame.expiresAt<=this.clock())this.revoke(frame.frameId);}
  _assert(frame){
    if(!frame||frame.expiresAt<=this.clock())throw denied();
    const active=this.generations.contributions(frame.userId,frame.projectId).find(item=>item.pluginId===frame.pluginId&&item.generationId===frame.generationId);
    if(!active||active.contentHash!==frame.contentHash)throw denied();
    return frame;
  }
  create(userId,projectId,{pluginId,slot,uiSurfaceId,expectedGenerationId}){
    this.store.assertProject(userId,projectId);this._purge();
    if(this.frames.size>=500)throw new PluginError("PLUGIN_FRAME_LIMIT","插件界面数量超过限制",429);
    const active=this.generations.contributions(userId,projectId).find(item=>item.pluginId===pluginId);
    if(!active?.manifest.entrypoints.ui)throw denied();
    if((slot==="plugin.workflow"||expectedGenerationId!=null)&&active.generationId!==expectedGenerationId)throw new PluginError("GENERATION_CONFLICT","插件界面版本已变化，请重新打开",409);
    const declared=slot==="plugin.page"?active.manifest.contributes.pages?.some(page=>page.uiSurfaceId===uiSurfaceId):slot==="plugin.workflow"?active.manifest.contributes.workflows?.some(item=>item.uiSurfaceId===uiSurfaceId):active.manifest.contributes.slots?.some(item=>item.slot===slot&&item.uiSurfaceId===uiSurfaceId);
    if(!declared)throw denied();
    const pkg=this.store.getPackage(userId,pluginId,active.version);
    const root=this.store.verifyPackage(userId,pkg),entry=active.manifest.entrypoints.ui;
    const frame={userId,projectId,pluginId,slot,uiSurfaceId,generationId:active.generationId,contentHash:active.contentHash,
      root:path.join(root,path.dirname(entry)),entry:path.basename(entry),frameId:`frame_${randomUUID()}`,frameToken:randomBytes(32).toString("hex"),assetToken:randomBytes(32).toString("hex"),nonce:randomBytes(16).toString("hex"),expiresAt:this.clock()+this.ttlMs};
    this.frames.set(frame.frameId,frame);this.assets.set(frame.assetToken,frame);
    return {frameId:frame.frameId,frameToken:frame.frameToken,assetToken:frame.assetToken,nonce:frame.nonce,generationId:frame.generationId,
      assetUrl:`/plugin-ui/${frame.assetToken}/${encodeURIComponent(frame.entry)}`,expiresAt:frame.expiresAt,allowedActions:["ui.ready","ui.notify","tool.invoke"]};
  }
  read(token,relative,origin){
    const frame=this._assert(this.assets.get(token));packageRelativePath(relative);
    const headers={
      "Content-Security-Policy":`default-src 'none'; script-src 'unsafe-inline' ${new URL(origin).origin}; style-src 'unsafe-inline' ${new URL(origin).origin}; img-src data: ${new URL(origin).origin}; font-src ${new URL(origin).origin}; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,
      "Referrer-Policy":"no-referrer","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Access-Control-Allow-Origin":"*",
    };
    if(relative==="__bridge.js")return {content:Buffer.from(BRIDGE_SCRIPT),mimeType:MIME[".js"],headers};
    const target=this.store.checkedPath(path.join(frame.root,relative));
    const boundary=path.relative(frame.root,target);
    if(boundary.startsWith("..")||path.isAbsolute(boundary))throw new PluginError("PACKAGE_BOUNDARY_VIOLATION","UI资产越界");
    const mimeType=MIME[path.extname(target).toLowerCase()];
    if(!mimeType||!fs.existsSync(target)||!fs.lstatSync(target).isFile())throw new PluginError("PLUGIN_ASSET_NOT_FOUND","插件界面文件不存在",404);
    if(fs.statSync(target).size>2*1024*1024)throw new PluginError("PLUGIN_OUTPUT_LIMIT","插件界面单文件超过2MB");
    let content=fs.readFileSync(target);
    if(path.extname(target).toLowerCase()===".html"){
      const script=`<script src="/plugin-ui/${frame.assetToken}/__bridge.js"></script>`;
      const html=content.toString("utf8");
      content=Buffer.from(/<head(?:\s[^>]*)?>/i.test(html)?html.replace(/<head(?:\s[^>]*)?>/i,head=>head+script):script+html);
    }
    return {content,mimeType,headers};
  }
  async bridge(userId,id,message){
    const frame=this._assert(this.frames.get(id));
    if(frame.userId!==userId||!message||message.bridgeVersion!==1||message.frameId!==id||message.frameToken!==frame.frameToken||message.nonce!==frame.nonce||!["ui.ready","ui.notify","tool.invoke"].includes(message.action))throw denied();
    if(!message.payload||typeof message.payload!=="object"||Array.isArray(message.payload)||JSON.stringify(message.payload).length>64000)throw denied();
    frame.nonce=randomBytes(16).toString("hex");
    try{
      let result={ok:true};
      if(message.action==="tool.invoke")result=await this.generations.invoke(userId,frame.projectId,frame.pluginId,String(message.payload.tool||""),message.payload.input);
      if(message.action==="ui.notify")result={message:String(message.payload.message||"").slice(0,500)};
      return {nonce:frame.nonce,result};
    }catch(error){return {nonce:frame.nonce,error:{code:error.code||"PLUGIN_ERROR",message:error.message}};}
  }
  renew(userId,id,token){const frame=this._assert(this.frames.get(id));if(frame.userId!==userId||frame.frameToken!==token)throw denied();frame.expiresAt=this.clock()+this.ttlMs;return {expiresAt:frame.expiresAt};}
  revoke(id){const frame=this.frames.get(id);if(frame){this.assets.delete(frame.assetToken);this.frames.delete(id);}}
  revokeOwned(userId,id,token){const frame=this.frames.get(id);if(!frame)return;if(frame.userId!==userId||frame.frameToken!==token)throw denied();this.revoke(id);}
  revokeTicket(assetToken,frameToken){const frame=this.assets.get(assetToken);if(!frame)return;if(frame.frameToken!==frameToken)throw denied();this.revoke(frame.frameId);}
}

module.exports={PluginUiAssets,BRIDGE_SCRIPT};
