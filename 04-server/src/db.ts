import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'

mkdirSync('data', { recursive: true })

const db = new Database('data/reportassist.db', { create: true })
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'user',
    status        TEXT    NOT NULL DEFAULT 'pending',
    weekly_limit  INTEGER NOT NULL DEFAULT -1,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
    experiment_number TEXT    NOT NULL DEFAULT '',
    experiment_title  TEXT    NOT NULL DEFAULT '',
    input_tokens      INTEGER NOT NULL DEFAULT 0,
    output_tokens     INTEGER NOT NULL DEFAULT 0,
    input_json        TEXT    NOT NULL DEFAULT '',
    report_json       TEXT    NOT NULL DEFAULT ''
  );
`)

// Migrations for existing databases
const migrations = [
  "ALTER TABLE users ADD COLUMN weekly_limit INTEGER NOT NULL DEFAULT -1",
  "ALTER TABLE usage_logs ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE usage_logs ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE usage_logs ADD COLUMN input_json TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE usage_logs ADD COLUMN report_json TEXT NOT NULL DEFAULT ''",
]
for (const sql of migrations) {
  try { db.exec(sql) } catch { /* column already exists */ }
}

// Seed admin from env on first start
const adminUsername = process.env.ADMIN_USERNAME
const adminPassword = process.env.ADMIN_PASSWORD
if (adminUsername && adminPassword) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername)
  if (!existing) {
    const hash = await Bun.password.hash(adminPassword)
    db.prepare(
      "INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, 'admin', 'approved')"
    ).run(adminUsername, hash)
    console.log(`[db] Admin user "${adminUsername}" created`)
  }
}

export default db
