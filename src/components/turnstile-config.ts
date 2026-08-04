export function developmentWidgetBypassEnabled(value: string | undefined, hostname: string) {
  return value !== 'false' && ['localhost', '127.0.0.1', '::1'].includes(hostname)
}
