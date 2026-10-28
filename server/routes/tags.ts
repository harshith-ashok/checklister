import express, { Router } from 'express'
import { organiseAll } from '../classify.ts'
import { listDocs, renameTag } from '../docs.ts'
import { handle } from '../http.ts'
import { syncDoc } from '../markdown.ts'

export const tags = Router()

// Rename (or, with an empty "to", remove) a tag on every document that has it.
tags.patch('/tags', express.json(), handle((req, res) => {
  renameTag(String(req.body.from ?? ''), String(req.body.to ?? '').replace(/,/g, ' ').trim())
  res.json({ ok: true })
}))

// Re-tag every document using as few broad tags as possible.
tags.post('/organise', handle(async (_req, res) => {
  await organiseAll()
  listDocs().forEach((d) => syncDoc(d.id))
  res.json({ ok: true })
}))
