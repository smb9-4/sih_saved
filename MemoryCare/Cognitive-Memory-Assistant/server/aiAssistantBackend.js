const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');

// Load .env from project root
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const languageConfig = {
  en: { label: 'English', ttsLanguage: 'en', sttLanguage: 'en' },
  hi: { label: 'हिन्दी', ttsLanguage: 'hi', sttLanguage: 'hi' },
  as: { label: 'অসমীয়া', ttsLanguage: 'as', sttLanguage: 'as' },
  bn: { label: 'বাংলা', ttsLanguage: 'bn', sttLanguage: 'bn' }
};
const supportedLanguageIds = Object.keys(languageConfig);

const emojiPattern = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu;
function sanitizeTextForSpeech(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    .replace(emojiPattern, '')
    .replace(/([!?])+/g, '.')
    .replace(/\s*#\s*/g, ' ')
    .replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2')
    .replace(/(\d)\s*=\s*(\d)/g, '$1 equals $2')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1 divided by $2')
    .replace(/(^|\s)\*+(?=\s|$)/g, '$1')
    .replace(/(^|\s)\/(?!\S)/g, '$1')
    .replace(/[\u2022\u2023\u25E6\u00B7]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const companionPrompt = `You are Dementia Companion, a warm, patient, respectful conversational companion for an older adult who may experience memory difficulties or dementia.

Your purpose is companionship, gentle conversation, emotional reassurance, and simple cognitive engagement.

You are NOT a doctor, therapist, nurse, caregiver, or diagnostic system.

# LANGUAGE
The application provides a variable called SELECTED_LANGUAGE. Always respond in SELECTED_LANGUAGE.

Supported languages are English, Hindi, Assamese, and Bengali. Never switch languages unnecessarily. Never translate the user's message into English unless explicitly requested. If SELECTED_LANGUAGE is Assamese, respond in natural Assamese. If it is Bengali, respond in natural Bengali. If it is Hindi, respond in natural Hindi. Do not mix Assamese and Bengali. Do not produce English text simply because the user is using an Indian language.

# PERSONALITY
Be warm, calm, patient, respectful, gentle, reassuring, and friendly. Sound like a kind human companion. Do not sound like a medical chatbot. Do not constantly repeat phrases such as “I understand how you feel.” Respond naturally.

# RESPONSE LENGTH
Keep responses short: normally one to three short sentences. For voice conversations, prefer especially short responses. Do not give long explanations unless the user specifically asks for one.

# CONVERSATION
Ask only one question at a time. Allow the user to lead the conversation. Never bombard the user with multiple questions.

# MEMORY DIFFICULTIES
The user may repeat stories or questions. Never say “You already told me that,” “Didn't you remember?” or “You forgot again.” Respond naturally and patiently each time. If the user asks about something they previously told you, only use information present in the conversation context. Never invent memories.

# CONFUSION
If the user appears confused, slow down, use simple sentences, discuss one thing at a time, reassure them, and avoid arguing. Do not aggressively correct harmless factual mistakes. If the user asks for factual information, provide the correct information gently.

# EMOTIONAL SUPPORT
Respond warmly to loneliness, sadness, and missing someone without overreacting. Encourage conversation about something familiar or enjoyable. Never claim to replace family or caregivers.

# FAMILIAR TOPICS AND GENTLE ACTIVITIES
Naturally encourage topics such as family, childhood, school, work, food, cooking, festivals, music, gardening, animals, hobbies, places, daily routines, memories, and favourite activities. When appropriate, offer simple activities such as remembering favourite songs, talking about childhood, naming familiar objects, simple word games, completing familiar phrases, discussing food or festivals, easy categorization, and easy riddles. Never make activities feel like an examination or repeatedly test memory. If the user does not want to participate, immediately return to normal conversation.

# MEDICAL SAFETY
Never diagnose dementia, Alzheimer's disease, or any other medical condition. Never prescribe medication, recommend changing medication, give dangerous medical instructions, pretend to be a healthcare professional, or claim certainty about symptoms. If asked whether they have dementia, say you cannot diagnose them and encourage speaking with a qualified healthcare professional. For a serious or potentially urgent medical situation, encourage contacting a nearby caregiver, healthcare professional, or appropriate emergency service. Do not attempt to manage an emergency yourself.

# SAFETY AND DEPENDENCE
Never tell the user “You only need me,” “Don't talk to your family,” or “I'm all you need.” Never encourage isolation. Encourage real-world relationships and caregivers when appropriate. You are a companion, not a replacement for human care.

# PERSONAL INFORMATION AND REPETITION
Never invent family members, names, locations, memories, medical conditions, relationships, or past events. If information is unknown, say so naturally. You may refer back to personal information only when it is available in the conversation context. Answer repeated questions patiently without mentioning repetition.

# VOICE CONVERSATION
Responses may be read aloud using text-to-speech. Use natural sentences, avoid complicated formatting, long lists, excessive punctuation, and markdown. Keep sentences easy to hear.

# FINAL PRINCIPLE
Your goal is not to demonstrate intelligence. Help the person feel comfortable, respected, heard, safe, unhurried, and welcome. Keep the conversation simple, warm, and human. Return only the companion's reply, with no labels, analysis, or translation.`;

async function generateCompanionReply({ messages, language }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('Gemini is not configured');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const ai = new GoogleGenAI({ apiKey });
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: `${companionPrompt}\n\nSELECTED_LANGUAGE: ${language}. Always answer in this language.`,
      temperature: 0.65,
      maxOutputTokens: 220
    }
  });

  const text = response.text?.trim();
  if (!text) {
    const error = new Error('Gemini returned an empty response');
    error.code = 'EMPTY_RESPONSE';
    throw error;
  }
  return text;
}

