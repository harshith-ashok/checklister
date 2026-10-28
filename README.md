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
