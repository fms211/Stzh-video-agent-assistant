"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { SourceResolver, unpackTar, unpackZip } = require("../plugin-system/source-resolver.js");

const manifest = { schemaVersion:1, id:"test.archive", name:"Archive test", description:"owned fixture", version:"1.0.0", engine:{stzh:"^0.1.0"}, entrypoints:{host:"index.cjs"}, requestedPermissionTier:"safe", contributes:{} };
const { archiveTar, archiveZip } = require("./helpers/plugin-archives.js");
const files = prefix => [{name:`${prefix}stzh-plugin.json`,content:JSON.stringify(manifest)},{name:`${prefix}index.cjs`,content:"module.exports={};"}];

test("local ZIP packages validate upload hash and expose actual manifest bytes",async()=>{
  const bytes=archiveZip(files(""));
  const resolver=new SourceResolver({loadUpload:async(userId,token)=>{assert.equal(userId,7);assert.equal(token,"upload-1");return bytes;}});
  const source={type:"local",uploadToken:"upload-1",fileName:"plugin.stzhplugin",contentHash:createHash("sha256").update(bytes).digest("hex")};
  const resolved=await resolver.resolve(7,source);
  assert.equal(resolved.manifest.id,manifest.id);
  assert.equal(resolved.files["index.cjs"].toString(),"module.exports={};");
  await assert.rejects(resolver.resolve(7,{...source,contentHash:"wrong"}),{code:"PREVIEW_HASH_MISMATCH"});
});

test("npm tags pin exact releases and tarball integrity is verified",async()=>{
  const bytes=archiveTar(files("package/"));
  const metadata={"dist-tags":{latest:"1.0.0"},versions:{"1.0.0":{dist:{tarball:"https://registry.npmjs.org/test.archive/-/test.archive-1.0.0.tgz",integrity:`sha512-${createHash("sha512").update(bytes).digest("base64")}`}}}};
  const resolver=new SourceResolver({fetchImpl:async(url)=>String(url).endsWith(".tgz")?new Response(bytes):Response.json(metadata)});
  const resolved=await resolver.resolve(1,{type:"npm",spec:"test.archive@latest"});
  assert.equal(resolved.resolvedRef,"test.archive@1.0.0");
  assert.equal(resolved.manifest.version,"1.0.0");
  metadata.versions["1.0.0"].dist.integrity="sha512-AAAA";
  await assert.rejects(resolver.resolve(1,{type:"npm",spec:"test.archive"}),{code:"PREVIEW_HASH_MISMATCH"});
});

test("GitHub refs resolve to an immutable commit before downloading",async()=>{
  const sha="a".repeat(40),requests=[];
  const resolver=new SourceResolver({fetchImpl:async(url)=>{requests.push(String(url));return String(url).includes("/commits/")?Response.json({sha}):new Response(archiveTar(files("repo-commit/")));}});
  const result=await resolver.resolve(1,{type:"git",url:"https://github.com/owner/repo.git",ref:"main"});
  assert.equal(result.resolvedRef,sha);
  assert.equal(requests[1],`https://codeload.github.com/owner/repo/tar.gz/${sha}`);
  await assert.rejects(resolver.resolve(1,{type:"git",url:"http://127.0.0.1/private",ref:null}),{code:"SOURCE_RESOLUTION_FAILED"});
});

test("archive traversal and links are refused before writing any files",async()=>{
  await assert.rejects(unpackTar(archiveTar([{name:"../outside",content:"bad"}])),{code:"PACKAGE_BOUNDARY_VIOLATION"});
  await assert.rejects(unpackTar(archiveTar([{name:"link",type:"2",linkname:"/outside"}])),{code:"PACKAGE_BOUNDARY_VIOLATION"});
  await assert.rejects(unpackZip(archiveZip([{name:"link",content:"/outside",link:true}])),{code:"PACKAGE_BOUNDARY_VIOLATION"});
  await assert.rejects(unpackZip(archiveZip([{name:"../outside",content:"bad"}])));
});
