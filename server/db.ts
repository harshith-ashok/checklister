import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DB_PATH } from './config.ts'

export type Row = Record<string, any>

mkdirSync(dirname(DB_PATH), { recursive: true })
export const db = new DatabaseSync(DB_PATH)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS docs (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '',
    pdf BLOB NOT NULL,
    pages INTEGER NOT NULL DEFAULT 0,
    subject TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS page_text (
    doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
    page INTEGER NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (doc_id, page)
  );
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    page INTEGER NOT NULL DEFAULT 1,
    done INTEGER NOT NULL DEFAULT 0
  );
`)

// older databases called the tags column "folder"
if ((db.prepare(`PRAGMA table_info(docs)`).all() as Row[]).some((c) => c.name === 'folder')) {
  db.exec(`ALTER TABLE docs RENAME COLUMN folder TO tags`)
}

/** Prepared statements shared across modules. */
export const q = {
  list: db.prepare(`
    SELECT d.id, d.name, d.tags, d.pages, d.subject, d.status, d.created_at,
      (SELECT COUNT(*) FROM items i WHERE i.doc_id = d.id) AS total,
      (SELECT COUNT(*) FROM items i WHERE i.doc_id = d.id AND i.done = 1) AS done
    FROM docs d ORDER BY d.created_at DESC, d.id DESC`),
  doc: db.prepare(`SELECT id, name, tags, pages, subject, summary, status, error, created_at FROM docs WHERE id = ?`),
  pdf: db.prepare(`SELECT pdf FROM docs WHERE id = ?`),
  items: db.prepare(`SELECT id, topic, description, page, done FROM items WHERE doc_id = ? ORDER BY page, id`),
  itemsRaw: db.prepare(`SELECT topic, description, page, done FROM items WHERE doc_id = ? ORDER BY id`),
  itemDoc: db.prepare(`SELECT doc_id FROM items WHERE id = ?`),
  readPages: db.prepare(`SELECT page FROM page_text WHERE doc_id = ? ORDER BY page`),
  texts: db.prepare(`SELECT page, text FROM page_text WHERE doc_id = ? ORDER BY page`),
  setTags: db.prepare(`UPDATE docs SET tags = ? WHERE id = ?`),
}

/** Runs `fn` in a transaction, rolling back if it throws. */
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
