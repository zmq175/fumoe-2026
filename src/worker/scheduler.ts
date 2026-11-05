import { runScheduledLifecycle } from './lifecycle'
import type { Env } from './types'

// scheduledTime describes dispatch intent, not the current voting window.
// Delayed delivery must catch up using server time, including lease expiry.
export async function runScheduledTick(env: Pick<Env,'DB'>, scheduledTime:number) {
  const startedAt=Date.now()
  const timing={event:'tournament_scheduler',scheduledAt:new Date(scheduledTime).toISOString(),startedAt:new Date(startedAt).toISOString(),dispatchDelayMs:Math.max(0,startedAt-scheduledTime)}
  try {
    const result=await runScheduledLifecycle(env,new Date(startedAt))
    if('failed' in result&&result.failed)throw new Error('自动开赛失败，请检查 round_auto_start_skipped 审计记录')
    const record={...timing,durationMs:Date.now()-startedAt,outcome:result.locked?'locked':'ok',...result}
    if(result.locked||timing.dispatchDelayMs>=60_000)console.warn(record)
    else console.info(record)
    return result
  } catch(error) {
    console.error({...timing,durationMs:Date.now()-startedAt,outcome:'failed',error:error instanceof Error?error.message:String(error)})
    // Reject waitUntil so Cloudflare records a failed scheduled invocation.
    // The next minute's tick retries through the same lifecycle lease.
    throw error
  }
}
