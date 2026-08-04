import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('production artwork upload plan', () => {
  it('targets the remote R2 bucket explicitly', async () => {
    const source = await readFile(resolve(import.meta.dirname, 'upload-artwork.mjs'), 'utf8')
    expect(source).toContain('--remote')
  })

  it('uses the characters prefix expected by the runtime media route', async () => {
    const source = await readFile(resolve(import.meta.dirname, 'upload-artwork.mjs'), 'utf8')
    expect(source).toContain('${bucket}/characters/${relative')
  })
})
