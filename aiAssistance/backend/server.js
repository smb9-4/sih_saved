import dotenv from 'dotenv'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import chatRouter from './routes/chat.js'
import speechRouter from './routes/speech.js'

const backendDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(backendDirectory, '../.env') })

const app = express()
const port = Number(process.env.PORT || 3001)

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '1mb' }))
app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/settings/keys', async (req, res) => {
  const keys = {
    GEMINI_API_KEY: req.body?.geminiApiKey,
    BHASHINI_ULCA_API_KEY: req.body?.bhashiniUlcaApiKey,
    BHASHINI_INFERENCE_API_KEY: req.body?.bhashiniInferenceApiKey,
  }
  const entries = Object.entries(keys).filter(([, value]) => typeof value === 'string' && value.trim())
  if (!entries.length) return res.status(400).json({ error: 'Please provide at least one API key.' })
  if (entries.some(([, value]) => /[\r\n]/.test(value))) return res.status(400).json({ error: 'API keys cannot contain line breaks.' })

  const envPath = path.resolve(backendDirectory, '../.env')
  let envText = ''
  try { envText = await fs.readFile(envPath, 'utf8') } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  for (const [name, value] of entries) {
    const line = `${name}=${value.trim()}`
    const pattern = new RegExp(`^${name}=.*$`, 'm')
    envText = pattern.test(envText) ? envText.replace(pattern, line) : `${envText.trimEnd()}\n${line}\n`
    process.env[name] = value.trim()
  }
  await fs.writeFile(envPath, envText, 'utf8')
  return res.json({ saved: entries.map(([name]) => name) })
})
app.use('/api/chat', chatRouter)
app.use('/api/speech', speechRouter)
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
app.use((error, _req, res, _next) => {
  console.error('Unhandled request error:', error.message)
  res.status(500).json({ error: 'Something went wrong. Please try again.' })
})

app.listen(port, () => console.log(`Dementia Companion backend listening on http://localhost:${port}`))
