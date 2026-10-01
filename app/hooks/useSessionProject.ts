"use client";
import { useCallback, useEffect, useState } from "react";

const keyFor = (owner: number | undefined, session: string) => owner && session ? `tszh:v2:user:${owner}:session-project:${encodeURIComponent(session)}` : "";

export function useSessionProject(owner: number | undefined, sessionId: string) {
  const key = keyFor(owner,sessionId);
  const [selection,setSelection] = useState({key:"",projectId:"",ready:false,error:""});
  useEffect(()=>{
    if(selection.key===key && selection.ready)return;
    if(!key){setSelection({key,projectId:"",ready:true,error:""});return;}
    try {
      const raw=localStorage.getItem(key);
      const saved=raw===null?{projectId:""}:JSON.parse(raw);
      if(!saved||typeof saved.projectId!=="string"||saved.projectId.length>200)throw new Error("invalid selection");
      setSelection({key,projectId:saved.projectId,ready:true,error:""});
    } catch {
      setSelection({key,projectId:"",ready:false,error:"无法恢复此会话的项目选择。请重新选择项目后再发送。"});
    }
  },[key]);
  const select = useCallback((projectId:string,targetSession=sessionId)=>{
    const targetKey=keyFor(owner,targetSession);
    if(!targetKey)return;
    let error="";
    try{localStorage.setItem(targetKey,JSON.stringify({projectId}));}
    catch{error="项目选择未能保存在本机，本次仍可使用；刷新后请重新核对项目。";}
    setSelection({key:targetKey,projectId,ready:true,error});
  },[owner,sessionId]);
  return {projectId:selection.key===key?selection.projectId:"",ready:!key||(selection.key===key&&selection.ready),error:selection.key===key?selection.error:"",select};
}
