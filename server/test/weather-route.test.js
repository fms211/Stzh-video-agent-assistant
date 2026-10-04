"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),express=require("express");
process.env.STZH_WEATHER_ENABLED="0";
const app=express();app.use(require("../routes/weather"));let server;
test.before(async()=>{server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));});
test("public weather works without an account and query parameters cannot select an upstream or secret",async()=>{
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const route of ["/api/weather","/api/weather?host=localhost&key=attacker&location=999999999"]){const response=await fetch(base+route);assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");assert.deepEqual(await response.json(),{available:false,reason:"DISABLED"});}
});
