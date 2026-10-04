"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createWeatherService}=require("../weather-service");
const secret="synthetic-weather-credential-not-a-real-key";
const config=()=>({QWEATHER_API_KEY:secret,QWEATHER_API_HOST:"synthetic.account.qweatherapi.com",QWEATHER_LOCATION:"101280601",QWEATHER_CITY:"深圳"});
const addresses=async()=>[{address:"93.184.216.34",family:4}];
const payload=()=>({code:"200",now:{temp:"23",humidity:"65",windScale:"2",feelsLike:"24",text:"多云",icon:"101",windDir:"东北风",credential:secret}});
const response=data=>({ok:true,headers:{get:()=>null},json:async()=>data});
test("missing/disabled/invalid settings never start an upstream request",async()=>{
 for(const env of [{}, {...config(),STZH_WEATHER_ENABLED:"0"},{...config(),STZH_WEATHER_ENABLED:"unknown"},{...config(),QWEATHER_API_HOST:"localhost"},{...config(),QWEATHER_API_HOST:"x.qweatherapi.com.evil.test"},{...config(),QWEATHER_API_KEY:"bad\r\nheader"},{...config(),QWEATHER_LOCATION:"101280601&key=private"}]){
  let calls=0;const service=createWeatherService({env,fetchImpl:async()=>{calls++;},lookupImpl:async()=>{calls++;}});
  const result=await service.current();assert.equal(result.available,false);assert.equal(calls,0);assert.ok(!JSON.stringify(result).includes(secret));
 }
});
test("only the configured HTTPS host/location is requested and credentials never enter the URL or public result",async()=>{
 let sent;const service=createWeatherService({env:config(),lookupImpl:addresses,fetchImpl:async(url,options)=>{sent={url,options};return response(payload());}});
 const result=await service.current();assert.equal(result.available,true);assert.equal(result.data.temp,23);assert.equal(result.data.city,"深圳");
 assert.equal(new URL(sent.url).origin,"https://synthetic.account.qweatherapi.com");assert.equal(new URL(sent.url).searchParams.get("location"),"101280601");assert.equal(new URL(sent.url).searchParams.has("key"),false);assert.equal(sent.options.headers["X-QW-Api-Key"],secret);assert.equal(sent.options.redirect,"error");
 assert.ok(!JSON.stringify(result).includes(secret));assert.ok(!JSON.stringify(result).includes("credential"));assert.ok(!JSON.stringify(result).includes("qweatherapi.com"));
});
test("private, mixed and missing DNS results reject before credentials leave",async()=>{
 for(const lookup of [[],[{address:"127.0.0.1"}],[{address:"172.29.0.106"}],[{address:"::1"}],[{address:"93.184.216.34"},{address:"10.0.0.1"}]]){
  let sent=0;const service=createWeatherService({env:config(),lookupImpl:async()=>lookup,fetchImpl:async()=>{sent++;}});assert.equal((await service.current()).available,false);assert.equal(sent,0);
 }
});
test("concurrent callers share one request, successful responses cache, and credential changes invalidate the cache",async()=>{
 let calls=0,release,time=1000;const env=config();const gate=new Promise(resolve=>{release=resolve;});
 const service=createWeatherService({env,now:()=>time,lookupImpl:addresses,fetchImpl:async()=>{calls++;await gate;return response(payload());}});
 const first=service.current(),second=service.current();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);release();assert.deepEqual(await first,await second);await service.current();assert.equal(calls,1);
 time+=30*60*1000+1;await service.current();assert.equal(calls,2);env.QWEATHER_API_KEY="another-synthetic-credential";await service.current();assert.equal(calls,3);
});
test("upstream failures back off and never expose raw error text",async()=>{
 let calls=0,time=0;const service=createWeatherService({env:config(),now:()=>time,lookupImpl:addresses,fetchImpl:async()=>{calls++;throw Error(secret);}});
 assert.deepEqual(await service.current(),{available:false,reason:"UNAVAILABLE"});await service.current();assert.equal(calls,1);time+=60001;await service.current();assert.equal(calls,2);
});
test("timeout returns promptly and late DNS cannot initiate an upstream request",async()=>{
 let release,sent=0;const lookup=new Promise(resolve=>{release=resolve;});const service=createWeatherService({env:config(),timeoutMs:20,lookupImpl:()=>lookup,fetchImpl:async()=>{sent++;}});
 assert.equal((await service.current()).available,false);release([{address:"93.184.216.34"}]);await new Promise(resolve=>setImmediate(resolve));assert.equal(sent,0);
});
test("invalid numeric weather cannot become a fabricated zero-temperature reading",async()=>{
 for(const value of [null,false,""," ","NaN","Infinity",undefined]){
  const data=payload();data.now.temp=value;const service=createWeatherService({env:config(),lookupImpl:addresses,fetchImpl:async()=>response(data)});assert.equal((await service.current()).available,false);
 }
});


test("validated addresses are pinned for connection lookup and TLS hostname verification stays enabled", async () => {
 let dnsCalls=0,options;
 const env=config();const service=createWeatherService({env,lookupImpl:async()=>{dnsCalls++;return[{address:"93.184.216.34",family:4}];},createDispatcher:value=>{options=value;return{destroy(){}};},fetchImpl:async()=>response(payload())});
 assert.equal((await service.current()).available,true);assert.equal(dnsCalls,1);assert.equal(options.connect.rejectUnauthorized,true);assert.equal(options.connect.servername,env.QWEATHER_API_HOST);
 const lookup=(host,opts)=>new Promise((resolve,reject)=>options.connect.lookup(host,opts,(error,address,family)=>error?reject(error):resolve({address,family})));
 assert.deepEqual(await lookup(env.QWEATHER_API_HOST,{all:true}),{address:[{address:"93.184.216.34",family:4}],family:undefined});
 assert.deepEqual(await lookup(env.QWEATHER_API_HOST,{family:4}),{address:"93.184.216.34",family:4});
 await assert.rejects(lookup("localhost",{}),/Unexpected/);assert.equal(dnsCalls,1);
});

test("selected display fields that echo the configured credential are rejected",async()=>{
 const data=payload();data.now.text=secret;
 const service=createWeatherService({env:config(),lookupImpl:addresses,fetchImpl:async()=>response(data)});
 assert.deepEqual(await service.current(),{available:false,reason:"UNAVAILABLE"});
});


test("an oversized chunked response is cancelled even without a Content-Length header",async()=>{
 let cancelled=false;
 const reader={read:async()=>({done:false,value:new Uint8Array(32769)}),cancel:async()=>{cancelled=true;},releaseLock(){}};
 const service=createWeatherService({env:config(),lookupImpl:addresses,fetchImpl:async()=>({ok:true,headers:{get:()=>null},body:{getReader:()=>reader}})});
 assert.equal((await service.current()).available,false);assert.equal(cancelled,true);
});
