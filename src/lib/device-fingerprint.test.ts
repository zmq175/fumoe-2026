import { describe, expect, it } from 'vitest'
import { boundedDeviceFingerprint, MAX_DEVICE_FINGERPRINT_LENGTH } from './device-fingerprint'

describe('browser fingerprint compatibility', () => {
  it('preserves previously accepted identifiers', () => {
    expect(boundedDeviceFingerprint(['Browser', 'zh-CN', 393, 873, 'Asia/Shanghai']))
      .toBe('Browser|zh-CN|393|873|Asia/Shanghai')
  })
  it('bounds unusually long browser metadata', () => {
    expect(boundedDeviceFingerprint(['x'.repeat(5000), 'zh-CN']).length)
      .toBe(MAX_DEVICE_FINGERPRINT_LENGTH)
  })
})
