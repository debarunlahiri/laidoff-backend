-- Members can add companies; referrals can link to the company page or the job description.
ALTER TABLE companies ADD COLUMN created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX uq_companies_name_lower ON companies (lower(company_name));
ALTER TABLE referrals ADD COLUMN company_link_url VARCHAR(2048);
ALTER TABLE referrals ADD COLUMN job_description_url VARCHAR(2048);
