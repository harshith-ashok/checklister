import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import { PDFDocument } from 'pdf-lib'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

const PORT = Number(process.env.PORT ?? 8787)
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const MODEL = process.env.MODEL ?? 'gpt-oss:120b-cloud'
// Used only for scanned / handwritten pages (gpt-oss is text-only). Must be a vision model.
const VISION_MODEL = process.env.VISION_MODEL ?? 'gemma4:31b-cloud'
const DB_PATH = process.env.DB_PATH ?? 'data/checklister.db'
// If set, every change re-writes <SYNC_DIR>/<name>.md so other tools (Obsidian, git…) stay in sync.
const SYNC_DIR = process.env.SYNC_DIR
const CHUNK_CHARS = 20000

mkdirSync(dirname(DB_PATH), { recursive: true })
const db = new DatabaseSync(DB_PATH)
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

type Row = Record<string, any>
function same(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}
const parseTags = (s: unknown): string[] => {
  const out: string[] = []
  for (const t of String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean)) if (!out.some((o) => same(o, t))) out.push(t)
  return out
}
const joinTags = (t: string[]) => parseTags(t.join(',')).join(',')
const withTags = <T extends Row>(r: T) => ({ ...r, tags: parseTags(r.tags) })
const q = {
  list: db.prepare(`
    SELECT d.id, d.name, d.tags, d.pages, d.subject, d.status, d.created_at,
      (SELECT COUNT(*) FROM items i WHERE i.doc_id = d.id) AS total,
      (SELECT COUNT(*) FROM items i WHERE i.doc_id = d.id AND i.done = 1) AS done
    FROM docs d ORDER BY d.created_at DESC, d.id DESC`),
  doc: db.prepare(`SELECT id, name, tags, pages, subject, summary, status, error, created_at FROM docs WHERE id = ?`),
  pdf: db.prepare(`SELECT pdf FROM docs WHERE id = ?`),
  items: db.prepare(`SELECT id, topic, description, page, done FROM items WHERE doc_id = ? ORDER BY page, id`),
  readPages: db.prepare(`SELECT page FROM page_text WHERE doc_id = ? ORDER BY page`),
  texts: db.prepare(`SELECT page, text FROM page_text WHERE doc_id = ? ORDER BY page`),
  itemDoc: db.prepare(`SELECT doc_id FROM items WHERE id = ?`),
}

const docState = (id: number): Row | null => {
  const doc = q.doc.get(id) as Row | undefined
  if (!doc) return null
  return {
    ...withTags(doc),
    items: (q.items.all(id) as Row[]).map((i) => ({ ...i, done: !!i.done })),
    readPages: (q.readPages.all(id) as Row[]).map((r) => r.page as number),
  }
}

// ---------- markdown export / sync ----------

const itemLine = (i: Row) => `- [${i.done ? 'x' : ' '}] ${i.topic} — p. ${i.page}`

function docMarkdown(id: number): string {
  const d = docState(id)
  if (!d) return ''
  const done = (d.items as Row[]).filter((i) => i.done).length
  return [
    `# ${d.subject || d.name}`,
    '',
    `> Source: ${d.name} · ${d.pages} pages · ${done}/${d.items.length} done`,
    d.summary ? `\n${d.summary}` : '',
    '',
    '## Checklist',
    '',
    ...(d.items as Row[]).map(itemLine),
    '',
  ].join('\n')
}

const safeName = (s: string) => s.replace(/\.pdf$/i, '').replace(/[^\w\- .]+/g, '_').trim() || 'checklist'

function syncFile(id: number) {
  if (!SYNC_DIR) return
  const d = q.doc.get(id) as Row | undefined
  if (!d) return
  mkdirSync(SYNC_DIR, { recursive: true })
  writeFileSync(join(SYNC_DIR, `${safeName(d.name)}.md`), docMarkdown(id))
}

function importMarkdown(id: number, md: string) {
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

// ---------- ollama ----------

async function chat(
  model: string,
  messages: Row[],
  opts: { format?: unknown; think?: string } = {},
): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(opts.format ? { format: opts.format } : {}),
        ...(opts.think ? { think: opts.think } : {}),
        options: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(10 * 60_000),
    })
  } catch {
    throw new Error(`Cannot reach Ollama at ${OLLAMA_URL}. Is it running?`)
  }
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = (await res.json()) as { message?: { content?: string } }
  return body.message?.content ?? ''
}

