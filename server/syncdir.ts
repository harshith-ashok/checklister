import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SYNC_DIR } from './config.ts'

export const safeName = (s: string) => s.replace(/\.pdf$/i, '').replace(/[^\w\- .]+/g, '_').trim() || 'checklist'

/** Mirrors a doc's markdown into SYNC_DIR (no-op when SYNC_DIR is unset). */
export function writeSyncFile(docName: string, markdown: string) {
  if (!SYNC_DIR) return
  mkdirSync(SYNC_DIR, { recursive: true })
  writeFileSync(join(SYNC_DIR, `${safeName(docName)}.md`), markdown)
}

export function removeSyncFile(docName: string) {
  if (SYNC_DIR) rmSync(join(SYNC_DIR, `${safeName(docName)}.md`), { force: true })
}
