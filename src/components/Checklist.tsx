import { useRef, useState } from 'react'
import { Check, Download, Info, Plus, Redo, Sync, X } from '../icons'
import { api, type Doc, type Item } from '../api'
import type { Progress } from '../pdf'
import { topicPrompt } from '../prompt'

export function InfoPrompt({ doc, item }: { doc: Doc; item: Item }) {
  const [copied, setCopied] = useState(false)
  const prompt = topicPrompt(doc, item)
  return (
    <div className="mt-2 rounded-lg border border-stone-200 bg-stone-100 p-2 dark:border-stone-700 dark:bg-stone-900">
      <textarea readOnly value={prompt} rows={8} className="w-full resize-y rounded bg-transparent font-mono text-xs outline-none" onFocus={(e) => e.target.select()} />
      <button
        className="rounded-md bg-stone-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-stone-100 dark:text-stone-900"
        onClick={() => {
          navigator.clipboard.writeText(prompt).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }}
      >
        {copied ? <Check className="inline size-3.5" /> : 'Copy'}
      </button>
    </div>
  )
}

export function ItemRow({ doc, item, onDoc, onGoto }: { doc: Doc; item: Item; onDoc: (d: Doc) => void; onGoto?: (page: number) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="group border-b border-stone-100 px-1 py-2 last:border-0 dark:border-stone-800/70">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={item.done}
          onChange={(e) => {
            onDoc({ ...doc, items: doc.items.map((i) => (i.id === item.id ? { ...i, done: e.target.checked } : i)) })
            api.patchItem(item.id, { done: e.target.checked }).then(onDoc)
          }}
          className="mt-1 size-4 shrink-0 accent-emerald-600"
        />
        <span className={`min-w-0 flex-1 text-sm leading-6 ${item.done ? 'text-stone-400 line-through' : ''}`}>{item.topic}</span>
        <button
          onClick={() => onGoto?.(item.page)}
          disabled={!onGoto}
          className="shrink-0 rounded bg-stone-200 px-1.5 py-0.5 text-xs tabular-nums enabled:hover:bg-stone-300 dark:bg-stone-800 dark:enabled:hover:bg-stone-700"
        >
          p.{item.page}
        </button>
        <button
          onClick={() => setOpen(!open)}
          aria-label="Prompt to learn this topic"
          className={`shrink-0 ${open ? 'text-sky-500' : 'text-stone-400 hover:text-sky-500'}`}
        >
          <Info className="size-5" />
        </button>
        <button
          onClick={() => api.removeItem(item.id).then(onDoc)}
          aria-label="Delete"
          className="shrink-0 text-stone-400 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      </div>
      {open && <InfoPrompt doc={doc} item={item} />}
    </li>
  )
}

export function ExportBar({ doc, onDoc }: { doc: Doc; onDoc: (d: Doc) => void }) {
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const btn = 'rounded-md border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/api/docs/${doc.id}/export.md`} download className={btn}>
        <Download className="mr-1 inline size-3.5" />Export
      </a>
      <button className={btn} onClick={() => file.current?.click()}>
        <Sync className="mr-1 inline size-3.5" />Sync
      </button>
      <input
        ref={file}
        type="file"
        accept=".md,text/markdown,text/plain"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          const before = doc.items.filter((i) => i.done).length
          const next = await api.importMd(doc.id, await f.text())
          onDoc(next)
          setMsg(`Synced (${next.items.filter((i) => i.done).length - before >= 0 ? '+' : ''}${next.items.filter((i) => i.done).length - before} checked)`)
          setTimeout(() => setMsg(''), 3000)
          e.target.value = ''
        }}
      />
      {msg && <span className="text-xs text-emerald-600">{msg}</span>}
    </div>
  )
}

export default function Checklist({
  doc,
  busy,
  progress,
  error,
  onDoc,
  onRedo,
  onGoto,
}: {
  doc: Doc
  busy: boolean
  progress: Progress | null
  error: string
  onDoc: (d: Doc) => void
  onRedo: (rescan: boolean) => void
  onGoto: (page: number) => void
}) {
  const [hideDone, setHideDone] = useState(false)
  const [topic, setTopic] = useState('')
  const [page, setPage] = useState('1')
  const done = doc.items.filter((i) => i.done).length
  const pct = doc.items.length ? Math.round((done / doc.items.length) * 100) : 0
  const shown = hideDone ? doc.items.filter((i) => !i.done) : doc.items

  const redo = (rescan: boolean) => {
    if (done && !confirm('Recreate the checklist? Your checked items will be reset.')) return
    onRedo(rescan)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-stone-200 px-3 py-3 dark:border-stone-800">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold" title={doc.subject}>
              {doc.subject || doc.name}
            </h2>
            {doc.summary && <p className="line-clamp-2 text-xs text-stone-500">{doc.summary}</p>}
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              disabled={busy}
              onClick={() => redo(false)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Redo className="mr-1 inline size-3.5" />Redo
            </button>
            <button
              disabled={busy}
              onClick={() => redo(true)}
              className="rounded-md border border-stone-300 px-2 py-1.5 text-xs disabled:opacity-50 dark:border-stone-700"
            >
              Re-scan
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs tabular-nums text-stone-500">
            {done}/{doc.items.length}
          </span>
          <label className="flex items-center gap-1 text-xs text-stone-500">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> hide done
          </label>
        </div>
        <ExportBar doc={doc} onDoc={onDoc} />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-1">
        {busy && (
          <p className="my-3 rounded-md bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
            {progress?.phase === 'reading'
              ? `Reading pages ${progress.done}/${progress.total}…`
              : 'Building checklist…'}
          </p>
        )}
        {error && <p className="my-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
        {!busy && !doc.items.length && !error && <p className="my-6 text-center text-sm text-stone-500">No topics yet.</p>}
        <ul>
          {shown.map((i) => (
            <ItemRow key={i.id} doc={doc} item={i} onDoc={onDoc} onGoto={onGoto} />
          ))}
        </ul>
      </div>

      <form
        className="flex gap-2 border-t border-stone-200 p-2 dark:border-stone-800"
        onSubmit={(e) => {
          e.preventDefault()
          if (!topic.trim()) return
          api.addItem(doc.id, topic, Number(page) || 1).then((d) => {
            onDoc(d)
            setTopic('')
          })
        }}
      >
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Add topic"
          className="min-w-0 flex-1 rounded-md border border-stone-300 bg-transparent px-2 py-1.5 text-sm dark:border-stone-700"
        />
        <input
          type="number"
          min={1}
          value={page}
          onChange={(e) => setPage(e.target.value)}
          aria-label="Page"
          className="w-14 rounded-md border border-stone-300 bg-transparent px-2 py-1.5 text-sm dark:border-stone-700"
        />
        <button aria-label="Add" className="rounded-md bg-stone-900 px-2.5 text-white dark:bg-stone-100 dark:text-stone-900"><Plus className="size-4" /></button>
      </form>
    </div>
  )
}
