import {expect, it} from 'vitest'
import {matchFraming} from './s2-match-framing.mjs'

it('reduces face zoom to keep a tall head inside both match viewports', () => {
  const spec = {eyes: [600, 500], faceWidth: 100, headTop: 280}
  for (const width of [960, 540]) {
    const frame = matchFraming(spec, width)
    expect(frame.target[1] - (spec.eyes[1] - spec.headTop) * frame.scale).toBeGreaterThanOrEqual(32)
    expect(frame.target[0]).toBe(width / 2)
    expect(frame.scale).toBeLessThan(1.7)
  }
})

it('keeps the intended face size when the head already fits', () => {
  const frame = matchFraming({eyes: [600, 300], faceWidth: 100, headTop: 200})
  expect(frame.scale).toBe(1.7)
})
