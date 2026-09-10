import { Router } from 'express'
import multer from 'multer'
import { getVoiceCapabilities, synthesizeSpeech, transcribeAudio } from '../services/bhashini.js'

const router = Router()
const upload = multer({ limits: { fileSize: 8 * 1024 * 1024 }, storage: multer.memoryStorage() })

router.get('/capabilities', (_req, res) => res.json(getVoiceCapabilities()))

router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No recording was received.' })
    const text = await transcribeAudio({ audioBase64: req.file.buffer.toString('base64'), language: req.body.language })
    return res.json({ text })
  } catch (error) {
    console.error('Transcription failed:', error.code || 'provider error')
    const status = error.code === 'UNSUPPORTED_LANGUAGE' ? 400 : error.code === 'RATE_LIMIT' ? 429 : 502
    return res.status(status).json({ error: status === 429 ? 'Voice service is busy. Please try again.' : 'Sorry, I could not hear that. Please try again.' })
  }
})

router.post('/synthesize', async (req, res) => {
  try {
    const { text, language } = req.body ?? {}
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'No text was provided.' })
    const result = await synthesizeSpeech({ text: text.slice(0, 3000), language })
    return res.json({ audio: result.audioContent, language: result.language, mimeType: 'audio/wav' })
  } catch (error) {
    console.error('Synthesis failed:', error.code || 'provider error')
    const status = ['UNSUPPORTED_LANGUAGE', 'LANGUAGE_MISMATCH', 'EMPTY_SPEECH'].includes(error.code) ? 400 : error.code === 'RATE_LIMIT' ? 429 : 502
    return res.status(status).json({ error: 'Audio is not available right now. The reply is still shown above.' })
  }
})

export default router
