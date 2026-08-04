import type { Page } from '@playwright/test'
import type { PublicMatch, PublicRound, PublicSeason, PublicStanding, Viewer } from '../src/lib/api'

export const now = '2030-08-01T12:00:00.000Z'
export const later = '2030-08-02T12:00:00.000Z'

export const rounds: PublicRound[] = [
  { id: 'swiss-1', stage: 'swiss', roundNumber: 1, name: '瑞士轮 第 1 轮', status: 'live', startsAt: now, endsAt: later },
  { id: 'swiss-2', stage: 'swiss', roundNumber: 2, name: '瑞士轮 2', status: 'scheduled', startsAt: '2030-08-02T12:00:00.000Z', endsAt: '2030-08-03T12:00:00.000Z' },
  { id: 'swiss-3', stage: 'swiss', roundNumber: 3, name: '瑞士轮 3', status: 'scheduled', startsAt: '2030-08-03T12:00:00.000Z', endsAt: '2030-08-04T12:00:00.000Z' },
  { id: 'knockout-1', stage: 'knockout', roundNumber: 1, name: '16 强', status: 'scheduled', startsAt: '2030-08-04T12:00:00.000Z', endsAt: '2030-08-05T12:00:00.000Z' },
  { id: 'knockout-2', stage: 'knockout', roundNumber: 2, name: '8 强', status: 'scheduled', startsAt: '2030-08-05T12:00:00.000Z', endsAt: '2030-08-06T12:00:00.000Z' }
]

export const matches: PublicMatch[] = [
  { id: 'swiss-match', roundId: 'swiss-1', stage: 'swiss', roundNumber: 1, roundName: '瑞士轮 第 1 轮', groupCode: 'A', bracketPosition: 1, leftVotes: 42, rightVotes: 31, status: 'live', winnerCharacterId: null, startsAt: now, endsAt: later, leftId: 'c001', leftName: '芙宁娜', leftGame: '原神', rightId: 'c002', rightName: '流萤', rightGame: '崩坏：星穹铁道' },
  { id: 'swiss-match-2', roundId: 'swiss-1', stage: 'swiss', roundNumber: 1, roundName: '瑞士轮 第 1 轮', groupCode: 'A', bracketPosition: 2, leftVotes: 20, rightVotes: 18, status: 'live', winnerCharacterId: null, startsAt: now, endsAt: later, leftId: 'c003', leftName: '胡桃', leftGame: '原神', rightId: 'c004', rightName: '纳西妲', rightGame: '原神' },
  { id: 'knockout-match', roundId: 'knockout-1', stage: 'knockout', roundNumber: 1, roundName: '16 强', groupCode: null, bracketPosition: 1, leftVotes: 98, rightVotes: 76, status: 'closed', winnerCharacterId: 'c001', startsAt: '2030-08-04T12:00:00.000Z', endsAt: '2030-08-05T12:00:00.000Z', leftId: 'c001', leftName: '芙宁娜', leftGame: '原神', rightId: 'c002', rightName: '流萤', rightGame: '崩坏：星穹铁道' }
]

export const standings: PublicStanding[] = [
  { groupCode: 'A', id: 'c001', name: '芙宁娜', game: '原神', seed: 1, points: 3, opponentPoints: 0, voteDifference: 11 },
  { groupCode: 'A', id: 'c002', name: '流萤', game: '崩坏：星穹铁道', seed: 2, points: 0, opponentPoints: 3, voteDifference: -11 }
]

export const currentSeason:PublicSeason={id:'season-2030',slug:'2030-season',name:'府萌 2030',status:'live',isCurrent:true,startsAt:now,endsAt:'2030-08-08T12:00:00.000Z',championCharacterId:null,announcement:'当季公告',historyUnlocked:false}

type HistoricalFixture={season:PublicSeason;rounds:PublicRound[];matches:PublicMatch[];standings:PublicStanding[]}

