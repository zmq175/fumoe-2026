import type { Character } from '../data/tournament'
import { legacyAsset, legacyPortrait } from './legacy-assets'

export type ArtworkVariant='gallery'|'match'|'avatar'
export type ArtworkKeys={galleryArtworkKey?:string|null;matchArtworkKey?:string|null;avatarArtworkKey?:string|null}

export function artworkKey(character:Character,variant:ArtworkVariant) {
  const runtimeKey=variant==='gallery'?character.galleryArtworkKey:variant==='match'?character.matchArtworkKey:character.avatarArtworkKey
  return runtimeKey??character.officialArtworkKey.replace('gallery',variant)
}

export function artworkUrls(key:string) {
  if(key.startsWith('/'))return [legacyAsset(key)]
  const parts=key.split('/')
  const characterId=parts[1]
  const file=parts.at(-1)
  const fallback=`/artwork/${characterId}/${file}`
  return parts.length===3?[legacyAsset(fallback)]:[`/api/media/${key}`]
}

export function portraitArtworkUrls(characterId:string,avatarKey:string|null|undefined) {
  if(avatarKey)return artworkUrls(avatarKey)
  const legacy=legacyPortrait(characterId)
  return legacy?[legacy]:[]
}

export function withArtworkKeys(character:Character,keys:ArtworkKeys):Character {
  return {...character,...keys}
}
