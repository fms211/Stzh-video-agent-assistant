"use strict";

const fs=require("node:fs");
const path=require("node:path");
const https=require("node:https");
const dns=require("node:dns/promises");
const net=require("node:net");
const {randomUUID,createHash}=require("node:crypto");
const {PluginError}=require("./errors.js");
const {TIERS,packageRelativePath}=require("./manifest.js");

const REQUIRED={"project.read":0,"artifact.list":0,"artifact.read":0,"artifact.write":1,"model.chat":1,"network.fetch":1,"task.create":2,"subprocess.run":2};
const denied=()=>new PluginError("BRIDGE_UNAUTHORIZED","当前插件没有此项目能力的授权",403);

function isPublicAddress(address) {
  if(net.isIP(address)===4) {
    const [a,b]=address.split(".").map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19)));
  }
  if(net.isIP(address)===6) {
    // Restrict broker IPv6 to globally routed unicast, excluding mapped/local forms.
    return /^[23][0-9a-f]{0,3}:/i.test(address)&&!/^2001:db8:/i.test(address);
  }
  return false;
}

async function requestPublicNetwork(input,context={}) {
  const url=new URL(input.url);
  const addresses=await dns.lookup(url.hostname,{all:true});
  context.signal?.throwIfAborted();
  if(!addresses.length||addresses.some(item=>!isPublicAddress(item.address)))throw denied();
  const chosen=addresses[0];
  const method=input.method||"GET";
  if(!["GET","POST"].includes(method))throw denied();
  const body=method==="POST"?JSON.stringify(input.body??{}):null;
  if(body&&Buffer.byteLength(body)>64*1024)throw new PluginError("PLUGIN_OUTPUT_LIMIT","网络请求正文超过64KB");
  return new Promise((resolve,reject)=>{
    const request=https.request(url,{
      method,agent:false,signal:context.signal,headers:{Accept:"application/json,text/plain",...(body?{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)}:{})},
      lookup:(_hostname,options,callback)=>options.all?callback(null,[chosen]):callback(null,chosen.address,chosen.family),
    },response=>{
      let size=0;const chunks=[];
      response.on("data",chunk=>{size+=chunk.length;if(size>128*1024)request.destroy(new PluginError("PLUGIN_OUTPUT_LIMIT","网络响应超过128KB"));else chunks.push(chunk);});
      response.on("error",reject);
      response.on("end",()=>resolve({status:response.statusCode,contentType:String(response.headers["content-type"]||""),body:Buffer.concat(chunks).toString("utf8")}));
    });
    request.setTimeout(15000,()=>request.destroy(new PluginError("PLUGIN_TIMEOUT","插件网络请求超时")));
    request.on("error",reject);
    if(body)request.write(body);
    request.end();
  });
}

class PermissionBroker {
  constructor({store,userId,projectId,binding,manifest,model,createTask,runCommand,requestNetwork=requestPublicNetwork,isActive=()=>true,signal}) {
    Object.assign(this,{store,userId,projectId,binding,manifest,model,createTask,runCommand,requestNetwork,isActive,signal});
    store.db.exec(`CREATE TABLE IF NOT EXISTS plugin_artifacts (
      id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,project_id TEXT NOT NULL,plugin_id TEXT NOT NULL,
      name TEXT NOT NULL,mime_type TEXT NOT NULL,relative_path TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL
    )`);
  }

