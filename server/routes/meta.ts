import { Router } from 'express'
import { MODEL, SYNC_DIR, VISION_MODEL } from '../config.ts'
import { handle } from '../http.ts'
import { isOllamaUp } from '../ollama.ts'

export const meta = Router()

meta.get('/config', handle(async (_req, res) => {
  res.json({ model: MODEL, visionModel: VISION_MODEL, ollama: await isOllamaUp(), syncDir: SYNC_DIR ?? null })
}))
