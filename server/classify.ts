import { MODEL } from './config.ts'
import { q } from './db.ts'
import { allTags, getDoc, listDocs } from './docs.ts'
import { chatJson } from './ollama.ts'
import { parseTags, same } from './tags.ts'

const pickSchema = {
  type: 'object',
  properties: { existing: { type: 'string' }, new_name: { type: 'string' } },
  required: ['existing', 'new_name'],
}

const organiseSchema = {
  type: 'object',
  properties: {
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, doc_ids: { type: 'array', items: { type: 'integer' } } },
        required: ['name', 'doc_ids'],
      },
    },
  },
  required: ['tags'],
}

/** Tags a new doc with the closest existing tag; only creates a new one as a last resort. */
export async function classifyDoc(id: number) {
  const d = getDoc(id)
  if (!d || !d.subject || parseTags(d.tags).length) return
  const existing = allTags()
  const out = await chatJson(
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
    pickSchema,
    'low',
  )
  const newName = String(out.new_name ?? '').trim()
  const pick = existing.find((c) => same(c, String(out.existing ?? ''))) ?? existing.find((c) => same(c, newName)) ?? newName
  if (pick) q.setTags.run(pick, id)
}

/** Re-tags every processed doc using as few broad tags as possible. */
export async function organiseAll() {
  const docs = listDocs().filter((d) => d.subject)
  if (docs.length < 2) return
  const summary = (id: number) => getDoc(id)?.summary
  const payload = docs.map((d) => ({ id: d.id, subject: d.subject, summary: summary(d.id), current: d.tags }))
  const out = await chatJson(
    MODEL,
    [
      {
        role: 'user',
        content: `Tag these documents.
The user has only a few, very diverse interests, so use as FEW broad tags as possible (typically 2-6). Merge similar subjects, and fold tangents into the closest broad tag. Reuse current tags where they fit. Every document gets exactly one tag. Tag names: 1-3 words, general.

${JSON.stringify(payload)}

Return JSON {"tags": [{"name": string, "doc_ids": [number]}]}.`,
      },
    ],
    organiseSchema,
    'low',
  )
  const ids = new Set(docs.map((d) => d.id as number))
  for (const c of out.tags ?? []) {
    const name = String(c.name ?? '').trim()
    if (!name) continue
    for (const did of c.doc_ids ?? []) if (ids.has(did)) q.setTags.run(name, did)
  }
}
