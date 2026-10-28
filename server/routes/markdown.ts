import express, { Router } from 'express'
import { docState, listDocs, requireDoc } from '../docs.ts'
import { handle, idParam } from '../http.ts'
import { docMarkdown, exportFilename, importMarkdown, syncDoc } from '../markdown.ts'

export const markdown = Router()

const send = (res: Parameters<Parameters<typeof handle>[0]>[1], filename: string, body: string) =>
  res.type('text/markdown').set('content-disposition', `attachment; filename="${filename}"`).send(body)

markdown.get('/docs/:id/export.md', handle((req, res) => {
  const id = idParam(req)
  send(res, exportFilename(requireDoc(id).name), docMarkdown(id))
}))

markdown.get('/export.md', handle((_req, res) => {
  send(res, 'checklists.md', listDocs().map((d) => docMarkdown(d.id)).join('\n---\n\n'))
}))

// Sync: apply checked state from a previously exported .md.
markdown.post('/docs/:id/import', express.text({ type: '*/*', limit: '2mb' }), handle((req, res) => {
  const id = idParam(req)
  requireDoc(id)
  importMarkdown(id, String(req.body ?? ''))
  syncDoc(id)
  res.json(docState(id))
}))
