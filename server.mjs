import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,stat} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('.',import.meta.url)));
const port=Number(process.env.PORT||5173);
const types={'.html':'text/html; charset=UTF-8','.js':'text/javascript; charset=UTF-8','.css':'text/css; charset=UTF-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.md':'text/markdown; charset=UTF-8','.json':'application/json; charset=UTF-8'};
createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!path.startsWith(root+sep)&&path!==root){res.writeHead(403).end('Forbidden');return;}
    const info=await stat(path);
    if(!info.isFile()){res.writeHead(404).end('Not found');return;}
    const range=req.headers.range;
    if(range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(range);
      if(!match){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
      const start=match[1]?Number(match[1]):0;
      const end=match[2]?Math.min(Number(match[2]),info.size-1):info.size-1;
      if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
      res.writeHead(206,{
        'Content-Type':types[extname(path)]||'application/octet-stream',
        'Content-Length':end-start+1,
        'Content-Range':`bytes ${start}-${end}/${info.size}`,
        'Accept-Ranges':'bytes',
        'Cache-Control':'no-cache',
        'X-Content-Type-Options':'nosniff'
      });
      if(req.method==='HEAD'){res.end();return;}
      createReadStream(path,{start,end}).pipe(res);
      return;
    }
    const body=await readFile(path);
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Content-Length':body.length,'Accept-Ranges':'bytes','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);
  }catch(e){res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`\n✧ ASTRAEA is ready: http://localhost:${port}\nPress Ctrl+C to stop.\n`));
