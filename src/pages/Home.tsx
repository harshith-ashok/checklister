import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Config, type Doc } from '../api'
import Checklist from '../components/Checklist'
import PdfViewer from '../components/PdfViewer'
import { Upload } from '../icons'
import { countPages, imagesToPdf, processDoc, type Progress } from '../pdf'

export default function Home({ id, config }: { id: number | null; config: Config | null }) {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState<'pdf' | 'list'>('pdf')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const run = useCallback(async (docId: number, rescan = false) => {
    setBusy(true)
    setError('')
    setTab('list')
    try {
      setDoc(await processDoc(docId, { rescan, onProgress: setProgress }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      api.get(docId).then(setDoc)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }, [])

  useEffect(() => {
    if (id == null) return
    let live = true
    api.get(id).then(
      (d) => {
        if (!live) return
        setDoc(d)
        setError(d.status === 'error' ? d.error : '')
        if (d.status === 'new') run(id) // uploaded earlier but never processed
      },
      (e) => live && setError(String(e.message ?? e)),
    )
    return () => {
      live = false
    }
  }, [id, run])

  const upload = useCallback(async (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    const images = files.filter((f) => f.type.startsWith('image/')).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    if (!isPdf(files[0]) && images.length !== files.length) return setError('Choose a PDF or images.')
    setError('')
    setBusy(true)
    try {
      const file = isPdf(files[0]) ? files[0] : await imagesToPdf(images)
      const { id: newId } = await api.upload(file, await countPages(file))
      location.hash = `#/doc/${newId}` // Home remounts with the new id and starts processing
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (id != null) return
    const onPaste = (e: ClipboardEvent) => upload(e.clipboardData?.files)
    addEventListener('paste', onPaste)
    return () => removeEventListener('paste', onPaste)
  }, [id, upload])

  if (id == null) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            upload(e.dataTransfer.files)
          }}
          onClick={() => input.current?.click()}
          className={`flex w-full max-w-xl cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition sm:p-14 ${drag ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-stone-300 hover:border-stone-400 dark:border-stone-700'}`}
        >
          <Upload className="size-10 text-stone-400" />
          <h1 className="text-lg font-semibold">{busy ? 'Uploading…' : 'Drop a PDF or images'}</h1>
          <p className="text-sm text-stone-500">or tap to choose{config && !config.ollama ? ' · Ollama is offline' : ''}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <input ref={input} type="file" multiple accept="application/pdf,.pdf,image/*" hidden onChange={(e) => upload(e.target.files)} />
        </div>
      </div>
    )
  }

  if (!doc) return <p className="p-6 text-sm text-stone-500">{error || 'Loading…'}</p>

  const seg = (t: 'pdf' | 'list', label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`flex-1 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-emerald-600' : 'text-stone-500'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-stone-200 lg:hidden dark:border-stone-800">
        {seg('pdf', 'PDF')}
        {seg('list', 'Checklist')}
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <section className={`min-h-0 border-stone-200 lg:block lg:border-r dark:border-stone-800 ${tab === 'pdf' ? 'block' : 'hidden'}`}>
          <PdfViewer id={doc.id} page={page} onPage={setPage} />
        </section>
        <section className={`min-h-0 lg:block ${tab === 'list' ? 'block' : 'hidden'}`}>
          <Checklist
            doc={doc}
            busy={busy}
            progress={progress}
            error={error}
            onDoc={setDoc}
            onRedo={(rescan) => run(doc.id, rescan)}
            onGoto={(p) => {
              setPage(p)
              setTab('pdf')
            }}
          />
        </section>
      </div>
    </div>
  )
}
