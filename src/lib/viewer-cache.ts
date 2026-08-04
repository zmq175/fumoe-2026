import type { Viewer } from './api'

const key='fumoe_viewer'
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>

export function readCachedViewer(storage:StorageLike):Viewer|null {
  try {
    const value=storage.getItem(key)
    if(!value)return null
    const parsed=JSON.parse(value) as Partial<Viewer>
    return typeof parsed.email==='string'&&['voter','operator','admin'].includes(parsed.role??'')?parsed as Viewer:null
  } catch{return null}
}

export function writeCachedViewer(storage:StorageLike,viewer:Viewer|null) {
  if(viewer)storage.setItem(key,JSON.stringify(viewer))
  else storage.removeItem(key)
}
