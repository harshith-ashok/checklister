import express from 'express'
import { existsSync } from 'node:fs'
import { MODEL, PORT, VISION_MODEL } from './config.ts'
import { docs } from './routes/docs.ts'
import { items } from './routes/items.ts'
import { markdown } from './routes/markdown.ts'
import { meta } from './routes/meta.ts'
import { tags } from './routes/tags.ts'

const app = express()
app.use('/api', meta, docs, items, tags, markdown)

// Production: serve the built frontend.
if (existsSync('dist')) {
  app.use(express.static('dist'))
  app.use((_req, res) => res.sendFile('index.html', { root: 'dist' }))
}

app.listen(PORT, () => console.log(`checklister API on http://localhost:${PORT} (model ${MODEL}, vision ${VISION_MODEL})`))
