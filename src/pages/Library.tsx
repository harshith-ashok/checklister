import { useEffect, useMemo, useState } from 'react'
import { api, type Doc, type DocSummary } from '../api'
import { Down, Download, Grid, Layers, List, Merge, Plus, Up, X } from '../icons'
import { forgetPdf } from '../pdf'
import { ExportBar, ItemRow } from '../components/Checklist'

function Card({ d, reload, grid, selected, onSelect }: { d: DocSummary; reload: () => void; grid: boolean; selected: boolean; onSelect: () => void }) {
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState<Doc | null>(null)
  const pct = d.total ? Math.round((d.done / d.total) * 100) : 0

  useEffect(() => {
    if (open) api.get(d.id).then(setFull)
  }, [open, d.id])

  const update = (doc: Doc) => {
    setFull(doc)
    reload()
  }

  const title = d.subject || d.name
  return (
    <div className={`rounded-xl border bg-white p-3 dark:bg-stone-900 ${selected ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-stone-200 dark:border-stone-800'}`}>
      <div className={grid ? 'space-y-2' : 'flex flex-wrap items-start gap-x-3 gap-y-2'}>
        <div className="flex min-w-0 flex-1 basis-56 items-start gap-2">
          <input type="checkbox" checked={selected} onChange={onSelect} aria-label="Select" className="mt-1 size-4 shrink-0 accent-emerald-600" />
          <div className="min-w-0 flex-1">
          <input
            key={title}
            defaultValue={title}
            onBlur={(e) => e.target.value.trim() && e.target.value !== title && api.patchDoc(d.id, d.subject ? { subject: e.target.value } : { name: e.target.value }).then(reload)}
            className="w-full truncate rounded bg-transparent text-sm font-semibold outline-none focus:ring-1 focus:ring-emerald-500"
            aria-label="Title"
          />
          <p className="truncate text-xs text-stone-500" title={d.name}>
            {d.status === 'error' ? 'Failed · ' : !d.subject ? 'Not processed · ' : ''}
            {d.name} · {d.pages}p
          </p>
          </div>
        </div>
        <input
          list="tags"
          defaultValue={d.tags.join(', ')}
          key={d.tags.join(',')}
          placeholder="Tags"
          onBlur={(e) => {
            const tags = e.target.value.split(',').map((t) => t.trim()).filter(Boolean)
            if (tags.join(',') !== d.tags.join(',')) api.patchDoc(d.id, { tags }).then(reload)
          }}
          className={`rounded-md border border-stone-300 bg-transparent px-2 py-1 text-xs dark:border-stone-700 ${grid ? 'w-full' : 'w-32'}`}
        />
        <div className="flex items-center gap-2">
          <a href={`#/doc/${d.id}`} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white">
            Open
          </a>
          <button
            onClick={() => {
              if (confirm(`Delete "${title}"?`)) api.remove(d.id).then(() => (forgetPdf(d.id), reload()))
            }}
            className="text-xs text-stone-400 hover:text-red-600"
          >
            Delete
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs tabular-nums text-stone-500">
          {d.done}/{d.total}
        </span>
        <button onClick={() => setOpen(!open)} className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100">
          Checklist {open ? <Up className="inline size-3.5" /> : <Down className="inline size-3.5" />}
        </button>
      </div>
      {open && full && (
        <div className="mt-2 border-t border-stone-100 pt-2 dark:border-stone-800">
          <ExportBar doc={full} onDoc={update} />
          <ul className="mt-1">
            {full.items.map((i) => (
              <ItemRow key={i.id} doc={full} item={i} onDoc={update} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const iconBtn = (on: boolean) => `p-1.5 ${on ? 'bg-stone-200 dark:bg-stone-800' : 'text-stone-500'}`

export default function Library() {
  const [docs, setDocs] = useState<DocSummary[] | null>(null)
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [picked, setPicked] = useState<number[]>([])
  const [organising, setOrganising] = useState(false)
  const [grid, setGrid] = useState(() => {
    try {
      return localStorage.getItem('libraryView') !== 'list'
    } catch {
      return true
    }
  })

  const reload = () => api.list().then(setDocs)
  useEffect(() => {
    reload()
  }, [])
  const setView = (g: boolean) => {
    setGrid(g)
    try {
      localStorage.setItem('libraryView', g ? 'grid' : 'list')
    } catch {
      /* ignore */
    }
  }

  const tags = useMemo(() => [...new Set((docs ?? []).flatMap((d) => d.tags))].sort(), [docs])
  const shown = (docs ?? []).filter(
    (d) =>
      (tag === null || d.tags.includes(tag)) &&
      `${d.name} ${d.subject} ${d.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()),
  )

  const organise = async () => {
    if (!confirm('Re-tag all documents using as few tags as possible? This replaces current tags.')) return
    setOrganising(true)
    try {
      await api.organise()
      setTag(null)
      await reload()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setOrganising(false)
    }
  }

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const combine = async () => {
    const first = docs?.find((d) => d.id === picked[0])
    const title = prompt(`Title for the combined list (${picked.length} documents will be merged into one)`, first?.subject || first?.name)
    if (!title?.trim()) return
    try {
      const { id } = await api.combine(picked, title)
      picked.forEach(forgetPdf)
      setPicked([])
      location.hash = `#/doc/${id}`
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }
  const renameTag = async (to: string) => {
    if (tag === null || to.trim() === tag) return
    await api.renameTag(tag, to)
    setTag(to.trim() || null)
    reload()
  }

  const outline = 'rounded-md border border-stone-300 px-2.5 py-1.5 text-xs font-medium dark:border-stone-700'
  return (
    <div className="mx-auto h-full max-w-5xl overflow-auto p-3 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="min-w-0 flex-1 basis-40 rounded-md border border-stone-300 bg-transparent px-3 py-1.5 text-sm dark:border-stone-700"
        />
        <div className="flex overflow-hidden rounded-md border border-stone-300 dark:border-stone-700">
          <button onClick={() => setView(true)} aria-label="Grid view" className={iconBtn(grid)}>
            <Grid className="size-4" />
          </button>
          <button onClick={() => setView(false)} aria-label="List view" className={iconBtn(!grid)}>
            <List className="size-4" />
          </button>
        </div>
        <button onClick={organise} disabled={organising || (docs?.length ?? 0) < 2} className={`${outline} disabled:opacity-50`}>
          <Layers className="mr-1 inline size-3.5" />
          {organising ? 'Organising…' : 'Auto-organise'}
        </button>
        <a href="/api/export.md" download className={outline}>
          <Download className="mr-1 inline size-3.5" />
          Export all
        </a>
        <a href="#/" className="rounded-md bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-white dark:bg-stone-100 dark:text-stone-900">
          <Plus className="mr-1 inline size-3.5" />
          Upload
        </a>
      </div>
      <datalist id="tags">
        {tags.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {[null, ...tags].map((f) => (
            <button
              key={f ?? 'all'}
              onClick={() => setTag(f)}
              className={`rounded-full px-3 py-1 text-xs ${tag === f ? 'bg-emerald-600 text-white' : 'bg-stone-200 dark:bg-stone-800'}`}
            >
              {f ?? 'All'}
            </button>
          ))}
        </div>
      )}
      {tag !== null && (
        <div className="mb-3 flex items-center gap-2">
          <input
            key={tag}
            defaultValue={tag}
            aria-label="Rename tag"
            onBlur={(e) => renameTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-48 rounded-md border border-stone-300 bg-transparent px-2 py-1 text-sm font-semibold dark:border-stone-700"
          />
          <button onClick={() => confirm(`Remove tag "${tag}" from all documents?`) && renameTag('')} aria-label="Remove tag" className="text-stone-400 hover:text-red-600">
            <X className="size-4" />
          </button>
        </div>
      )}
      {docs && !shown.length && <p className="py-10 text-center text-sm text-stone-500">{docs.length ? 'No matches.' : 'No documents yet.'}</p>}
      <div className={grid ? 'grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-2'}>
        {shown.map((d) => (
          <Card key={d.id} d={d} reload={reload} grid={grid} selected={picked.includes(d.id)} onSelect={() => toggle(d.id)} />
        ))}
      </div>
      {picked.length > 0 && (
        <div className="sticky bottom-0 mt-4 flex items-center gap-2 rounded-xl border border-stone-200 bg-white p-2 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          <span className="px-2 text-sm">{picked.length} selected</span>
          <button onClick={() => setPicked([])} className="ml-auto text-xs text-stone-500">
            Clear
          </button>
          <button onClick={combine} disabled={picked.length < 2} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            <Merge className="mr-1 inline size-3.5" />
            Combine
          </button>
        </div>
      )}
    </div>
  )
}
