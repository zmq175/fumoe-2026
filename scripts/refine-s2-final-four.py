import json,pathlib
import cv2,numpy as np
from PIL import Image
root=pathlib.Path('.local/s2-artwork');out=root/'manual-candidates';m=json.loads((root/'manifest.json').read_text());shapes=json.loads((out/'outlines.json').read_text())
# Explicit background openings: hair loops, spaces between limbs and detached props.
holes={126:[[(534,375),(567,376),(591,386),(588,397),(565,389),(546,387)],[(447,596),(465,609),(461,640),(460,663),(443,665),(427,650),(421,618)],[(548,561),(563,581),(581,602),(557,588)]],128:[[(344,276),(357,272),(377,278),(398,282),(411,288),(384,291),(362,287)],[(423,488),(432,515),(442,539),(455,566),(453,532),(441,499)],[(352,433),(374,431),(380,440),(375,450),(355,452)],[(483,395),(493,416),(505,430),(535,441),(539,447),(504,441),(479,429)]],134:[[(360,639),(369,648),(369,661),(361,667)],[(407,402),(417,399),(425,403),(430,415),(424,420)],[(340,700),(348,699),(357,714),(334,720)]],135:[[(394,397),(409,404),(427,406),(442,413),(450,423),(434,421),(414,417),(398,410)],[(369,295),(383,288),(383,303),(377,317),(371,323)],[(480,294),(484,303),(494,311),(500,318),(480,313)]]}
for key,(size,points) in shapes.items():
 i=int(key);e=m['entries'][i];a=np.array(Image.open(root/e['original']).convert('RGBA'));h,w=a.shape[:2];ratio=np.array([w/size,h/size]);poly=np.round(np.array(points)*ratio).astype(np.int32)
 shape=np.zeros((h,w),np.uint8);cv2.fillPoly(shape,[poly],255)
 for hole in holes[i]:cv2.fillPoly(shape,[np.round(np.array(hole)*ratio).astype(np.int32)],0)
 sam=np.array(Image.open(out/f"{e['id']}-sam-0.png"))[:,:,3]
 outer=cv2.dilate(shape,np.ones((21,21),np.uint8))
 alpha=np.minimum(sam,outer); alpha=cv2.morphologyEx(alpha,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
 count,labels,stats,_=cv2.connectedComponentsWithStats((alpha>100).astype(np.uint8))
 for j in range(1,count):
  if stats[j,cv2.CC_STAT_AREA]<120: alpha[labels==j]=0
 count,labels,stats,_=cv2.connectedComponentsWithStats((alpha<100).astype(np.uint8))
 for j in range(1,count):
  if stats[j,cv2.CC_STAT_AREA]<2500: alpha[labels==j]=255
 for hole in holes[i]:cv2.fillPoly(alpha,[np.round(np.array(hole)*ratio).astype(np.int32)],0)
 alpha=cv2.GaussianBlur(alpha,(3,3),0.5);a[:,:,3]=np.minimum(a[:,:,3],alpha)
 Image.fromarray(a).save(out/f"{e['id']}-matte-v3.png");bg=Image.new('RGBA',(w,h),'#142027');bg.alpha_composite(Image.fromarray(a));bg.resize((700,700)).convert('RGB').save(out/f'final-v3-review-{i}.jpg')