const parseJson = (s: string) => {
  try {
    return JSON.parse(s)
  } catch {
    const m = s.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('Model did not return JSON')
    return JSON.parse(m[0])
  }
}

const analysisSchema = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    summary: { type: 'string' },
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          page: { type: 'integer' },
          description: { type: 'string' },
        },
        required: ['topic', 'page', 'description'],
      },
    },
  },
  required: ['subject', 'summary', 'topics'],
}

const SYSTEM = `You turn documents (lecture notes, handwritten notes, textbook chapters, papers) into a study checklist.
Pages are marked "=== Page N ===". Text may come from OCR of handwriting, so infer sensible wording.
Return JSON with:
- subject: the main subject of the whole document, short (2-8 words).
- summary: one or two sentences on what the document covers.
- topics: the distinct topics a learner should cover, in reading order. Each has "topic" (short, concrete, 2-8 words), "page" (the page number where it is mainly covered, using the Page N markers) and "description" (one sentence on what it is about).
Prefer 5-25 meaningful topics; do not list trivia or repeat a topic.`

function chunkPages(pages: Row[]): string[] {
  const chunks: string[] = []
  let cur = ''
  for (const p of pages) {
    const block = `=== Page ${p.page} ===\n${(p.text as string).trim().slice(0, 6000)}\n\n`
    if (cur && cur.length + block.length > CHUNK_CHARS) {
      chunks.push(cur)
      cur = ''
    }
    cur += block
  }
  if (cur) chunks.push(cur)
  return chunks
}

async function analyze(id: number) {
  const doc = q.doc.get(id) as Row
  const pages = q.texts.all(id) as Row[]
  const chunks = chunkPages(pages.filter((p) => (p.text as string).trim()))
  if (!chunks.length) throw new Error('No readable text found in this PDF.')

  const results: Row[] = []
  for (const chunk of chunks) {
    const out = await chat(
      MODEL,
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `File name: ${doc.name}\n\n${chunk}` },
      ],
      { format: analysisSchema, think: 'low' },
    )
    results.push(parseJson(out))
  }

  let subject = String(results[0].subject ?? '').trim()
  let summary = String(results[0].summary ?? '').trim()
  if (results.length > 1) {
    const out = await chat(
      MODEL,
      [
        {
          role: 'user',
          content: `These are partial summaries of one document. Give the overall main subject (2-8 words) and a 1-2 sentence summary as JSON {"subject","summary"}.\n\n${results.map((r) => `${r.subject}: ${r.summary}`).join('\n')}`,
        },
      ],
      { format: { type: 'object', properties: { subject: { type: 'string' }, summary: { type: 'string' } }, required: ['subject', 'summary'] } },
    )
    const merged = parseJson(out)
    subject = merged.subject || subject
    summary = merged.summary || summary
  }

  const seen = new Set<string>()
  const maxPage = doc.pages || 9999
  const topics = results
    .flatMap((r) => (Array.isArray(r.topics) ? r.topics : []))
    .map((t: Row) => ({
      topic: String(t.topic ?? '').trim(),
      page: Math.min(Math.max(Number(t.page) || 1, 1), maxPage),
      description: String(t.description ?? '').trim(),
    }))
    .filter((t) => {
      const k = t.topic.toLowerCase()
      if (!t.topic || seen.has(k)) return false
      seen.add(k)
      return true
    })

  db.exec('BEGIN')
  try {
    db.prepare(`DELETE FROM items WHERE doc_id = ?`).run(id)
    const ins = db.prepare(`INSERT INTO items (doc_id, topic, description, page) VALUES (?, ?, ?, ?)`)
    for (const t of topics) ins.run(id, t.topic, t.description, t.page)
    db.prepare(`UPDATE docs SET subject = ?, summary = ?, status = 'ready', error = '' WHERE id = ?`).run(subject, summary, id)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

// ---------- tags ----------

const allTags = () => [...new Set((q.list.all() as Row[]).flatMap((d) => parseTags(d.tags)))].sort()
const setTags = db.prepare(`UPDATE docs SET tags = ? WHERE id = ?`)

/** Tags a new doc with the closest existing tag; only creates a new one as a last resort. */
async function classify(id: number) {
  const d = q.doc.get(id) as Row | undefined
  if (!d || parseTags(d.tags).length || !d.subject) return
  const existing = allTags()
  const out = parseJson(
    await chat(
      MODEL,
      [
        {
          role: 'user',
          content: `Tag a document.
Document subject: ${d.subject}
Summary: ${d.summary}
Existing tags: ${existing.length ? existing.map((c) => `"${c}"`).join(', ') : '(none yet)'}

Rules:
- The user has only a few, very diverse fields of interest. Use an existing tag when the document belongs to that same field or is a tangent/subtopic of it.
- Never force a fit: a document from a clearly different field (e.g. biology vs. computer science) must NOT get an unrelated tag.
- Only then create a new BROAD tag (1-3 words, a general field such as "Biology", not this document's specific topic).
Return JSON {"existing": "<exact existing name, or empty string>", "new_name": "<only when existing is empty>"}.`,
        },
      ],
      { format: { type: 'object', properties: { existing: { type: 'string' }, new_name: { type: 'string' } }, required: ['existing', 'new_name'] }, think: 'low' },
    ),
  )
  const pick = existing.find((c) => same(c, String(out.existing ?? ''))) ?? existing.find((c) => same(c, String(out.new_name ?? ''))) ?? String(out.new_name ?? '').trim()
  if (pick) setTags.run(pick, id)
}

/** Re-tags every processed doc using as few broad tags as possible. */
async function organiseAll() {
  const docs = (q.list.all() as Row[]).filter((d) => d.subject)
  if (docs.length < 2) return
  const full = docs.map((d) => ({ id: d.id, subject: d.subject, summary: (q.doc.get(d.id) as Row).summary, current: d.tags }))
  const out = parseJson(
    await chat(
      MODEL,
      [
        {
          role: 'user',
          content: `Tag these documents.
The user has only a few, very diverse interests, so use as FEW broad tags as possible (typically 2-6). Merge similar subjects, and fold tangents into the closest broad tag. Reuse current tags where they fit. Every document gets exactly one tag. Tag names: 1-3 words, general.

${JSON.stringify(full)}

Return JSON {"tags": [{"name": string, "doc_ids": [number]}]}.`,
        },
      ],
      {
        format: {
          type: 'object',
          properties: { tags: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, doc_ids: { type: 'array', items: { type: 'integer' } } }, required: ['name', 'doc_ids'] } } },
          required: ['tags'],
        },
        think: 'low',
      },
    ),
  )
  const ids = new Set(docs.map((d) => d.id as number))
  for (const c of out.tags ?? []) {
    const name = String(c.name ?? '').trim()
    if (!name) continue
    for (const did of c.doc_ids ?? []) if (ids.has(did)) setTags.run(name, did)
  }
}

