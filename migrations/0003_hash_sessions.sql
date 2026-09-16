-- Migration: 0003_hash_sessions.sql
-- Description: Transition session management to hashed tokens (SHA-256) to prevent session hijacking if D1 is exposed

-- Index for searching session records by cryptographic hash
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions(tokenHash);
