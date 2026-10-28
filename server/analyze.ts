import { CHUNK_CHARS, MODEL } from './config.ts'
import { db, q, transaction, type Row } from './db.ts'
import { requireDoc } from './docs.ts'
import { chatJson } from './ollama.ts'

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

const mergeSchema = {
  type: 'object',
  properties: { subject: { type: 'string' }, summary: { type: 'string' } },
  required: ['subject', 'summary'],
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

/** Builds the doc's subject, summary and topic checklist from its stored page text (replaces existing items). */
export async function analyzeDoc(id: number) {
  const doc = requireDoc(id)
  const pages = q.texts.all(id) as Row[]
  const chunks = chunkPages(pages.filter((p) => (p.text as string).trim()))
  if (!chunks.length) throw new Error('No readable text found in this PDF.')

  const results: Row[] = []
  for (const chunk of chunks) {
    results.push(
      await chatJson(
        MODEL,
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `File name: ${doc.name}\n\n${chunk}` },
        ],
        analysisSchema,
        'low',
      ),
    )
  }

  let subject = String(results[0].subject ?? '').trim()
  let summary = String(results[0].summary ?? '').trim()
  if (results.length > 1) {
    const merged = await chatJson(
      MODEL,
      [
        {
          role: 'user',
          content: `These are partial summaries of one document. Give the overall main subject (2-8 words) and a 1-2 sentence summary as JSON {"subject","summary"}.\n\n${results.map((r) => `${r.subject}: ${r.summary}`).join('\n')}`,
        },
      ],
      mergeSchema,
    )
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

  transaction(() => {
    db.prepare(`DELETE FROM items WHERE doc_id = ?`).run(id)
    const ins = db.prepare(`INSERT INTO items (doc_id, topic, description, page) VALUES (?, ?, ?, ?)`)
    for (const t of topics) ins.run(id, t.topic, t.description, t.page)
    db.prepare(`UPDATE docs SET subject = ?, summary = ?, status = 'ready', error = '' WHERE id = ?`).run(subject, summary, id)
  })
}
