-- When the user acknowledged the site-wide disclaimer, so it no longer fills the footer.
ALTER TABLE users ADD COLUMN disclaimer_ack_at INTEGER;
