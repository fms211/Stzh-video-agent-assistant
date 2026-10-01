const test=require("node:test"),assert=require("node:assert/strict");
test("Web RAG uses same-origin backend routes instead of a visitor's localhost",async()=>{
 const prior=global.fetch,calls=[];
 global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(String(url).endsWith('/health')?{ok:true,entries:1}:{results:[],query:'测试',total:0});};
 try{
  const rag=await import('../app/lib/rag-client.ts');
  await rag.ragRetrieve('本地检索测试',5,0.45,true);
  assert.equal(calls[0].url,'/api/rag/retrieve');
  assert.equal(JSON.parse(calls[0].options.body).query,'本地检索测试');
 }finally{global.fetch=prior;}
});
