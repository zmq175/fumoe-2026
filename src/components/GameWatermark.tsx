import { DisplayImage } from './DisplayImage'
const gameLogoFiles:Record<string,string>={'鸣潮':'wuwa.png','战双帕弥什':'pgr.png','崩坏3':'hi3.png','崩坏：星穹铁道':'hsr.png','原神':'genshin.png','绝区零':'zzz.png','异环':'nte.png','明日方舟：终末地':'endfield.svg'}
export function GameWatermark({game,className='fighter__logo'}:{game:string;className?:string}) { const file=gameLogoFiles[game];return file?<DisplayImage className={className} src={`/game-logos/${file}`} alt="" aria-hidden="true" loading="lazy"/>:null }
