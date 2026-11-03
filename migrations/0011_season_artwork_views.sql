-- Additional season-scoped views. Existing historical keys remain untouched.
ALTER TABLE season_character_profiles ADD COLUMN mobile_key TEXT;
ALTER TABLE season_character_profiles ADD COLUMN detail_key TEXT;
