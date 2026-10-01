"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
const moduleObject={exports:{}};
const source=fs.readFileSync(require.resolve("../app/lib/provider-presets.ts"),"utf8");
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleObject,exports:moduleObject.exports,URL});
const {PROVIDER_PRESETS,emptyProvider,applyProviderPreset,safeWebsiteUrl}=moduleObject.exports;
test("vendor changes clear credentials, model IDs and capacity while retaining output budgets",()=>{
  const previous={...emptyProvider,apiKey:"synthetic-old-vendor-key",model:"old-model",contextWindowTokens:"32768",maxOutputTokens:"512"};
  const selected=applyProviderPreset(previous,"mimo");
  assert.equal(selected.apiKey,"");assert.equal(selected.model,"");assert.equal(selected.contextWindowTokens,"");assert.equal(selected.maxOutputTokens,"512");
  assert.equal(selected.baseUrl,"https://api.xiaomimimo.com/v1");assert.equal(selected.outputTokenParameter,"max_completion_tokens");assert.equal(selected.thinkingMode,"disabled");
  assert.equal(previous.apiKey,"synthetic-old-vendor-key");
  for(const preset of PROVIDER_PRESETS){assert.equal(new URL(preset.baseUrl).protocol,"https:");assert.ok(safeWebsiteUrl(preset.websiteUrl));}
});
test("custom connections stay editable and unsafe website schemes cannot become clickable links",()=>{
  const custom=applyProviderPreset({...emptyProvider,baseUrl:"https://custom.example/v1"},"custom");assert.equal(custom.baseUrl,"https://custom.example/v1");assert.equal(custom.vendorId,"custom");
  for(const value of ["javascript:alert(1)","data:text/html,test","https://name:password@example.org","invalid"]){assert.equal(safeWebsiteUrl(value),null);}
  assert.equal(safeWebsiteUrl("https://example.org"),"https://example.org/");
});
