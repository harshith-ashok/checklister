export const PORT = Number(process.env.PORT ?? 8787)
export const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
export const MODEL = process.env.MODEL ?? 'gpt-oss:120b-cloud'
// Used only for scanned / handwritten pages (gpt-oss is text-only). Must be a vision model.
export const VISION_MODEL = process.env.VISION_MODEL ?? 'gemma4:31b-cloud'
export const DB_PATH = process.env.DB_PATH ?? 'data/checklister.db'
// If set, every change re-writes <SYNC_DIR>/<name>.md so other tools (Obsidian, git…) stay in sync.
export const SYNC_DIR = process.env.SYNC_DIR
// Max characters of page text sent to the model in one request.
export const CHUNK_CHARS = 12000
