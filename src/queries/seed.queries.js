export const seedQueries = {
  createCompany: "INSERT IGNORE INTO companies(id,company_name) VALUES(?,?)",
  listCompanies: "SELECT id,company_name AS name FROM companies",
  createUser:
    "INSERT IGNORE INTO users(id,email,password_hash,full_name,professional_headline,professional_skills,open_to_work) VALUES(?,?,?,?,?,?,?)",
  findUserByEmail: "SELECT id FROM users WHERE email=?",
  findSeedPost: "SELECT id FROM posts WHERE user_id=? AND post_content=?",
  createPost:
    "INSERT INTO posts(id,user_id,post_content,post_topic,company_id) VALUES(?,?,?,?,?)",
  findSeedReferral: "SELECT id FROM referrals WHERE user_id=? AND job_title=?",
  createReferral:
    "INSERT INTO referrals(id,user_id,company_id,job_title,job_location,work_mode,experience_level,min_experience_years,required_skills,job_description) VALUES(?,?,?,?,?,?,?,?,?,?)",
};
