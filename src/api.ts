export type Item = { id: number; topic: string; description: string; page: number; done: boolean }
export type DocSummary = {
  id: number
  name: string
  tags: string[]
  pages: number
  subject: string
  status: 'new' | 'analyzing' | 'ready' | 'error'
  created_at: string
  total: number
  done: number
}
export type Doc = Omit<DocSummary, 'total' | 'done'> & {
  summary: string
  error: string
  items: Item[]
  readPages: number[]
}
export type Config = { model: string; visionModel: string; ollama: boolean; syncDir: string | null }

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`)
  }
  return res.json()
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  config: () => req<Config>('/api/config'),
  list: () => req<DocSummary[]>('/api/docs'),
  get: (id: number) => req<Doc>(`/api/docs/${id}`),
  upload: (file: File, pages: number) =>
    req<{ id: number }>(`/api/docs?name=${encodeURIComponent(file.name)}&pages=${pages}`, {
      method: 'POST',
      headers: { 'content-type': 'application/pdf' },
      body: file,
    }),
  patchDoc: (id: number, patch: Partial<Pick<Doc, 'name' | 'tags' | 'subject'>>) => req<Doc>(`/api/docs/${id}`, json('PATCH', patch)),
  remove: (id: number) => req<{ ok: true }>(`/api/docs/${id}`, { method: 'DELETE' }),
  sendPage: (id: number, page: number, body: { text?: string; image?: string }) =>
    req<{ chars: number }>(`/api/docs/${id}/pages/${page}`, json('POST', body)),
  renameTag: (from: string, to: string) => req<{ ok: true }>('/api/tags', json('PATCH', { from, to })),
  combine: (ids: number[], title: string) => req<{ id: number }>('/api/combine', json('POST', { ids, title })),
  organise: () => req<{ ok: true }>('/api/organise', { method: 'POST' }),
  resetPages: (id: number) => req<{ ok: true }>(`/api/docs/${id}/reset-pages`, { method: 'POST' }),
  analyze: (id: number) => req<Doc>(`/api/docs/${id}/analyze`, { method: 'POST' }),
  addItem: (id: number, topic: string, page: number) => req<Doc>(`/api/docs/${id}/items`, json('POST', { topic, page })),
  patchItem: (id: number, patch: Partial<Pick<Item, 'done' | 'topic' | 'page'>>) => req<Doc>(`/api/items/${id}`, json('PATCH', patch)),
  removeItem: (id: number) => req<Doc>(`/api/items/${id}`, { method: 'DELETE' }),
  importMd: (id: number, md: string) =>
    req<Doc>(`/api/docs/${id}/import`, { method: 'POST', headers: { 'content-type': 'text/markdown' }, body: md }),
}
