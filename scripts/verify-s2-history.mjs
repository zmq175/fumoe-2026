import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

// Read the backup into memory only. Never connect to production or print its data.
const path=process.argv[2]
if(!path)throw new Error('Usage: node scripts/verify-s2-history.mjs <local-sql-backup>')
const db=new DatabaseSync(':memory:')
try {
  db.exec('PRAGMA foreign_keys=OFF')
  db.exec(readFileSync(path,'utf8'))
  db.exec('PRAGMA foreign_keys=ON')
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name)
  const quote=name=>`"${name.replaceAll('"','""')}"`
  const snapshot=()=>Object.fromEntries(tables.map(table=>{
    const rows=db.prepare(`SELECT * FROM ${quote(table)}`).all().map(row=>JSON.stringify(row)).sort()
    return [table,{count:rows.length,digest:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}]
  }))
  const before=snapshot()
  db.exec(readFileSync('migrations/0010_season_daily_windows.sql','utf8'))
  db.exec(readFileSync('migrations/0011_season_artwork_views.sql','utf8'))
  assert.deepEqual(snapshot(),before,'Migration changed existing data')
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
  console.log(JSON.stringify({result:'PASS',existingTables:tables.length,existingRows:Object.values(before).reduce((sum,t)=>sum+t.count,0),unchanged:true,integrity:'ok',storage:'memory-only'}))
} finally {db.close()}