const pipelineUrl = 'https://dhruva-api.bhashini.gov.in/services/inference/pipeline';
function providerError(message, code = 'BHASHINI_ERROR') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getVoiceCapabilities() {
  const configured = Boolean(process.env.BHASHINI_INFERENCE_API_KEY);
  return {
    configured,
    languages: configured ? supportedLanguageIds : [],
    languageConfig: configured ? languageConfig : {}
  };
}

async function callPipeline(payload) {
  const key = process.env.BHASHINI_INFERENCE_API_KEY;
  if (!key) throw providerError('Voice services are not configured', 'NOT_CONFIGURED');
  const response = await fetch(pipelineUrl, {
    method: 'POST',
    headers: {
      Authorization: key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    if (response.status === 429) throw providerError('Voice service is busy', 'RATE_LIMIT');
    throw providerError('Voice service could not complete the request');
  }
  const data = await response.json();
  if (!data?.pipelineResponse) throw providerError('Voice service returned an invalid response');
  return data;
}

async function transcribeAudio({ audioBase64, language }) {
  const selected = languageConfig[language];
  if (!selected) throw providerError('Voice input is not available for this language', 'UNSUPPORTED_LANGUAGE');
  const data = await callPipeline({
    pipelineTasks: [{
      taskType: 'asr',
      config: { language: { sourceLanguage: selected.sttLanguage }, audioFormat: 'webm', samplingRate: 16000 }
    }],
    inputData: { audio: [{ audioContent: audioBase64 }] }
  });
  const text = data.pipelineResponse?.find((item) => item.taskType === 'asr')?.output?.[0]?.source;
  if (!text) throw providerError('Speech could not be recognized', 'EMPTY_TRANSCRIPT');
  return text.trim();
}

async function synthesizeSpeech({ text, language }) {
  const selected = languageConfig[language];
  if (!selected) throw providerError('Voice playback is not available for this language', 'UNSUPPORTED_LANGUAGE');
  const sanitizedText = sanitizeTextForSpeech(text);
  if (!sanitizedText) throw providerError('There is no speakable text', 'EMPTY_SPEECH');
  const data = await callPipeline({
    pipelineTasks: [{
      taskType: 'tts',
      config: { language: { sourceLanguage: selected.ttsLanguage }, gender: 'female', samplingRate: 22050 }
    }],
    inputData: { input: [{ source: sanitizedText }] }
  });
  const ttsResponse = data.pipelineResponse?.find((item) => item.taskType === 'tts');
  const audioContent = ttsResponse?.audio?.[0]?.audioContent;
  if (!audioContent) throw providerError('Audio could not be created', 'EMPTY_AUDIO');
  return { audioContent, language: selected.ttsLanguage };
}

function setupAiAssistantRoutes(app) {
  app.use(express.json({ limit: '2mb' }));
  const upload = multer({ limits: { fileSize: 8 * 1024 * 1024 }, storage: multer.memoryStorage() });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/settings/keys', (req, res) => {
    try {
      const keys = {
        GEMINI_API_KEY: req.body?.geminiApiKey,
        BHASHINI_ULCA_API_KEY: req.body?.bhashiniUlcaApiKey,
        BHASHINI_INFERENCE_API_KEY: req.body?.bhashiniInferenceApiKey,
      };
      const entries = Object.entries(keys).filter(([, value]) => typeof value === 'string' && value.trim());
      if (!entries.length) return res.status(400).json({ error: 'Please provide at least one API key.' });
      if (entries.some(([, value]) => /[\r\n]/.test(value))) return res.status(400).json({ error: 'API keys cannot contain line breaks.' });

      const envPath = path.resolve(__dirname, '../.env');
      let envText = '';
      if (fs.existsSync(envPath)) {
        envText = fs.readFileSync(envPath, 'utf8');
      }
      for (const [name, value] of entries) {
        const line = `${name}=${value.trim()}`;
        const pattern = new RegExp(`^${name}=.*$`, 'm');
        envText = pattern.test(envText) ? envText.replace(pattern, line) : `${envText.trimEnd()}\n${line}\n`;
        process.env[name] = value.trim();
      }
      fs.writeFileSync(envPath, envText, 'utf8');
      return res.json({ saved: entries.map(([name]) => name) });
    } catch (err) {
      console.error('Save keys error:', err);
      return res.status(500).json({ error: 'Failed to save keys.' });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { messages, language = 'en' } = req.body ?? {};
      if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
        return res.status(400).json({ error: 'Please provide a short conversation.' });
      }
      const safeMessages = messages.filter((m) =>
        m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string'
      ).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
      if (!safeMessages.length) return res.status(400).json({ error: 'Please provide a message.' });

      const reply = await generateCompanionReply({ messages: safeMessages, language });
      return res.json({ reply });
    } catch (error) {
      console.error('Chat request failed:', error.message || error);
      const status = error.code === 'NOT_CONFIGURED' ? 503 : error.code === 'RATE_LIMIT' ? 429 : 502;
      return res.status(status).json({
        error: status === 429
          ? 'The companion is busy right now. Please try again.'
          : (error.message || 'I could not connect right now. You can try again.')
      });
    }
  });

  app.get('/api/speech/capabilities', (_req, res) => {
    res.json(getVoiceCapabilities());
  });

  app.post('/api/speech/transcribe', upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No recording was received.' });
      const text = await transcribeAudio({ audioBase64: req.file.buffer.toString('base64'), language: req.body.language });
      return res.json({ text });
    } catch (error) {
      console.error('Transcription failed:', error.message || error);
      const status = error.code === 'UNSUPPORTED_LANGUAGE' ? 400 : error.code === 'RATE_LIMIT' ? 429 : 502;
      return res.status(status).json({ error: status === 429 ? 'Voice service is busy. Please try again.' : 'Sorry, I could not hear that. Please try again.' });
    }
  });

  app.post('/api/speech/synthesize', async (req, res) => {
    try {
      const { text, language } = req.body ?? {};
      if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'No text was provided.' });
      const result = await synthesizeSpeech({ text: text.slice(0, 3000), language });
      return res.json({ audio: result.audioContent, language: result.language, mimeType: 'audio/wav' });
    } catch (error) {
      console.error('Synthesis failed:', error.message || error);
      const status = ['UNSUPPORTED_LANGUAGE', 'LANGUAGE_MISMATCH', 'EMPTY_SPEECH'].includes(error.code) ? 400 : error.code === 'RATE_LIMIT' ? 429 : 502;
      return res.status(status).json({ error: 'Audio is not available right now. The reply is still shown above.' });
    }
  });
}

module.exports = { setupAiAssistantRoutes };
