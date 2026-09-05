-- Preserve existing season IDs, entries, matches and votes; remove only the A–H constraint.
CREATE TABLE season_entries_configurable (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  group_code TEXT NOT NULL,
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
INSERT INTO season_entries_configurable SELECT * FROM season_entries;
DROP TABLE season_entries;
ALTER TABLE season_entries_configurable RENAME TO season_entries;
CREATE INDEX season_entries_group_idx ON season_entries(season_id,group_code,seed);
ALTER TABLE seasons ADD COLUMN format_json TEXT;
-- NULL means the immutable legacy v1 rules, never the newest default.
CREATE TABLE season_result_snapshots (
  season_id TEXT PRIMARY KEY REFERENCES seasons(id),
  standings_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER seasons_freeze_published_format
BEFORE UPDATE OF format_json,rules_version ON seasons
WHEN OLD.status!='draft' AND (NEW.format_json IS NOT OLD.format_json OR NEW.rules_version!=OLD.rules_version)
BEGIN
  SELECT RAISE(ABORT,'published season rules are frozen');
END;

CREATE TRIGGER seasons_preserve_active_current
BEFORE UPDATE OF is_current ON seasons
WHEN OLD.is_current=1 AND NEW.is_current=0 AND OLD.status IN ('published','live')
BEGIN
  SELECT RAISE(ABORT,'finish the current season before publishing another');
END;

CREATE TRIGGER season_entries_freeze_published_roster
BEFORE UPDATE OF character_id,season_id,group_code,seed ON season_entries
WHEN EXISTS(SELECT 1 FROM seasons WHERE id=OLD.season_id AND status!='draft')
BEGIN
  SELECT RAISE(ABORT,'published season roster is frozen');
END;
