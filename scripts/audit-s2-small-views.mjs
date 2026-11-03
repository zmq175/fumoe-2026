import fs from 'node:fs/promises';
import sharp from 'sharp';
const root='.local/s2-artwork/',m=JSON.parse(await fs.readFile(root+'manifest.json'));
await fs.mkdir(root+'small-view-audit',{recursive:true});
for(let page=0;page<8;page++){
 const layers=[];
 for(let j=0;j<32;j++){
  const i=page*32+j,e=m.entries[i],a=e.processedArtwork,x=j%8*190,y=Math.floor(j/8)*220;
  const label=Buffer.from(`<svg width="190" height="25"><text x="3" y="18" fill="white" font-size="13">${i} ${e.name}</text></svg>`);
  layers.push({input:label,left:x,top:y});
  const avatar=e.portraitArtwork?.avatarImage??a?.avatarImage??e.avatarImage;
  if(avatar)layers.push({input:await sharp(root+avatar).resize(64,64).flatten({background:'#dfeff0'}).png().toBuffer(),left:x+63,top:y+28});
  if(a?.mobileImage)layers.push({input:await sharp(root+a.mobileImage).resize(120,120).flatten({background:'#0c1317'}).png().toBuffer(),left:x+35,top:y+96});
 }
 await sharp({create:{width:1520,height:880,channels:3,background:'#15232b'}}).composite(layers).png().toFile(root+`small-view-audit/page-${page}.png`);
}
console.log('8 sheets: 256 avatars and mobile compositions');
