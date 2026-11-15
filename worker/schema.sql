-- Raf hub (shared Telegram bot). Secrets are stored only as SHA-256 hashes; messages are deleted once the browser picks them up.
CREATE TABLE IF NOT EXISTS pending (code TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS users (secret_hash TEXT PRIMARY KEY, chat_id INTEGER NOT NULL, name TEXT, created INTEGER NOT NULL, seen INTEGER NOT NULL, day TEXT, sent INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS users_chat ON users (chat_id);
CREATE TABLE IF NOT EXISTS inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, secret_hash TEXT NOT NULL, chat_id INTEGER NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS inbox_user ON inbox (secret_hash, id);
