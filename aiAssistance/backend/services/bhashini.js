import { languageConfig, supportedLanguageIds } from './languageConfig.js'
import { sanitizeTextForSpeech } from './speechText.js'

const pipelineUrl = 'https://dhruva-api.bhashini.gov.in/services/inference/pipeline'

function providerError(message, code = 'BHASHINI_ERROR') {
  const error = new Error(message)
  error.code = code
  return error
}

function requireKey() {
  if (!process.env.BHASHINI_INFERENCE_API_KEY) {
    throw providerError('Voice services are not configured', 'NOT_CONFIGURED')
  }
}

async function callPipeline(payload) {
  requireKey()
  const response = await fetch(pipelineUrl, {
    method: 'POST',
    headers: {
      Authorization: process.env.BHASHINI_INFERENCE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    if (response.status === 429) throw providerError('Voice service is busy', 'RATE_LIMIT')
    throw providerError('Voice service could not complete the request')
  }
  const data = await response.json()
  if (!data?.pipelineResponse) throw providerError('Voice service returned an invalid response')
  return data
}

export function getVoiceCapabilities() {
  const configured = Boolean(process.env.BHASHINI_INFERENCE_API_KEY)
  return {
    configured,
    languages: configured ? supportedLanguageIds : [],
    languageConfig: configured ? languageConfig : {}
  }
}

export async function transcribeAudio({ audioBase64, language }) {
  const selectedLanguage = languageConfig[language]
  if (!selectedLanguage) {
    throw providerError('Voice input is not available for this language', 'UNSUPPORTED_LANGUAGE')
  }
  return callPipeline({
    pipelineTasks: [{
      taskType: 'asr',
      config: { language: { sourceLanguage: selectedLanguage.sttLanguage }, audioFormat: 'webm', samplingRate: 16000 }
    }],
    inputData: { audio: [{ audioContent: audioBase64 }] }
  }).then((data) => {
    const text = data.pipelineResponse?.find((item) => item.taskType === 'asr')?.output?.[0]?.source
    if (!text) throw providerError('Speech could not be recognized', 'EMPTY_TRANSCRIPT')
    return text.trim()
  })
}

export async function synthesizeSpeech({ text, language }) {
  const selectedLanguage = languageConfig[language]
  if (!selectedLanguage) {
    throw providerError('Voice playback is not available for this language', 'UNSUPPORTED_LANGUAGE')
  }
  const sanitizedText = sanitizeTextForSpeech(text, selectedLanguage.ttsLanguage)
  if (!sanitizedText) throw providerError('There is no speakable text', 'EMPTY_SPEECH')
  return callPipeline({
    pipelineTasks: [{
      taskType: 'tts',
      config: { language: { sourceLanguage: selectedLanguage.ttsLanguage }, gender: 'female', samplingRate: 22050 }
    }],
    inputData: { input: [{ source: sanitizedText }] }
  }).then((data) => {
    const ttsResponse = data.pipelineResponse?.find((item) => item.taskType === 'tts')
    const responseLanguage = ttsResponse?.config?.language?.sourceLanguage || ttsResponse?.language?.sourceLanguage
    if (responseLanguage && responseLanguage !== selectedLanguage.ttsLanguage) {
      throw providerError('Voice service returned the wrong language', 'LANGUAGE_MISMATCH')
    }
    const audioContent = ttsResponse?.audio?.[0]?.audioContent
    if (!audioContent) throw providerError('Audio could not be created', 'EMPTY_AUDIO')
    return { audioContent, language: selectedLanguage.ttsLanguage }
  })
}
