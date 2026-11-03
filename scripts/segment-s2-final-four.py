import json,pathlib,os
import torch,cv2,numpy as np
from PIL import Image
from segment_anything import sam_model_registry,SamPredictor
torch.set_num_threads(4)
root=pathlib.Path('.local/s2-artwork');m=json.loads((root/'manifest.json').read_text());out=root/'manual-candidates'
model=sam_model_registry['vit_b'](checkpoint='/tmp/s2-sam-vit-b.pth');predictor=SamPredictor(model)
# Coordinates normalized to 900 for Ruan Mei and 800 for the remaining originals.
seeds={126:(900,[315,275,710,830],[[475,330],[467,440],[486,551],[496,632],[482,785],[379,420],[576,533],[397,685]],[[561,331],[574,452],[407,329],[354,510],[450,622],[579,710],[534,744],[460,688]]),128:(800,[245,175,595,640],[[421,328],[417,393],[404,462],[446,475],[413,545],[479,604],[342,243],[459,296]],[[350,338],[481,317],[448,554],[501,486],[308,328],[457,233],[358,283],[391,520]]),134:(800,[230,350,480,715],[[372,385],[374,435],[353,477],[374,527],[355,590],[344,682],[387,684],[286,415],[282,550],[440,555]],[[323,360],[427,366],[463,480],[389,712],[308,485],[415,698],[355,644]]),135:(800,[290,125,645,585],[[439,189],[431,271],[409,326],[460,354],[501,391],[545,520],[613,469],[332,273],[312,233]],[[371,186],[483,144],[484,266],[373,335],[442,435],[533,344],[572,453],[463,492],[413,413]])}
seeds[126][2].extend([[621,674],[409,699],[354,585],[594,513],[611,388]])
seeds[128][2].extend([[550,456],[477,419],[352,457],[477,575],[368,382],[398,353]])
seeds[134][2].extend([[438,615],[278,606],[351,690],[389,686],[458,519],[426,483],[281,465]])
seeds[135][2].extend([[416,398],[464,403],[512,414],[484,290]])
for i,(size,box,pos,neg) in seeds.items():
 e=m['entries'][i];im=np.array(Image.open(root/e['original']).convert('RGBA'));h,w=im.shape[:2]
 cache=out/f'embedding-{i}.pt'
 rgb=(im[:,:,:3].astype(float)*(im[:,:,3:4]/255)+24*(1-im[:,:,3:4]/255)).astype(np.uint8)
 if cache.exists():
  data=torch.load(cache,weights_only=False);predictor.features=data['features'];predictor.original_size=data['original_size'];predictor.input_size=data['input_size'];predictor.is_image_set=True
 else:
  predictor.set_image(rgb);torch.save({'features':predictor.features,'original_size':predictor.original_size,'input_size':predictor.input_size},cache)
 coords=np.array(pos+neg)*[w/size,h/size];labels=np.array([1]*len(pos)+[0]*len(neg));bounds=np.array(box)*[w/size,h/size,w/size,h/size]
 masks,scores,logits=predictor.predict(point_coords=coords,point_labels=labels,box=bounds,multimask_output=True)
 for j,mask in enumerate(masks):
  a=im.copy();a[:,:,3]=np.minimum(a[:,:,3],mask.astype(np.uint8)*255);Image.fromarray(a).save(out/f"{e['id']}-sam-{j}.png")
  bg=Image.new('RGBA',(w,h),'#142027');bg.alpha_composite(Image.fromarray(a));bg.resize((700,700)).convert('RGB').save(out/f'sam-v2-review-{i}-{j}.jpg')
 print(i,scores.tolist(),flush=True)
(out/'sam-seeds.json').write_text(json.dumps(seeds,ensure_ascii=False,indent=2))
