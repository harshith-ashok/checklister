import express, { Router } from 'express'
import { db, q, type Row } from '../db.ts'
import { docState, requireDoc } from '../docs.ts'
import { badRequest, handle, idParam, notFound } from '../http.ts'
import { syncDoc } from '../markdown.ts'

export const items = Router()

/** Looks up the doc an item belongs to. */
function docOfItem(itemId: number): number {
  const row = q.itemDoc.get(itemId) as Row | undefined
  if (!row) throw notFound()
  return row.doc_id
}

items.post('/docs/:id/items', express.json(), handle((req, res) => {
  const id = idParam(req)
  requireDoc(id)
  const topic = String(req.body.topic ?? '').trim()
  if (!topic) throw badRequest('Topic required')
  db.prepare(`INSERT INTO items (doc_id, topic, page) VALUES (?, ?, ?)`).run(id, topic, Math.max(1, Number(req.body.page) || 1))
  syncDoc(id)
  res.json(docState(id))
}))

items.patch('/items/:id', express.json(), handle((req, res) => {
  const id = idParam(req)
  const docId = docOfItem(id)
  const b = req.body
  if (typeof b.done === 'boolean') db.prepare(`UPDATE items SET done = ? WHERE id = ?`).run(b.done ? 1 : 0, id)
  if (typeof b.topic === 'string' && b.topic.trim()) db.prepare(`UPDATE items SET topic = ? WHERE id = ?`).run(b.topic.trim(), id)
  if (Number.isFinite(b.page)) db.prepare(`UPDATE items SET page = ? WHERE id = ?`).run(Math.max(1, b.page), id)
  syncDoc(docId)
  res.json(docState(docId))
}))

items.delete('/items/:id', handle((req, res) => {
  const id = idParam(req)
  const docId = docOfItem(id)
  db.prepare(`DELETE FROM items WHERE id = ?`).run(id)
  syncDoc(docId)
  res.json(docState(docId))
}))
