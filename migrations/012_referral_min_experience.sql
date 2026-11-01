-- Minimum years of experience for referrals, backfilled from the existing skills text.
ALTER TABLE referrals
    ADD COLUMN min_experience_years TINYINT UNSIGNED NULL AFTER experience_level;

UPDATE referrals
SET min_experience_years = CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(required_skills, '[0-9]+[+]? *years'), '[0-9]+') AS UNSIGNED)
WHERE required_skills REGEXP '[0-9]+[+]? *years';

UPDATE referrals
SET required_skills = TRIM(SUBSTRING_INDEX(required_skills, ' · ', 1))
WHERE required_skills LIKE '% · %';
