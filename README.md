# Checklister

Upload a PDF (printed or handwritten) → `gpt-oss:120b-cloud` finds the subject and topics → you get a checklist with page numbers.

```
npm install
npm run dev     # http://localhost:5173  (API on :8787)
npm start       # production: builds, serves everything on :8787
```

Needs Ollama running locally and signed in for `*-cloud` models.

| env | default | |
|---|---|---|
| `MODEL` | `gpt-oss:120b-cloud` | topic extraction |
| `VISION_MODEL` | `gemma4:31b-cloud` | OCR for scanned/handwritten pages (gpt-oss is text-only) |
| `OLLAMA_URL` | `http://localhost:11434` | |
| `DB_PATH` | `data/checklister.db` | SQLite file; PDFs are stored in it as BLOBs |
| `SYNC_DIR` | – | if set, every change rewrites `<SYNC_DIR>/<pdf name>.md` |

## Server layout (`server/`)

| file | role |
|---|---|
| `index.ts` | boots Express, mounts `routes/*`, serves `dist` |
| `config.ts` | env vars |
| `db.ts` | SQLite schema, migration, shared prepared statements, `transaction()` |
| `docs.ts` | doc/tag queries (`docState`, `deleteDoc`, `renameTag`…) |
| `analyze.ts` | page text → subject, summary, topics (gpt-oss) |
| `classify.ts` | auto-tagging of new docs, "Auto-organise" |
| `combine.ts` | merge several docs (PDFs + checklists) |
| `ocr.ts` | store page text; vision-model OCR for scans |
| `markdown.ts`, `syncdir.ts` | `.md` export/import and `SYNC_DIR` mirroring |
| `ollama.ts` | Ollama client (`chat`, `chatJson`) |
| `tags.ts`, `http.ts` | pure tag helpers; `HttpError` + async handler wrapper |
| `routes/` | `docs`, `items`, `tags`, `markdown`, `meta` routers |