  async call(method,input={}) {
    this.store.assertProject(this.userId,this.projectId);
    if(!this.isActive()||this.signal?.aborted||!Object.hasOwn(REQUIRED,method)||!Object.hasOwn(TIERS,this.binding.permissionTier)||TIERS[this.binding.permissionTier]<REQUIRED[method])throw denied();
    if(!input||typeof input!=="object"||Array.isArray(input))throw new PluginError("INVALID_INPUT","能力参数必须是对象");
    const context={userId:this.userId,projectId:this.projectId,pluginId:this.binding.pluginId,signal:this.signal};
    if(method==="project.read")return this.store.db.prepare("SELECT id,name FROM creative_projects WHERE id=? AND user_id=?").get(this.projectId,this.userId);
    if(method==="artifact.list")return this.store.db.prepare("SELECT id,name,mime_type mimeType,size,created_at createdAt FROM plugin_artifacts WHERE user_id=? AND project_id=? AND plugin_id=? ORDER BY created_at DESC LIMIT 100").all(this.userId,this.projectId,this.binding.pluginId);
    if(method==="artifact.read") {
      const row=this.store.db.prepare("SELECT * FROM plugin_artifacts WHERE id=? AND user_id=? AND project_id=? AND plugin_id=?").get(String(input.id||""),this.userId,this.projectId,this.binding.pluginId);
      if(!row)throw new PluginError("ARTIFACT_NOT_FOUND","产物不存在",404);
      const file=this.store.checkedPath(path.join(this.store.accountRoot(this.userId),row.relative_path));
      return {id:row.id,name:row.name,mimeType:row.mime_type,content:fs.readFileSync(file,"utf8")};
    }
    if(method==="artifact.write") {
      const name=packageRelativePath(input.name);
      if(typeof input.content!=="string"||Buffer.byteLength(input.content)>128*1024)throw new PluginError("PLUGIN_OUTPUT_LIMIT","产物必须为128KB以内的文本");
      const id=`artifact_${randomUUID()}`;
      const scope=createHash("sha256").update(JSON.stringify([this.projectId,this.binding.pluginId])).digest("hex");
      const relative=path.join("data",scope,id,name),file=this.store.checkedPath(path.join(this.store.accountRoot(this.userId),relative));
      fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,input.content,{flag:"wx"});
      const result={id,name,mimeType:["text/plain","text/markdown","application/json"].includes(input.mimeType)?input.mimeType:"text/plain",size:Buffer.byteLength(input.content),createdAt:new Date().toISOString()};
      try {this.store.db.prepare("INSERT INTO plugin_artifacts(id,user_id,project_id,plugin_id,name,mime_type,relative_path,size,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run(id,this.userId,this.projectId,this.binding.pluginId,name,result.mimeType,relative,result.size,result.createdAt);}
      catch(error){fs.unlinkSync(file);throw error;}
      return result;
    }
    if(method==="network.fetch") {
      let url;try{url=new URL(input.url);}catch{throw denied();}
      const host=url.hostname.replace(/^\[|\]$/g,"").toLowerCase(),network=this.manifest.runtimeNetwork;
      if(url.protocol!=="https:"||url.username||url.password||url.port||host==="localhost"||host.endsWith(".local")||host.endsWith(".localhost")||(net.isIP(host)&&!isPublicAddress(host)))throw denied();
      if(!network||(!network.publicInternet&&!network.allowedDomains?.includes(host)))throw denied();
      if(network.allowedDomains?.length&&!network.allowedDomains.includes(host))throw denied();
      return this.requestNetwork({...input,url:url.href},context);
    }
    if(method==="model.chat") {
      if(!this.model)throw new PluginError("MODEL_NOT_CONFIGURED","项目尚未配置模型调用能力");
      if(!Array.isArray(input.messages)||input.messages.length>20)throw new PluginError("INVALID_INPUT","模型消息列表无效");
      const messages=input.messages.map(message=>({role:["system","assistant"].includes(message.role)?message.role:"user",content:String(message.content||"").slice(0,20000)}));
      return this.model({messages},context);
    }
    if(method==="task.create") {
      if(!this.createTask)throw new PluginError("TASKS_UNAVAILABLE","任务创建能力未配置");
      if(typeof input.prompt!=="string"||!input.prompt.trim()||input.prompt.length>5000)throw new PluginError("INVALID_INPUT","任务提示词不能为空且不得超过5000字");
      return this.createTask({prompt:input.prompt.trim(),title:String(input.title||input.prompt).slice(0,120)},context);
    }
    if(method==="subprocess.run") {
      if(!this.runCommand)throw new PluginError("SUBPROCESS_NOT_CONFIGURED","服务器尚未配置允许插件使用的命令");
      return this.runCommand({command:input.command,args:input.args},context);
    }
    throw denied();
  }
}

module.exports={PermissionBroker,requestPublicNetwork,isPublicAddress};
