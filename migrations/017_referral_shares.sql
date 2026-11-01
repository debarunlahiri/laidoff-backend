CREATE TABLE referral_shares (
  referral_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY(referral_id,user_id),
  INDEX(referral_id,created_at),
  FOREIGN KEY(referral_id) REFERENCES referrals(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
