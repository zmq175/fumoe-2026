import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = await readFile(resolve(root, 'src/data/tournament.ts'), 'utf8')
const entries = [...source.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)].map(([, name, game, summary], index) => ({ id: `c${String(index + 1).padStart(3, '0')}`, name, game, summary, seed: index + 1, group: String.fromCharCode(65 + index % 8) }))
const esc = (value) => `'${String(value).replaceAll("'", "''")}'`
const gameNames = [...new Set(entries.map((entry) => entry.game))]
const gameId = new Map(gameNames.map((name, index) => [name, `g${String(index + 1).padStart(2, '0')}`]))
const now = new Date(); const before = new Date(now.getTime() - 60 * 60_000).toISOString(); const tomorrow = new Date(now.getTime() + 23 * 60 * 60_000).toISOString()
const lines = [
  'PRAGMA foreign_keys = OFF;',
  'DELETE FROM audit_logs;', 'DELETE FROM risk_events;', 'DELETE FROM votes;', 'DELETE FROM matches;', 'DELETE FROM tournament_rounds;', 'DELETE FROM season_entries;', 'DELETE FROM seasons;', 'DELETE FROM characters;', 'DELETE FROM games;', 'DELETE FROM auth_challenges;', 'DELETE FROM users;',
  `INSERT INTO users(id,email,role,status) VALUES ('u-admin','admin@fumoe.local','admin','active'),('u-operator','operator@fumoe.local','operator','active'),('u-voter','voter@fumoe.local','voter','active');`
]
for (const [index, game] of gameNames.entries()) lines.push(`INSERT INTO games(id,name,sort_order,is_active) VALUES (${esc(gameId.get(game))},${esc(game)},${index + 1},1);`)
for (const entry of entries) lines.push(`INSERT INTO characters(id,game_id,name,summary,group_code,seed,artwork_key,status) VALUES (${esc(entry.id)},${esc(gameId.get(entry.game))},${esc(entry.name)},${esc(entry.summary)},${esc(entry.group)},${entry.seed},${esc(`characters/${entry.id}/gallery.webp`)},'published');`)
lines.push(`INSERT INTO seasons(id,slug,name,status,is_current,starts_at,ends_at,schedule_mode,roster_locked,current_round_id,published_at) VALUES ('season-2026','2026-season','府萌 2026','live',1,${esc(before)},${esc(new Date(now.getTime()+7*86_400_000).toISOString())},'scheduled',1,'swiss-1',CURRENT_TIMESTAMP);`)
for (const entry of entries) lines.push(`INSERT INTO season_entries(id,season_id,character_id,group_code,seed,name_snapshot,game_snapshot,summary_snapshot,artwork_gallery_key_snapshot,artwork_match_key_snapshot,artwork_avatar_key_snapshot) VALUES (${esc(`season-2026-${entry.id}`)},'season-2026',${esc(entry.id)},${esc(entry.group)},${entry.seed},${esc(entry.name)},${esc(entry.game)},${esc(entry.summary)},${esc(`characters/${entry.id}/gallery.webp`)},${esc(`characters/${entry.id}/match.webp`)},${esc(`characters/${entry.id}/avatar.webp`)});`)
for (let round = 1; round <= 3; round++) lines.push(`INSERT INTO tournament_rounds(id,stage,round_number,name,starts_at,ends_at,status,season_id) VALUES ('swiss-${round}','swiss',${round},'瑞士轮 ${round}',${esc(round === 1 ? before : new Date(now.getTime() + (round - 1) * 86_400_000).toISOString())},${esc(round === 1 ? tomorrow : new Date(now.getTime() + round * 86_400_000).toISOString())},${esc(round === 1 ? 'live' : 'scheduled')},'season-2026');`)
for (const [index, name] of ['16 强','8 强','半决赛','决赛'].entries()) { const day = index + 3; lines.push(`INSERT INTO tournament_rounds(id,stage,round_number,name,starts_at,ends_at,status,season_id) VALUES ('ko-${index + 1}','knockout',${index + 1},${esc(name)},${esc(new Date(now.getTime() + day * 86_400_000).toISOString())},${esc(new Date(now.getTime() + (day + 1) * 86_400_000).toISOString())},'scheduled','season-2026');`) }
let matchIndex = 0
for (const group of 'ABCDEFGH') {
  const groupEntries = entries.filter((entry) => entry.group === group).sort((left, right) => left.seed - right.seed)
  for (let index = 0; index < 8; index++) {
    const left = groupEntries[index]
    const right = groupEntries[15 - index]
    const matchId = `m-r1-${String(matchIndex + 1).padStart(2, '0')}`
    const leftVotes = matchIndex < 16 ? 860 + matchIndex * 9 : 0
    const rightVotes = matchIndex < 16 ? 790 + matchIndex * 7 : 0
    lines.push(`INSERT INTO matches(id,round_id,group_code,bracket_position,left_character_id,right_character_id,left_votes,right_votes,status) VALUES (${esc(matchId)},'swiss-1',${esc(group)},${index + 1},${esc(left.id)},${esc(right.id)},${leftVotes},${rightVotes},'live');`)
    matchIndex++
  }
}
lines.push('PRAGMA foreign_keys = ON;')
const directory = resolve(root, '.local'); await mkdir(directory, { recursive: true })
const file = resolve(directory, 'seed.sql'); await writeFile(file, `${lines.join('\n')}\n`)
const persistTo = process.argv.includes('--persist-to') ? process.argv[process.argv.indexOf('--persist-to') + 1] : null
const args = ['wrangler', 'd1', 'execute', 'fumoe-2026', '--local', '--file', file]
if (persistTo) args.push('--persist-to', persistTo)
execFileSync('npx', args, { cwd: root, stdio: 'inherit' })
console.log(`已导入 ${entries.length} 位角色、64 场首轮对局与三种本地测试身份。`)
