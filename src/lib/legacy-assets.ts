import manifest from '../data/legacy-assets.json' with { type:'json' }
const assets:Record<string,string>=manifest
export function legacyAsset(path:string){return assets[path]??path}
export function legacyPortrait(id:string){return assets[`/portraits/${id}.png`]??null}
