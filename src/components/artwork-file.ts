export function artworkFileFromBlob(blob: Blob, fallbackName: string) {
  return new File([blob], fallbackName, { type: blob.type || 'image/webp' })
}

export function storedArtworkKey(originalKey:string|null,galleryKey:string|null,characterId:string) {
  return originalKey??galleryKey??`characters/${characterId}/gallery.webp`
}