// ---------- http ----------

const app = express()
const wrap =
  (fn: (req: express.Request, res: express.Response) => unknown | Promise<unknown>): express.RequestHandler =>
  async (req, res) => {
    try {
      await fn(req, res)
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
    }
  }
const idOf = (req: express.Request) => Number(req.params.id)
const exists = (id: number) => !!q.doc.get(id)

app.get('/api/config', wrap(async (_req, res) => {
  const ollama = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false)
  res.json({ model: MODEL, visionModel: VISION_MODEL, ollama, syncDir: SYNC_DIR ?? null })
}))

app.get('/api/docs', wrap((_req, res) => res.json((q.list.all() as Row[]).map(withTags))))

app.post('/api/docs', express.raw({ type: 'application/pdf', limit: '200mb' }), wrap((req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Send a PDF as the request body' })
  const name = String(req.query.name ?? 'document.pdf')
  const pages = Number(req.query.pages ?? 0)
  const r = db.prepare(`INSERT INTO docs (name, pdf, pages) VALUES (?, ?, ?)`).run(name, req.body, pages)
  res.json({ id: Number(r.lastInsertRowid) })
}))

app.get('/api/docs/:id', wrap((req, res) => {
  const d = docState(idOf(req))
  d ? res.json(d) : res.status(404).json({ error: 'Not found' })
}))

app.get('/api/docs/:id/pdf', wrap((req, res) => {
  const r = q.pdf.get(idOf(req)) as Row | undefined
  if (!r) return res.status(404).end()
  res.type('application/pdf').send(Buffer.from(r.pdf))
}))

app.patch('/api/docs/:id', express.json(), wrap((req, res) => {
  const id = idOf(req)
  if (!exists(id)) return res.status(404).json({ error: 'Not found' })
  if (Array.isArray(req.body.tags)) setTags.run(joinTags(req.body.tags), id)
  for (const k of ['name', 'subject'] as const) {
    if (typeof req.body[k] === 'string') db.prepare(`UPDATE docs SET ${k} = ? WHERE id = ?`).run(req.body[k].trim(), id)
  }
  syncFile(id)
  res.json(docState(id))
}))

