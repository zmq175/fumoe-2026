export function artworkKeys(characterId:string,revision:string,originalExtension:'png'|'jpg'|'webp') {
  const prefix=`characters/${characterId}/${revision}`
  return {
    original:`${prefix}/original.${originalExtension}`,
    gallery:`${prefix}/gallery.webp`,
    match:`${prefix}/match.webp`,
    avatar:`${prefix}/avatar.webp`
  }
}

export function isUnfinishedSeason(status:string) {
  return ['draft','published','live'].includes(status)
}

export function mediaFallbackIsImage(contentType:string|null) {
  return contentType?.toLowerCase().startsWith('image/')??false
}

export function artworkCacheControl() {
  return 'public, max-age=86400, stale-while-revalidate=604800'
}
