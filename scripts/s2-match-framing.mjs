// Face scale is a preference; the visible head's top margin is a constraint.
export function matchFraming(spec, width = 960) {
  const eyeY = spec.matchEyeY ?? 255
  const headTop = spec.headTop ?? spec.eyes[1] - spec.faceWidth * 1.6
  const headHeight = Math.max(1, spec.eyes[1] - headTop)
  const scale = Math.min((spec.matchFaceWidth ?? 170) / spec.faceWidth, (eyeY - 32) / headHeight)
  return {width, height: 540, scale, anchor: spec.eyes, target: [width / 2, eyeY]}
}
