CREATE TABLE IF NOT EXISTS tournament_lifecycle_leases (
  season_id TEXT PRIMARY KEY REFERENCES seasons(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS votes_require_live_match
BEFORE INSERT ON votes
FOR EACH ROW
WHEN COALESCE((SELECT status FROM matches WHERE id=NEW.match_id),'missing')!='live'
BEGIN
  SELECT RAISE(ABORT,'match is not live');
END;
