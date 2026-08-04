CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','live','completed','archived')),
  is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1)),
  starts_at TEXT,
  ends_at TEXT,
  schedule_mode TEXT NOT NULL DEFAULT 'manual' CHECK(schedule_mode IN ('manual','scheduled')),
  roster_locked INTEGER NOT NULL DEFAULT 0 CHECK(roster_locked IN (0,1)),
  history_unlocked INTEGER NOT NULL DEFAULT 0 CHECK(history_unlocked IN (0,1)),
  current_round_id TEXT,
  champion_character_id TEXT REFERENCES characters(id),
  rules_version TEXT NOT NULL DEFAULT '1',
  announcement TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  completed_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS seasons_current_idx ON seasons(is_current) WHERE is_current=1;

CREATE TABLE IF NOT EXISTS season_entries (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  group_code TEXT NOT NULL CHECK(group_code IN ('A','B','C','D','E','F','G','H')),
  seed INTEGER NOT NULL,
  name_snapshot TEXT,
  game_snapshot TEXT,
  summary_snapshot TEXT,
  artwork_original_key_snapshot TEXT,
  artwork_gallery_key_snapshot TEXT,
  artwork_match_key_snapshot TEXT,
  artwork_avatar_key_snapshot TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(season_id, character_id),
  UNIQUE(season_id, seed)
);
CREATE INDEX IF NOT EXISTS season_entries_group_idx ON season_entries(season_id,group_code,seed);

ALTER TABLE tournament_rounds ADD COLUMN season_id TEXT REFERENCES seasons(id);
ALTER TABLE audit_logs ADD COLUMN season_id TEXT REFERENCES seasons(id);
CREATE INDEX IF NOT EXISTS tournament_rounds_season_idx ON tournament_rounds(season_id,starts_at);
CREATE INDEX IF NOT EXISTS audit_logs_season_idx ON audit_logs(season_id,created_at DESC);

INSERT INTO seasons(id,slug,name,status,is_current,starts_at,ends_at,schedule_mode,roster_locked,current_round_id,champion_character_id,announcement,published_at,completed_at)
SELECT 'season-2026','2026-season','府萌 2026',
  CASE (SELECT value FROM settings WHERE key='tournament_status')
    WHEN 'live' THEN 'live' WHEN 'completed' THEN 'completed' WHEN 'published' THEN 'published' ELSE 'draft' END,
  1,MIN(starts_at),MAX(ends_at),
  COALESCE((SELECT value FROM settings WHERE key='schedule_mode'),'manual'),
  CASE COALESCE((SELECT value FROM settings WHERE key='roster_locked'),'false') WHEN 'true' THEN 1 ELSE 0 END,
  NULLIF((SELECT value FROM settings WHERE key='current_round_id'),''),
  NULLIF((SELECT value FROM settings WHERE key='champion_id'),''),
  COALESCE((SELECT value FROM settings WHERE key='announcement'),''),
  CASE WHEN (SELECT value FROM settings WHERE key='tournament_status') IN ('published','live','completed') THEN CURRENT_TIMESTAMP END,
  CASE WHEN (SELECT value FROM settings WHERE key='tournament_status')='completed' THEN CURRENT_TIMESTAMP END
FROM tournament_rounds
WHERE EXISTS(SELECT 1 FROM tournament_rounds);

UPDATE tournament_rounds SET season_id='season-2026' WHERE season_id IS NULL AND EXISTS(SELECT 1 FROM seasons WHERE id='season-2026');

INSERT OR IGNORE INTO season_entries(id,season_id,character_id,group_code,seed,name_snapshot,game_snapshot,summary_snapshot,artwork_original_key_snapshot,artwork_gallery_key_snapshot,artwork_match_key_snapshot,artwork_avatar_key_snapshot)
SELECT 'season-2026-'||c.id,'season-2026',c.id,c.group_code,c.seed,c.name,g.name,c.summary,c.artwork_original_key,c.artwork_gallery_key,c.artwork_match_key,c.artwork_avatar_key
FROM characters c JOIN games g ON g.id=c.game_id
WHERE c.group_code IS NOT NULL AND c.seed IS NOT NULL AND EXISTS(SELECT 1 FROM seasons WHERE id='season-2026');
