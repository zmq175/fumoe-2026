import manifest from '../data/image-variants.json' with {type:'json'}
import logoManifest from '../data/logo-variants.json' with {type:'json'}
import {legacyAsset} from './legacy-assets'

const hashes:Record<string,string>=manifest.hashes
const paths:Record<string,string>=manifest.paths
const logos:Record<string,string>=logoManifest

// Resolve only known content revisions. A newly uploaded or missing revision
// keeps its exact original URL; never borrow another character/season's image.
export function optimizedImageUrl(source:string) {
  const canonical=legacyAsset(source)
  if(logos[canonical])return logos[canonical]
  const id=canonical.match(/^\/archive\/([a-f0-9]{64})\./)?.[1]?.slice(0,20)
    ??source.match(/^\/api\/media\/.+\/([a-f0-9]{20,64})\/[^/]+$/)?.[1]?.slice(0,20)
  const revision=(id?hashes[id]:undefined)??paths[source]
  return revision?`/image-variants/${revision}.webp`:source
}
