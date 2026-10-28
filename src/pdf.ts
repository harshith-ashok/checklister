import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { api, type Doc } from './api'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDoc = pdfjs.PDFDocumentProxy

const cache = new Map<number, Promise<PdfDoc>>()
export const loadPdf = (id: number) => {
  let p = cache.get(id)
  if (!p) {
    p = pdfjs.getDocument({ url: `/api/docs/${id}/pdf` }).promise
    p.catch(() => cache.delete(id))
    cache.set(id, p)
  }
  return p
}
export const forgetPdf = (id: number) => cache.delete(id)

export async function countPages(file: File): Promise<number> {
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const { numPages } = await task.promise
  void task.destroy()
  return numPages
}

const MIN_TEXT_CHARS = 40 // fewer than this on a page => treat as scanned / handwritten
const OCR_MAX_SIDE = 1600

export type Progress = { phase: 'reading' | 'analyzing'; done: number; total: number }

/** Reads any pages the server has no text for (OCR for scans), then asks the model for the checklist. */
export async function processDoc(
  id: number,
  opts: { rescan?: boolean; onProgress?: (p: Progress) => void } = {},
): Promise<Doc> {
  if (opts.rescan) await api.resetPages(id)
  const doc = await api.get(id)
  const pdf = await loadPdf(id)
  const have = new Set(opts.rescan ? [] : doc.readPages)
  const todo = Array.from({ length: pdf.numPages }, (_, i) => i + 1).filter((n) => !have.has(n))

  let done = 0
  for (const n of todo) {
    opts.onProgress?.({ phase: 'reading', done, total: todo.length })
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    const text = content.items.map((i) => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' ').trim()
    if (text.length >= MIN_TEXT_CHARS) {
      await api.sendPage(id, n, { text })
    } else {
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(2, OCR_MAX_SIDE / Math.max(base.width, base.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, viewport }).promise
      await api.sendPage(id, n, { image: canvas.toDataURL('image/jpeg', 0.8) })
    }
    done++
  }
  opts.onProgress?.({ phase: 'analyzing', done: todo.length, total: todo.length })
  return api.analyze(id)
}

/** Wraps one or more images into a single PDF (one image per page) so images follow the same pipeline. */
export async function imagesToPdf(files: File[]): Promise<File> {
  const enc = new TextEncoder()
  const parts: Uint8Array<ArrayBuffer>[] = []
  const offsets: number[] = []
  let len = 0
  const push = (b: Uint8Array<ArrayBuffer> | string) => {
    const u = typeof b === 'string' ? enc.encode(b) : b
    parts.push(u)
    len += u.length
  }
  const obj = (n: number, head: string, stream?: Uint8Array<ArrayBuffer> | string) => {
    offsets[n] = len
    push(`${n} 0 obj\n${head}`)
    if (stream) {
      push('\nstream\n')
      push(stream)
      push('\nendstream')
    }
    push('\nendobj\n')
  }

  push('%PDF-1.4\n')
  const kids: string[] = []
  const pageObjs: (() => void)[] = []
  for (const [i, file] of files.entries()) {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale)
    const h = Math.round(bmp.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const jpeg = new Uint8Array(await (await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.85))).arrayBuffer())
    const pw = Math.round(w * 0.5)
    const ph = Math.round(h * 0.5)
    const page = 3 + 3 * i
    kids.push(`${page} 0 R`)
    pageObjs.push(() => {
      obj(page, `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${pw} ${ph}]/Contents ${page + 1} 0 R/Resources<</XObject<</Im0 ${page + 2} 0 R>>>>>>`)
      const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`
      obj(page + 1, `<</Length ${content.length}>>`, content)
      obj(page + 2, `<</Type/XObject/Subtype/Image/Width ${w}/Height ${h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${jpeg.length}>>`, jpeg)
    })
  }
  obj(1, '<</Type/Catalog/Pages 2 0 R>>')
  obj(2, `<</Type/Pages/Kids[${kids.join(' ')}]/Count ${kids.length}>>`)
  pageObjs.forEach((f) => f())
  const count = 3 + 3 * files.length
  const xref = len
  push(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<</Size ${count}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`)
  const name = files[0].name.replace(/\.[^.]+$/, '') + (files.length > 1 ? ` (+${files.length - 1})` : '') + '.pdf'
  return new File(parts, name, { type: 'application/pdf' })
}
