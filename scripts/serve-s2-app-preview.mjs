import {readFile,cp} from 'node:fs/promises'
import {spawn} from 'node:child_process'
const {state,port}=JSON.parse(await readFile('.local/s2-app-preview.json'))
if(!state.startsWith('/tmp/fumoe-s2-preview-'))throw Error('Only isolated S2 preview state is allowed')
await cp('dist',state+'/site',{recursive:true})
const child=spawn('node_modules/.bin/wrangler',['dev','--local','--assets',state+'/site','--ip','127.0.0.1','--persist-to',state,'--port',String(port),'--var',`APP_ORIGIN:http://127.0.0.1:${port}`,'--var','DEV_AUTH_BYPASS:true','--var','ADMIN_EMAILS:admin@fumoe.local','--var','AUTH_SECRET:s2-preview-secret-at-least-32-characters'],{stdio:'inherit'})
process.on('SIGINT',()=>child.kill('SIGTERM'));process.on('SIGTERM',()=>child.kill('SIGTERM'))
await new Promise(resolve=>child.on('exit',resolve))
