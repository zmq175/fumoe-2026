// Fixed labels keep URLs, query strings, account identifiers and vote choices out of telemetry.
export const metricNames = ['white_screen', 'home_visible', 'vote_page_visible', 'image_eager', 'image_lazy', 'page_load', 'dns', 'connect', 'request_wait', 'download', 'standings_visible', 'vote_feedback', 'overview', 'seasons', 'matches', 'rounds', 'standings', 'characters', 'votes', 'my_votes', 'viewer'] as const
export type MetricName = typeof metricNames[number]
export type PerfSample = { name: MetricName; ms: number; status: number; serverMs?: number }
