import { VISION_MODEL } from './config.ts'
import { db } from './db.ts'
import { chat } from './ollama.ts'

const PROMPT =
  'Transcribe all text on this page exactly, including handwriting. Write equations as LaTeX. For diagrams or figures, add a brief description in [square brackets]. Output only the transcription.'

/** Stores a page's text; `image` (base64 or data URL of a scan) is transcribed with the vision model first. */
export async function savePage(docId: number, page: number, input: { text?: string; image?: string }) {
  let text = input.text ?? ''
  if (input.image) {
    const b64 = input.image.replace(/^data:image\/\w+;base64,/, '')
    text = await chat(VISION_MODEL, [{ role: 'user', content: PROMPT, images: [b64] }])
  }
  db.prepare(`INSERT OR REPLACE INTO page_text (doc_id, page, text) VALUES (?, ?, ?)`).run(docId, page, text)
  return text.length
}
