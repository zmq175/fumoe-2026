import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
const root=new URL('../',import.meta.url).pathname,out=root+'.local/s2-artwork/'
const manifest=JSON.parse(await readFile(out+'manifest.json','utf8'))
const records=[]
for(const channel of [703,749]){
 const api=`https://act-api-takumi-static.mihoyo.com/content_v2_user/app/b9d5f96cd69047eb/getContentList?iChanId=${channel}&iPageSize=200&iPage=1&sLangKey=zh-cn&isPreview=0`
 const data=await(await fetch(api,{signal:AbortSignal.timeout(20000)})).json()
 await writeFile(out+'cache/bh3-official-'+channel+'.json',JSON.stringify(data))
 for(const r of data.data.list){const ext=JSON.parse(r.sExt);records.push({character:channel===749?ext.name:r.sCategoryName.replace(/^官网/,''),title:ext.armorName??ext['703_0']??r.sTitle.trim(),url:(channel===749?ext.bigImg:ext['703_3'])?.[0]?.url,release:r.dtStartTime,sourcePage:'https://bh3.mihoyo.com/valkyries',sourceApi:api,officialRecordId:r.iInfoId})}
}
const aliases={'雷电芽衣':'芽衣','无量塔姬子':'姬子','爱衣':'爱衣·休伯利安Λ'}
for(const entry of manifest.entries.filter(e=>e.game==='崩坏3')){
 let candidates=records.filter(r=>r.url&&r.release<'2026-11-05'&&(r.character.includes(entry.name)||r.character===(aliases[entry.name]??entry.name)))
 if(entry.name==='黑希儿')candidates=records.filter(r=>r.title==='魇夜星渊')
 if(entry.name==='识之律者')candidates=records.filter(r=>r.title==='识之律者')
 if(entry.name==='希儿')candidates=candidates.filter(r=>!['魇夜星渊','彼岸双生'].includes(r.title))
 if(entry.name==='符华')candidates=candidates.filter(r=>r.title!=='识之律者')
 if(entry.name==='萝莎莉娅')candidates=candidates.filter(r=>!r.title.includes('狂热蓝调'))
 candidates.sort((a,b)=>b.release.localeCompare(a.release))
 const selected=candidates[0];if(!selected){console.log(entry.name,'missing');continue}
 try{
 const key=entry.id+'-'+createHash('sha256').update(selected.url).digest('hex').slice(0,10);const file=out+'images/'+key+'-original'
 let buffer;try{buffer=await readFile(file)}catch{const res=await fetch(selected.url,{signal:AbortSignal.timeout(30000)});if(!res.ok)throw Error('HTTP '+res.status);buffer=Buffer.from(await res.arrayBuffer());await writeFile(file,buffer)}
 const metadata=await sharp(buffer).metadata()
 await sharp(buffer).resize({width:900,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toFile(out+'images/'+entry.id+'.webp')
 Object.assign(entry,{image:'images/'+entry.id+'.webp',original:'images/'+key+'-original',sourceType:'official',selected,candidates,dimensions:{width:metadata.width,height:metadata.height},sha256:createHash('sha256').update(buffer).digest('hex'),status:'candidate',latestVerified:false,issues:['官方装甲立绘已获取；最新服装仍需与版本公告核对']})
 console.log(entry.name,selected.title)
 }catch(error){entry.issues.push('官方素材下载：'+error.message)}
}
manifest.generatedAt=new Date().toISOString()
await writeFile(out+'manifest.json',JSON.stringify(manifest,null,2));await writeFile(root+'seasons/s2/artwork-inventory.json',JSON.stringify(manifest,null,2))
console.log('images',manifest.entries.filter(e=>e.image).length)
