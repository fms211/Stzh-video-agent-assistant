const test = require('node:test');
const assert = require('node:assert/strict');
const options = format => ({ format, sessionId:'coze_export_fixture', exportedAt:'2026-10-03T08:00:00.000Z' });

test('Coze text exports retain the complete reply alongside every recorded media link', async () => {
  const {exportCozeConversation}=await import('../app/lib/coze-export.ts');
  const messages=[{role:'user',text:'中文、English与链接 https://example.com/。'},
    {role:'agent',text:'回复第一段。\n\n第二段：部分能力未完成。',payload:{requestId:'local-fixture',videoUrl:'https://example.com/video.mp4',imageUrls:['https://example.com/a.png','https://example.com/b.png']}}];
  const before=structuredClone(messages);
  for(const format of ['markdown','txt']) {
    const file=exportCozeConversation(messages,options(format));
    for(const value of ['中文、English','第二段：部分能力未完成。','https://example.com/video.mp4','https://example.com/a.png','https://example.com/b.png','local-fixture'])assert.ok(file.content.includes(value));
    assert.match(file.type,/charset=utf-8/);
  }
  assert.deepEqual(messages,before);
});
test('legacy payload text is retained without duplicating it or exporting a serialized placeholder',async()=>{
  const {exportCozeConversation}=await import('../app/lib/coze-export.ts');
  const messages=[{role:'agent',text:'旧版正文',payload:{raw:{text:'旧版正文'}}},{role:'agent',text:'serialized placeholder',textIsPayload:true,payload:{requestId:'legacy',raw:{text:'真实旧回复'}}}];
  const file=exportCozeConversation(messages,options('markdown'));
  assert.equal(file.content.split('旧版正文').length-1,1);
  assert.ok(file.content.includes('真实旧回复'));assert.ok(!file.content.includes('serialized placeholder'));
  assert.ok(!file.content.includes('undefined'));
});
test('raw structured replies and errors retain their meaning in both text formats',async()=>{
  const {exportCozeConversation}=await import('../app/lib/coze-export.ts');
  for(const format of ['markdown','txt']){
    const file=exportCozeConversation([{role:'agent',payload:{raw:{status:'本机合成',count:2}}},{role:'agent',isError:true,errorText:'没有额度；记录仍保留。'},{role:'agent',isError:true,text:'旧错误记录'}],options(format));
    for(const value of ['本机合成','"count": 2','没有额度；记录仍保留。','旧错误记录'])assert.ok(file.content.includes(value));
  }
});
test('JSON export preserves full messages and trace without imposing the outbound history budget',async()=>{
  const {exportCozeConversation}=await import('../app/lib/coze-export.ts');
  const messages=Array.from({length:30},(_,i)=>({role:i%2?'agent':'user',text:`历史-${i}`,contextTrace:{applied:false,rollout:'shadow'}}));
  const json=JSON.parse(exportCozeConversation(messages,options('json')).content);
  assert.equal(json.messages.length,30);assert.equal(json.messages[0].text,'历史-0');
  assert.equal(json.messages[29].contextTrace.applied,false);assert.equal(json.exportedAt,options('json').exportedAt);
});
test('optional human timestamps are omitted by default and added only when requested',async()=>{
  const {exportCozeConversation}=await import('../app/lib/coze-export.ts');
  const plain=exportCozeConversation([],options('txt'));
  assert.ok(!plain.content.includes('导出时间'));
  const dated=exportCozeConversation([],{...options('markdown'),timestamp:'本机时间'});
  assert.ok(dated.content.includes('> 本机时间'));assert.equal(dated.extension,'md');
});
