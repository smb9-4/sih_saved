import { Router } from 'express'
import { generateCompanionReply } from '../services/gemini.js'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const { messages, language = 'en' } = req.body ?? {}
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
      return res.status(400).json({ error: 'Please provide a short conversation.' })
    }
    const safeMessages = messages.filter((message) =>
      message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string'
    ).map((message) => ({ role: message.role, content: message.content.slice(0, 4000) }))
    if (!safeMessages.length) return res.status(400).json({ error: 'Please provide a message.' })
    const reply = await generateCompanionReply({ messages: safeMessages, language })
    return res.json({ reply })
  } catch (error) {
    console.error('Chat request failed:', error.code || 'provider error')
    const status = error.code === 'NOT_CONFIGURED' ? 503 : error.code === 'RATE_LIMIT' ? 429 : 502
    return res.status(status).json({ error: status === 429 ? 'The companion is busy right now. Please try again.' : 'I could not connect right now. You can try again.' })
  }
})

export default router
