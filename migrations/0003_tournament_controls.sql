ALTER TABLE characters ADD COLUMN artwork_source_type TEXT NOT NULL DEFAULT 'pending' CHECK(artwork_source_type IN ('official','community-wiki','pending'));
ALTER TABLE characters ADD COLUMN artwork_quality_status TEXT NOT NULL DEFAULT 'pending' CHECK(artwork_quality_status IN ('pending','verified','rejected'));
INSERT OR IGNORE INTO settings(key,value) VALUES
 ('tournament_status','draft'),
 ('roster_locked','false'),
 ('schedule_mode','manual'),
 ('scheduled_start_at',''),
 ('current_round_id',''),
 ('champion_id',''),
 ('announcement','');
