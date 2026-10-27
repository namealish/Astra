import {readdir,readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),base=process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/dist/index.html';
const report={url:base,modules:[],assets:[],bytes:0};
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
const files=(await readdir(new URL('dist/',root))).filter(name=>/\.(js|css|html)$/.test(name));
try{
 for(const file of files){
  const source=await readFile(new URL(file,root)),built=await readFile(new URL('dist/'+file,root));
  assert.equal(digest(source),digest(built),'Production is stale: '+file);
  const response=await fetch(new URL(file,base));assert.equal(response.status,200,file);
  assert.equal(digest(Buffer.from(await response.arrayBuffer())),digest(source),'HTTP content mismatch: '+file);
  report.modules.push(file);
 }
 for(const file of await readdir(new URL('assets/',root))){
  const path=new URL('assets/'+file,root);if(!(await stat(path)).isFile())continue;
  const source=await readFile(path),built=await readFile(new URL('dist/assets/'+file,root));
  assert.equal(digest(source),digest(built),'Stale/missing production asset: '+file);
  const response=await fetch(new URL('assets/'+file,base));assert.equal(response.status,200,file);
  assert.equal(Number(response.headers.get('content-length')),source.length);
  assert.equal(digest(Buffer.from(await response.arrayBuffer())),digest(source));
  report.assets.push(file);report.bytes+=source.length;
 }
 // Static references and relative module imports must be in the export too.
 for(const file of files){
  const text=await readFile(new URL(file,root),'utf8');
  const references=[...text.matchAll(/(?:src|href)=["']([^"']+)["']|url\(["']?([^)'"\s]+)["']?\)|(?:from\s*|import\s*\()["'](\.\/[^"']+)["']/g)];
  for(const match of references){const value=match[1]||match[2]||match[3];if(!value||/^(#|https?:|data:|mailto:|tel:)/.test(value)||/[${}]/.test(value)||value.endsWith('/'))continue;
   const url=new URL(value,base);assert.equal((await fetch(url,{method:'HEAD'})).status,200,file+' -> '+value);
  }
 }
}catch(error){report.failure=error.stack;throw error;}
finally{await mkdir(new URL('tmp/assets/',root),{recursive:true});await writeFile(new URL('tmp/assets/report.json',root),JSON.stringify(report,null,2));}
console.log(`Verified ${report.modules.length} production modules/styles/HTML and ${report.assets.length} local assets (${(report.bytes/1048576).toFixed(2)} MiB), byte-for-byte and over HTTP.`);
