"use strict";
const {gzipSync}=require("node:zlib");
function archiveTar(entries) {
  const blocks = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.content || "");
    const h = Buffer.alloc(512);
    h.write(entry.name,0,100);
    h.write("0000644\0",100); h.write("0000000\0",108); h.write("0000000\0",116);
    h.write(body.length.toString(8).padStart(11,"0")+"\0",124);
    h.write("00000000000\0",136); h.fill(32,148,156);
    h.write(entry.type || "0",156); if (entry.linkname) h.write(entry.linkname,157,100);
    h.write("ustar\0",257); h.write("00",263);
    const sum = h.reduce((a,b)=>a+b,0);
    h.write(sum.toString(8).padStart(6,"0")+"\0 ",148);
    blocks.push(h,body,Buffer.alloc((512-body.length%512)%512));
  }
  return gzipSync(Buffer.concat([...blocks,Buffer.alloc(1024)]));
}
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) { c ^= b; for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0); }
  return (c ^ 0xffffffff) >>> 0;
}
function archiveZip(entries) {
  const locals=[],central=[]; let offset=0;
  for (const entry of entries) {
    const name=Buffer.from(entry.name),body=Buffer.from(entry.content||""),crc=crc32(body);
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt32LE(crc,14);h.writeUInt32LE(body.length,18);h.writeUInt32LE(body.length,22);h.writeUInt16LE(name.length,26);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(0x0314,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc,16);c.writeUInt32LE(body.length,20);c.writeUInt32LE(body.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(entry.link?(0o120777<<16)>>>0:0,38);c.writeUInt32LE(offset,42);
    locals.push(h,name,body);central.push(c,name);offset+=h.length+name.length+body.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}

module.exports={archiveTar,archiveZip};
