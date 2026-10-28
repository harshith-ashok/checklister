import { db, type Row } from './db.ts'
import { docState, getDoc } from './docs.ts'
import { safeName, writeSyncFile } from './syncdir.ts'

const itemLine = (i: Row) => `- [${i.done ? 'x' : ' '}] ${i.topic} — p. ${i.page}`

export function docMarkdown(id: number): string {
  const d = docState(id)
  const items = d.items as Row[]
  return [
    `# ${d.subject || d.name}`,
    '',
    `> Source: ${d.name} · ${d.pages} pages · ${items.filter((i) => i.done).length}/${items.length} done`,
    d.summary ? `\n${d.summary}` : '',
    '',
    '## Checklist',
    '',
    ...items.map(itemLine),
    '',
  ].join('\n')
}

export const exportFilename = (docName: string) => `${safeName(docName)}.md`

/** Re-writes the doc's markdown into SYNC_DIR after a change. */
export function syncDoc(id: number) {
  const d = getDoc(id)
  if (d) writeSyncFile(d.name, docMarkdown(id))
}

/** Applies checked state from an exported checklist; unknown lines are added as new items. */
export function importMarkdown(id: number, md: string) {
  const find = db.prepare(`SELECT id FROM items WHERE doc_id = ? AND lower(topic) = lower(?) AND page = ?`)
  const setDone = db.prepare(`UPDATE items SET done = ? WHERE id = ?`)
  const add = db.prepare(`INSERT INTO items (doc_id, topic, page, done) VALUES (?, ?, ?, ?)`)
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.+?)(?:\s+[—–-]\s+p\.?\s*(\d+))?\s*$/)
    if (!m) continue
    const done = m[1] === ' ' ? 0 : 1
    const topic = m[2].trim()
    const page = Number(m[3] ?? 1)
    const hit = find.get(id, topic, page) as Row | undefined
    if (hit) setDone.run(done, hit.id)
    else add.run(id, topic, page, done)
  }
}
