import express, { Router } from 'express'
import { analyzeDoc } from '../analyze.ts'
import { classifyDoc } from '../classify.ts'
import { combineDocs } from '../combine.ts'
import { db, q, type Row } from '../db.ts'
import { deleteDoc, docState, listDocs, requireDoc } from '../docs.ts'
import { badRequest, handle, idParam, notFound } from '../http.ts'
import { syncDoc } from '../markdown.ts'
import { savePage } from '../ocr.ts'
import { joinTags } from '../tags.ts'

export const docs = Router()

docs.get('/docs', handle((_req, res) => res.json(listDocs())))

docs.post('/docs', express.raw({ type: 'application/pdf', limit: '200mb' }), handle((req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Send a PDF as the request body')
  const name = String(req.query.name ?? 'document.pdf')
  const pages = Number(req.query.pages ?? 0)
  const r = db.prepare(`INSERT INTO docs (name, pdf, pages) VALUES (?, ?, ?)`).run(name, req.body, pages)
  res.json({ id: Number(r.lastInsertRowid) })
}))

docs.get('/docs/:id', handle((req, res) => res.json(docState(idParam(req)))))

docs.get('/docs/:id/pdf', handle((req, res) => {
  const r = q.pdf.get(idParam(req)) as Row | undefined
  if (!r) throw notFound()
  res.type('application/pdf').send(Buffer.from(r.pdf))
}))

docs.patch('/docs/:id', express.json(), handle((req, res) => {
  const id = idParam(req)
  requireDoc(id)
  if (Array.isArray(req.body.tags)) q.setTags.run(joinTags(req.body.tags), id)
  for (const k of ['name', 'subject'] as const) {
    if (typeof req.body[k] === 'string') db.prepare(`UPDATE docs SET ${k} = ? WHERE id = ?`).run(req.body[k].trim(), id)
  }
  syncDoc(id)
  res.json(docState(id))
}))

docs.delete('/docs/:id', handle((req, res) => {
  deleteDoc(idParam(req))
  res.json({ ok: true })
}))

// Merge several docs into one (PDFs and checklists).
docs.post('/combine', express.json(), handle(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? [...new Set((req.body.ids as unknown[]).map(Number))] : []
  res.json({ id: await combineDocs(ids, String(req.body.title ?? '')) })
}))

// Client sends either extracted text, or a JPEG (data URL / base64) of a scanned page to transcribe.
docs.post('/docs/:id/pages/:n', express.json({ limit: '30mb' }), handle(async (req, res) => {
  const id = idParam(req)
  requireDoc(id)
  const chars = await savePage(id, Number(req.params.n), { text: req.body.text && String(req.body.text), image: req.body.image && String(req.body.image) })
  res.json({ chars })
}))

docs.post('/docs/:id/reset-pages', handle((req, res) => {
  db.prepare(`DELETE FROM page_text WHERE doc_id = ?`).run(idParam(req))
  res.json({ ok: true })
}))

docs.post('/docs/:id/analyze', handle(async (req, res) => {
  const id = idParam(req)
  requireDoc(id)
  db.prepare(`UPDATE docs SET status = 'analyzing', error = '' WHERE id = ?`).run(id)
  try {
    await analyzeDoc(id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    db.prepare(`UPDATE docs SET status = 'error', error = ? WHERE id = ?`).run(msg, id)
    throw e
  }
  await classifyDoc(id).catch(() => {}) // best effort; the checklist is already saved
  syncDoc(id)
  res.json(docState(id))
}))
