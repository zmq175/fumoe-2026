import {createServer} from 'node:http'
import {readFile,stat} from 'node:fs/promises'
import {resolve,extname} from 'node:path'
const root=resolve('.local/s2-artwork')
const server=createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path==='/'?resolve('scripts/s2-preview/index.html'):resolve(root,'.'+path);if(path!=='/'&&!file.startsWith(root+'/')){res.writeHead(403).end();return}if(!(await stat(file)).isFile()){res.writeHead(404).end();return}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.avif':'image/avif'})[extname(file)]??'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.end(await readFile(file))}catch{res.writeHead(404).end('Not found')}})
server.listen(8790,'127.0.0.1',()=>console.log('S2 isolated artwork preview: http://127.0.0.1:8790'))
