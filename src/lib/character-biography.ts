import catalog from '../../seasons/s2/character-bios.json'

// Never substitute current editorial copy for a season's frozen summary.
// A citation is valid only when both identity and the stored text match.
export function biographySource(character: {id: string; game: string; name: string; summary: string}) {
  return catalog.entries.find(entry => entry.id === character.id && entry.game === character.game && entry.name === character.name && entry.summary === character.summary)?.sourceUrl
}
