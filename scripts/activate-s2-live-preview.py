"""Switch only the isolated local S2 fixture to today's first voting window."""
import datetime as dt
import glob
import json
import sqlite3
from pathlib import Path

config = json.loads(Path('.local/s2-app-preview.json').read_text())
state = Path(config['state']).resolve()
if not str(state).startswith('/tmp/fumoe-s2-preview-') or config.get('productionWritten') is not False:
    raise RuntimeError('Only isolated S2 preview data is allowed')
files = glob.glob(str(state / 'v3/d1/miniflare-D1DatabaseObject/*.sqlite'))
for file in files:
    db = sqlite3.connect(file)
    if db.execute("SELECT count(*) FROM sqlite_master WHERE name='seasons'").fetchone()[0]:
        break
    db.close()
else:
    raise RuntimeError('Preview database not found')
season_id = config['seasonId']
season = db.execute('SELECT starts_at FROM seasons WHERE id=?', (season_id,)).fetchone()
if not season:
    raise RuntimeError('Preview season missing')
backup = state / 'before-live-preview.sqlite'
if not backup.exists():
    with sqlite3.connect(backup) as dest:
        db.backup(dest)
now = dt.datetime.now(dt.timezone.utc)
start = now.astimezone(dt.timezone(dt.timedelta(hours=8))).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(dt.timezone.utc)
old = dt.datetime.fromisoformat(season[0].replace('Z', '+00:00'))
delta = start-old
iso = lambda value: value.isoformat(timespec='milliseconds').replace('+00:00','Z')
rounds = db.execute('SELECT id,starts_at,ends_at FROM tournament_rounds WHERE season_id=? ORDER BY starts_at', (season_id,)).fetchall()
with db:
    for index,(rid,begin,end) in enumerate(rounds):
        db.execute('UPDATE tournament_rounds SET starts_at=?,ends_at=?,status=? WHERE id=?', (iso(dt.datetime.fromisoformat(begin.replace('Z','+00:00'))+delta),iso(dt.datetime.fromisoformat(end.replace('Z','+00:00'))+delta),'live' if index==0 else 'scheduled',rid))
    db.execute("UPDATE seasons SET status='live',name='府萌 S2 · 进行中预览',starts_at=?,ends_at=?,current_round_id=?,roster_locked=1,schedule_mode='manual',announcement='本地进行中演示：票数为模拟数据，不代表正式比赛。' WHERE id=?",(iso(start),iso(start+dt.timedelta(days=30)),rounds[0][0],season_id))
    matches = db.execute('SELECT m.id,w.offset_hours FROM matches m JOIN match_windows w ON w.match_id=m.id WHERE m.round_id=? ORDER BY m.bracket_position', (rounds[0][0],)).fetchall()
    for index,(mid,offset) in enumerate(matches):
        db.execute('UPDATE matches SET status=?,left_votes=?,right_votes=? WHERE id=?',('live' if offset==0 else 'scheduled',42+index*3 if offset==0 else 0,31+index*2 if offset==0 else 0,mid))
print(json.dumps({'localOnly':True,'startsAt':iso(start),'liveMatches':sum(offset==0 for _,offset in matches),'backup':str(backup)}))
db.close()
