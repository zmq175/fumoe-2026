// Preserve existing identifiers while bounding browser-provided metadata.
export const MAX_DEVICE_FINGERPRINT_LENGTH = 4096

export function boundedDeviceFingerprint(parts: readonly (string | number)[]): string {
  return parts.join('|').slice(0, MAX_DEVICE_FINGERPRINT_LENGTH)
}