export async function mockPublicApi(page: Page, data: { rounds?: PublicRound[]; matches?: PublicMatch[]; standings?: PublicStanding[]; season?:PublicSeason; seasons?:PublicSeason[]; previousSeason?:PublicSeason|null; viewer?:Viewer|null; historical?:Record<string,HistoricalFixture> } = {}) {
  const fixtureRounds = data.rounds ?? rounds
  const fixtureMatches = data.matches ?? matches
  const fixtureStandings = data.standings ?? standings
  const fixtureSeason = data.season ?? currentSeason
  const fixtureSeasons = data.seasons ?? [fixtureSeason]
  let viewer: Viewer | null = data.viewer ?? null
  const voterSelections=new Map<string,{matchId:string;characterId:string;riskStatus:'approved';createdAt:string}>()

  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async (route) => {
    await route.fulfill({ contentType: 'application/javascript', body: `window.__turnstileActions=[];window.turnstile={render:(container,options)=>{window.__turnstileActions.push(options.action);container.textContent='人机验证已完成';queueMicrotask(()=>options.callback('e2e-turnstile-token'));return 'e2e-widget'},reset:()=>{},remove:()=>{}}` })
  })

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const historical = url.searchParams.get('season') ? data.historical?.[url.searchParams.get('season')!] : path.startsWith('/api/public/seasons/') ? data.historical?.[path.split('/').at(-1)!] : undefined
    const input = (route.request().postDataJSON() ?? {}) as { email?: string; turnstileToken?: string;choices?:Array<{matchId:string;characterId:string}> }
    const body = path === '/api/auth/me' ? { user: viewer }
      : path === '/api/auth/request-code' ? { ok: true, expiresInSeconds: 600, developmentCode: '123456' }
        : path === '/api/auth/verify-code' ? (() => { viewer = { email: input.email ?? 'voter@example.com', role: 'voter' }; return { ok: true, user: viewer } })()
          : path === '/api/votes/mine' ? { votes:[...voterSelections.values()] }
            : path === '/api/votes' ? (()=>{const votes=(input.choices??[]).map(({matchId,characterId})=>{const selection={matchId,characterId,riskStatus:'approved' as const,createdAt:now};voterSelections.set(matchId,selection);const source=fixtureMatches.find((match)=>match.id===matchId);return{status:'counted' as const,selection,scores:{leftVotes:(source?.leftVotes??0)+(source?.leftId===characterId?1:0),rightVotes:(source?.rightVotes??0)+(source?.rightId===characterId?1:0)}}});return{ok:true,votes}})()
              : path === '/api/admin/dashboard' ? { pendingVotes:0,activeMatches:1 }
              : path === '/api/admin/tournament' ? { season:fixtureSeason,settings:{tournament_status:fixtureSeason.status,roster_locked:'true',schedule_mode:'scheduled',announcement:fixtureSeason.announcement},rounds:fixtureRounds,artwork:[{status:'verified',count:128}] }
                : path === '/api/admin/matches' ? { matches:[] }
                  : path === '/api/admin/risk/votes' ? { votes:[] }
                    : path === '/api/admin/characters' ? { characters:[] }
                      : path === '/api/public/characters' ? { characters:[] }
                        : path === '/api/admin/seasons' && route.request().method()==='GET' ? { seasons:fixtureSeasons }
                        : path === '/api/admin/seasons' && route.request().method()==='POST' ? { ok:true,seasonId:'season-2031',slug:'2031-season' }
                          : path.match(/^\/api\/admin\/seasons\/[^/]+\/entries$/) ? { entries:[] }
            : path === '/api/public/overview' ? { season:fixtureSeason, previousSeason:data.previousSeason??null, round:fixtureRounds.find((round)=>round.status==='live')??null, matches:fixtureMatches.filter((match)=>match.status==='live'), siteAnnouncement:'自动化测试公告', seasonAnnouncement:fixtureSeason.announcement }
              : path === '/api/public/seasons' ? { seasons:fixtureSeasons }
                : path.startsWith('/api/public/seasons/') ? { season:historical?.season??fixtureSeasons.find((season)=>season.slug===path.split('/').at(-1))??fixtureSeason }
                  : path === '/api/public/matches' ? { matches:historical?.matches??fixtureMatches }
                    : path === '/api/public/rounds' ? { rounds:historical?.rounds??fixtureRounds }
                      : path === '/api/public/standings' ? { standings:historical?.standings??(voterSelections.size?fixtureStandings.map((row)=>row.id==='c001'?{...row,points:3,voteDifference:12}:row):fixtureStandings) }
                        : { error:`Unexpected API request: ${path}` }
    await route.fulfill({ status: 'error' in body ? 404 : 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}
