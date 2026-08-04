import type { Character } from '../data/tournament'

export type ArtworkVariant='gallery'|'match'|'avatar'
export type ArtworkKeys={galleryArtworkKey?:string|null;matchArtworkKey?:string|null;avatarArtworkKey?:string|null}

export function artworkKey(character:Character,variant:ArtworkVariant) {
  const runtimeKey=variant==='gallery'?character.galleryArtworkKey:variant==='match'?character.matchArtworkKey:character.avatarArtworkKey
  return runtimeKey??character.officialArtworkKey.replace('gallery',variant)
}

export function artworkUrls(key:string) {
  const parts=key.split('/')
  const characterId=parts[1]
  const file=parts.at(-1)
  const fallback=`/artwork/${characterId}/${file}`
  return parts.length===3?[fallback]:[`/api/media/${key}`,fallback]
}

export function withArtworkKeys(character:Character,keys:ArtworkKeys):Character {
  return {...character,...keys}
}
