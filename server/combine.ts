import { PDFDocument } from 'pdf-lib'
import { db, q, transaction, type Row } from './db.ts'
import { deleteDoc, requireDoc } from './docs.ts'
import { badRequest } from './http.ts'
import { syncDoc } from './markdown.ts'
import { joinTags, parseTags } from './tags.ts'

/** Merges several processed docs into one: PDFs are concatenated, page text and checklist items are re-numbered. */
export async function combineDocs(ids: number[], titleInput: string): Promise<number> {
  if (ids.length < 2) throw badRequest('Pick at least two documents')
  const docs = ids.map(requireDoc)
  if (docs.some((d) => d.status !== 'ready')) throw badRequest('Process every selected document first')

  const merged = await PDFDocument.create()
  const offsets: number[] = []
  for (const id of ids) {
    const src = await PDFDocument.load(new Uint8Array((q.pdf.get(id) as Row).pdf), { ignoreEncryption: true })
    offsets.push(merged.getPageCount())
    for (const page of await merged.copyPages(src, src.getPageIndices())) merged.addPage(page)
  }
  const bytes = Buffer.from(await merged.save())
  const title = titleInput.trim() || docs.map((d) => d.subject || d.name).join(' + ')
  const tags = joinTags(docs.flatMap((d) => parseTags(d.tags)))
  const summary = docs.map((d) => d.summary).filter(Boolean).join(' ').slice(0, 800)

  const newId = transaction(() => {
    const id = Number(
      db
        .prepare(`INSERT INTO docs (name, tags, pdf, pages, subject, summary, status) VALUES (?, ?, ?, ?, ?, ?, 'ready')`)
        .run(`${title}.pdf`, tags, bytes, merged.getPageCount(), title, summary).lastInsertRowid,
    )
    const insText = db.prepare(`INSERT INTO page_text (doc_id, page, text) VALUES (?, ?, ?)`)
    const insItem = db.prepare(`INSERT INTO items (doc_id, topic, description, page, done) VALUES (?, ?, ?, ?, ?)`)
    ids.forEach((srcId, i) => {
      for (const t of q.texts.all(srcId) as Row[]) insText.run(id, t.page + offsets[i], t.text)
      for (const it of q.itemsRaw.all(srcId) as Row[]) insItem.run(id, it.topic, it.description, it.page + offsets[i], it.done)
    })
    return id
  })
  ids.forEach(deleteDoc)
  syncDoc(newId)
  return newId
}
