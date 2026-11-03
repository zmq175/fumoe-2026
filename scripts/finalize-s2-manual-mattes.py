import json,pathlib
import numpy as np,cv2
from PIL import Image
root=pathlib.Path('.local/s2-artwork');out=root/'manual-candidates';m=json.loads((root/'manifest.json').read_text())
for i in [126,128,134,135]:
 e=m['entries'][i];a=np.array(Image.open(out/f"{e['id']}-matte-v3.png"));orig=np.array(Image.open(root/e['original']).convert('RGBA'));h,w=a.shape[:2];scale=w/(900 if i==126 else 800)
 if i in [128,134]:
  prior=np.array(Image.open(out/f"{e['id']}-matte-v2.png"));y=int((350 if i==128 else 410)*scale);a[y:,:,3]=prior[y:,:,3]
 if i==135:
  mask=np.zeros((h,w),np.uint8);cv2.circle(mask,(round(320*scale),round(205*scale)),round(13*scale),255,-1);a[:,:,3]=np.maximum(a[:,:,3],np.minimum(mask,orig[:,:,3]))
 # Preserve original RGB exactly; alpha alone is edited.
 a[:,:,:3]=orig[:,:,:3]
 Image.fromarray(a).save(out/f"{e['id']}-matte-v4.png")
