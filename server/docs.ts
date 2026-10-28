import { db, q, type Row } from './db.ts'
import { notFound } from './http.ts'
import { joinTags, parseTags, same } from './tags.ts'
import { removeSyncFile } from './syncdir.ts'

export const withTags = <T extends Row>(r: T) => ({ ...r, tags: parseTags(r.tags) })

export const listDocs = () => (q.list.all() as Row[]).map(withTags)
export const getDoc = (id: number) => q.doc.get(id) as Row | undefined

export function requireDoc(id: number): Row {
  const d = getDoc(id)
  if (!d) throw notFound()
  return d
}

/** A doc with its checklist items and the pages that already have text. */
export function docState(id: number): Row {
  const doc = requireDoc(id)
  return {
    ...withTags(doc),
    items: (q.items.all(id) as Row[]).map((i) => ({ ...i, done: !!i.done })),
    readPages: (q.readPages.all(id) as Row[]).map((r) => r.page as number),
  }
}

export function deleteDoc(id: number) {
  const d = getDoc(id)
  db.prepare(`DELETE FROM docs WHERE id = ?`).run(id)
  if (d) removeSyncFile(d.name)
}

export const allTags = () => [...new Set(listDocs().flatMap((d) => d.tags as string[]))].sort()

/** Renames a tag on every doc that has it; an empty `to` removes it. */
export function renameTag(from: string, to: string) {
  for (const d of listDocs()) {
    const tags = d.tags as string[]
    if (!tags.some((t) => same(t, from))) continue
    q.setTags.run(joinTags(tags.map((t) => (same(t, from) ? to : t)).filter(Boolean)), d.id)
  }
}
