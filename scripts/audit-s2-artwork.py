"""Read-only alpha/face analysis. No image files are rewritten; detections need visual review."""
import json,cv2,numpy as np,sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
base=root/'.local/s2-artwork'
m=json.loads((base/'manifest.json').read_text())
cascade=cv2.CascadeClassifier(sys.argv[1])
if cascade.empty():raise RuntimeError('Face detector model missing')
out=[]
for i,e in enumerate(m['entries']):
 p=base/e['original'];im=cv2.imread(str(p),cv2.IMREAD_UNCHANGED)
 if im is None:out.append({'id':e['id'],'error':'decode failed'});continue
 h,w=im.shape[:2];alpha=im[:,:,3] if im.shape[2]==4 else np.full((h,w),255,dtype=np.uint8)
 a=alpha.astype(np.float32)/255;rgb=im[:,:,:3].astype(np.float32)*a[:,:,None]+240*(1-a[:,:,None]);scale=min(1,1000/max(w,h));small=cv2.resize(rgb.astype(np.uint8),(round(w*scale),round(h*scale)))
 gray=cv2.equalizeHist(cv2.cvtColor(small,cv2.COLOR_BGR2GRAY));faces=cascade.detectMultiScale(gray,scaleFactor=1.07,minNeighbors=4,minSize=(24,24))
 faces=[{'x':round(int(x)/scale),'y':round(int(y)/scale),'width':round(int(fw)/scale),'height':round(int(fh)/scale)}for x,y,fw,fh in faces]
 faces.sort(key=lambda f:f['width']*f['height'],reverse=True)
 out.append({'id':e['id'],'game':e['game'],'name':e['name'],'original':e['original'],'width':w,'height':h,'alphaFraction':round(float(np.mean(alpha==0)),4),'opaque':bool(np.min(alpha)>240),'faces':faces,'alreadyComposed':bool(e.get('processedArtwork')or e.get('aiArtwork'))})
 if(i+1)%32==0:print(i+1,flush=True)
(base/'audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
print(json.dumps({'total':len(out),'opaque':sum(e.get('opaque',False)for e in out),'noFace':sum(not e.get('faces')for e in out),'multipleFaces':sum(len(e.get('faces',[]))>1 for e in out)}))
