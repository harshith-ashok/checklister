import { useEffect, useRef, useState } from 'react'
import { Left, Right } from '../icons'
import { loadPdf, type PdfDoc } from '../pdf'

const btn = 'rounded-md border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800'

export default function PdfViewer({ id, page, onPage }: { id: number; page: number; onPage: (n: number) => void }) {
  const [pdf, setPdf] = useState<PdfDoc | null>(null)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(0)
  const [err, setErr] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    loadPdf(id).then(setPdf, (e) => setErr(String(e.message ?? e)))
  }, [id])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const total = pdf?.numPages ?? 0
  const current = Math.min(Math.max(page, 1), Math.max(total, 1))

  useEffect(() => {
    if (!pdf || !canvas.current || !width) return
    let cancelled = false
    let task: { cancel(): void; promise: Promise<unknown> } | null = null
    pdf.getPage(current).then((p) => {
      if (cancelled || !canvas.current) return
      const base = p.getViewport({ scale: 1 })
      const dpr = window.devicePixelRatio || 1
      const viewport = p.getViewport({ scale: ((width - 16) / base.width) * zoom * dpr })
      const c = canvas.current
      c.width = viewport.width
      c.height = viewport.height
      c.style.width = `${viewport.width / dpr}px`
      c.style.height = `${viewport.height / dpr}px`
      task = p.render({ canvas: c, viewport })
      task.promise.catch(() => {})
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, current, width, zoom])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-3 py-2 dark:border-stone-800">
        <button className={btn} disabled={current <= 1} onClick={() => onPage(current - 1)} aria-label="Previous page">
          <Left className="size-4" />
        </button>
        <span className="text-sm tabular-nums">
          <input
            type="number"
            min={1}
            max={total || 1}
            value={current}
            onChange={(e) => onPage(Number(e.target.value) || 1)}
            className="w-12 rounded border border-stone-300 bg-transparent px-1 py-0.5 text-center dark:border-stone-700"
          />{' '}
          / {total || '–'}
        </span>
        <button className={btn} disabled={current >= total} onClick={() => onPage(current + 1)} aria-label="Next page">
          <Right className="size-4" />
        </button>
        <div className="ml-auto flex gap-1">
          <button className={btn} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">
            −
          </button>
          <button className={btn} onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button className={btn} onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">
            +
          </button>
        </div>
      </div>
      <div ref={box} className="min-h-0 flex-1 overflow-auto bg-stone-200 p-2 dark:bg-stone-900">
        {err ? <p className="p-4 text-sm text-red-600">{err}</p> : <canvas ref={canvas} className="mx-auto block bg-white shadow" />}
      </div>
    </div>
  )
}
