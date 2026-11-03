-- Additive only: preserve every legacy match, entry, vote and snapshot byte for byte.
CREATE TABLE match_windows (
  match_id TEXT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  offset_hours INTEGER NOT NULL CHECK(offset_hours>=0),
  duration_hours INTEGER NOT NULL CHECK(duration_hours>0)
);
CREATE TRIGGER matches_create_daily_window AFTER INSERT ON matches
WHEN EXISTS(SELECT 1 FROM tournament_rounds r JOIN seasons s ON s.id=r.season_id WHERE r.id=NEW.round_id AND s.rules_version='3')
BEGIN
  INSERT INTO match_windows(match_id,offset_hours,duration_hours)
  SELECT NEW.id,CAST(b.key AS INTEGER)*24,COALESCE(json_extract(p.plan,'$.matchDurationHours'),24)
  FROM (
    SELECT json_extract(s.format_json,'$.rounds['||(CASE WHEN r.stage='swiss' THEN r.round_number-1 ELSE CASE WHEN json_extract(s.format_json,'$.mode')='knockout' THEN 0 ELSE json_extract(s.format_json,'$.swissRounds') END+r.round_number-1 END)||']') AS plan
    FROM tournament_rounds r JOIN seasons s ON s.id=r.season_id WHERE r.id=NEW.round_id
  ) p, json_each(p.plan,'$.batches') b
  WHERE NEW.bracket_position>COALESCE((SELECT SUM(value) FROM json_each(p.plan,'$.batches') WHERE CAST(key AS INTEGER)<CAST(b.key AS INTEGER)),0)
    AND NEW.bracket_position<=(SELECT SUM(value) FROM json_each(p.plan,'$.batches') WHERE CAST(key AS INTEGER)<=CAST(b.key AS INTEGER));
END;
CREATE TABLE season_character_profiles (
  season_id TEXT NOT NULL REFERENCES seasons(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  skin_name TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  source_note TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'pending',
  verified INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(season_id,character_id)
);
-- Recheck the window at insertion, so a request crossing midnight cannot count late.
CREATE TRIGGER votes_guard_daily_window BEFORE INSERT ON votes
WHEN EXISTS(SELECT 1 FROM match_windows WHERE match_id=NEW.match_id)
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM matches m JOIN match_windows w ON w.match_id=m.id
    JOIN tournament_rounds r ON r.id=m.round_id JOIN seasons s ON s.id=r.season_id
    WHERE m.id=NEW.match_id AND m.status='live' AND r.status='live' AND s.status='live' AND s.is_current=1
      AND julianday('now')>=julianday(r.starts_at)+w.offset_hours/24.0
      AND julianday('now')<julianday(r.starts_at)+(w.offset_hours+w.duration_hours)/24.0
  ) THEN RAISE(ABORT,'daily vote window closed') END;
END;
CREATE TRIGGER season_profiles_freeze_update BEFORE UPDATE ON season_character_profiles
WHEN EXISTS(SELECT 1 FROM seasons WHERE id IN (OLD.season_id,NEW.season_id) AND (status IN ('live','completed','archived') OR current_round_id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'season artwork is frozen'); END;
CREATE TRIGGER season_profiles_freeze_delete BEFORE DELETE ON season_character_profiles
WHEN EXISTS(SELECT 1 FROM seasons WHERE id=OLD.season_id AND (status IN ('live','completed','archived') OR current_round_id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'season artwork is frozen'); END;
CREATE TRIGGER season_profiles_freeze_insert BEFORE INSERT ON season_character_profiles
WHEN EXISTS(SELECT 1 FROM seasons WHERE id=NEW.season_id AND (status IN ('live','completed','archived') OR current_round_id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'season artwork is frozen'); END;
CREATE TRIGGER season_entries_freeze_v3_artwork BEFORE UPDATE OF summary_snapshot,artwork_original_key_snapshot,artwork_gallery_key_snapshot,artwork_match_key_snapshot,artwork_avatar_key_snapshot ON season_entries
WHEN EXISTS(SELECT 1 FROM seasons WHERE id=OLD.season_id AND rules_version='3' AND (status IN ('live','completed','archived') OR current_round_id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'season artwork is frozen'); END;