function deleteDoc(id: number) {
  const d = q.doc.get(id) as Row | undefined
  db.prepare(`DELETE FROM docs WHERE id = ?`).run(id)
  if (SYNC_DIR && d) rmSync(join(SYNC_DIR, `${safeName(d.name)}.md`), { force: true })
}

app.delete('/api/docs/:id', wrap((req, res) => {
  deleteDoc(idOf(req))
  res.json({ ok: true })
}))

// Rename (or, with an empty "to", remove) a tag on every document that has it.
app.patch('/api/tags', express.json(), wrap((req, res) => {
  const from = String(req.body.from ?? '')
  const to = String(req.body.to ?? '').replace(/,/g, ' ').trim()
  for (const d of q.list.all() as Row[]) {
    const tags = parseTags(d.tags)
    if (!tags.some((t) => same(t, from))) continue
    setTags.run(joinTags(tags.map((t) => (same(t, from) ? to : t)).filter(Boolean)), d.id)
  }
  res.json({ ok: true })
}))

// Merge several docs into one: PDFs are concatenated, checklist items and page text are re-numbered.
app.post('/api/combine', express.json(), wrap(async (req, res) => {
  const ids: number[] = Array.isArray(req.body.ids) ? [...new Set((req.body.ids as unknown[]).map(Number))] as number[] : []
  if (ids.length < 2) return res.status(400).json({ error: 'Pick at least two documents' })
  const docs = ids.map((id) => q.doc.get(id) as Row | undefined)
  if (docs.some((d) => !d)) return res.status(404).json({ error: 'Not found' })
  if (docs.some((d) => d!.status !== 'ready')) return res.status(400).json({ error: 'Process every selected document first' })

  const merged = await PDFDocument.create()
  const offsets: number[] = []
  for (const id of ids) {
    const src = await PDFDocument.load(new Uint8Array((q.pdf.get(id) as Row).pdf), { ignoreEncryption: true })
    offsets.push(merged.getPageCount())
    for (const page of await merged.copyPages(src, src.getPageIndices())) merged.addPage(page)
  }
  const bytes = Buffer.from(await merged.save())
  const title = String(req.body.title ?? '').trim() || docs.map((d) => d!.subject || d!.name).join(' + ')
  const tags = joinTags(docs.flatMap((d) => parseTags(d!.tags)))
  const summary = docs.map((d) => d!.summary).filter(Boolean).join(' ').slice(0, 800)

  let newId = 0
  db.exec('BEGIN')
  try {
    newId = Number(db.prepare(`INSERT INTO docs (name, tags, pdf, pages, subject, summary, status) VALUES (?, ?, ?, ?, ?, ?, 'ready')`).run(`${title}.pdf`, tags, bytes, merged.getPageCount(), title, summary).lastInsertRowid)
    const insText = db.prepare(`INSERT INTO page_text (doc_id, page, text) VALUES (?, ?, ?)`)
    const insItem = db.prepare(`INSERT INTO items (doc_id, topic, description, page, done) VALUES (?, ?, ?, ?, ?)`)
    ids.forEach((id, i) => {
      for (const t of q.texts.all(id) as Row[]) insText.run(newId, t.page + offsets[i], t.text)
      for (const it of db.prepare(`SELECT topic, description, page, done FROM items WHERE doc_id = ? ORDER BY id`).all(id) as Row[]) {
        insItem.run(newId, it.topic, it.description, it.page + offsets[i], it.done)
      }
    })
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  ids.forEach(deleteDoc)
  syncFile(newId)
  res.json({ id: newId })
}))

// Client sends either extracted text, or a JPEG (data URL / base64) of a scanned page to transcribe.
app.post('/api/docs/:id/pages/:n', express.json({ limit: '30mb' }), wrap(async (req, res) => {
  const id = idOf(req)
  if (!exists(id)) return res.status(404).json({ error: 'Not found' })
  let text = String(req.body.text ?? '')
  if (req.body.image) {
    const b64 = String(req.body.image).replace(/^data:image\/\w+;base64,/, '')
    text = await chat(VISION_MODEL, [
      {
        role: 'user',
        content:
          'Transcribe all text on this page exactly, including handwriting. Write equations as LaTeX. For diagrams or figures, add a brief description in [square brackets]. Output only the transcription.',
        images: [b64],
      },
    ])
  }
  db.prepare(`INSERT OR REPLACE INTO page_text (doc_id, page, text) VALUES (?, ?, ?)`).run(id, Number(req.params.n), text)
  res.json({ chars: text.length })
}))

app.post('/api/docs/:id/analyze', wrap(async (req, res) => {
  const id = idOf(req)
  if (!exists(id)) return res.status(404).json({ error: 'Not found' })
  db.prepare(`UPDATE docs SET status = 'analyzing', error = '' WHERE id = ?`).run(id)
  try {
    await analyze(id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    db.prepare(`UPDATE docs SET status = 'error', error = ? WHERE id = ?`).run(msg, id)
    return res.status(500).json({ error: msg })
  }
  await classify(id).catch(() => {}) // best effort; the checklist is already saved
  syncFile(id)
  res.json(docState(id))
}))

app.post('/api/organise', wrap(async (_req, res) => {
  await organiseAll()
  for (const d of q.list.all() as Row[]) syncFile(d.id)
  res.json({ ok: true })
}))

app.post('/api/docs/:id/reset-pages', wrap((req, res) => {
  db.prepare(`DELETE FROM page_text WHERE doc_id = ?`).run(idOf(req))
  res.json({ ok: true })
}))

app.post('/api/docs/:id/items', express.json(), wrap((req, res) => {
  const id = idOf(req)
  if (!exists(id)) return res.status(404).json({ error: 'Not found' })
  const topic = String(req.body.topic ?? '').trim()
  if (!topic) return res.status(400).json({ error: 'Topic required' })
  db.prepare(`INSERT INTO items (doc_id, topic, page) VALUES (?, ?, ?)`).run(id, topic, Math.max(1, Number(req.body.page) || 1))
  syncFile(id)
  res.json(docState(id))
}))

app.patch('/api/items/:id', express.json(), wrap((req, res) => {
  const row = q.itemDoc.get(idOf(req)) as Row | undefined
  if (!row) return res.status(404).json({ error: 'Not found' })
  const b = req.body
  if (typeof b.done === 'boolean') db.prepare(`UPDATE items SET done = ? WHERE id = ?`).run(b.done ? 1 : 0, idOf(req))
  if (typeof b.topic === 'string' && b.topic.trim()) db.prepare(`UPDATE items SET topic = ? WHERE id = ?`).run(b.topic.trim(), idOf(req))
  if (Number.isFinite(b.page)) db.prepare(`UPDATE items SET page = ? WHERE id = ?`).run(Math.max(1, b.page), idOf(req))
  syncFile(row.doc_id)
  res.json(docState(row.doc_id))
}))

app.delete('/api/items/:id', wrap((req, res) => {
  const row = q.itemDoc.get(idOf(req)) as Row | undefined
  if (!row) return res.status(404).json({ error: 'Not found' })
  db.prepare(`DELETE FROM items WHERE id = ?`).run(idOf(req))
  syncFile(row.doc_id)
  res.json(docState(row.doc_id))
}))

app.get('/api/docs/:id/export.md', wrap((req, res) => {
  const id = idOf(req)
  const d = q.doc.get(id) as Row | undefined
  if (!d) return res.status(404).end()
  res.type('text/markdown').set('content-disposition', `attachment; filename="${safeName(d.name)}.md"`).send(docMarkdown(id))
}))

app.get('/api/export.md', wrap((_req, res) => {
  const ids = (q.list.all() as Row[]).map((d) => d.id as number)
  res.type('text/markdown').set('content-disposition', 'attachment; filename="checklists.md"').send(ids.map(docMarkdown).join('\n---\n\n'))
}))

app.post('/api/docs/:id/import', express.text({ type: '*/*', limit: '2mb' }), wrap((req, res) => {
  const id = idOf(req)
  if (!exists(id)) return res.status(404).json({ error: 'Not found' })
  importMarkdown(id, String(req.body ?? ''))
  syncFile(id)
  res.json(docState(id))
}))

if (existsSync('dist')) {
  app.use(express.static('dist'))
  app.use((_req, res) => res.sendFile('index.html', { root: 'dist' }))
}

app.listen(PORT, () => console.log(`checklister API on http://localhost:${PORT} (model ${MODEL}, vision ${VISION_MODEL})`))
