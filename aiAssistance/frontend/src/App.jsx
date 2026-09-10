import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Heart, KeyRound, Languages, LoaderCircle, Mic, Pause, Send, Square, Volume2, VolumeX } from 'lucide-react'

const languages = [
  { id: 'en', label: 'English', greeting: 'Hello. I am here with you. How are you feeling today?' },
  { id: 'hi', label: 'हिन्दी', greeting: 'नमस्ते। मैं आपके साथ हूँ। आज आप कैसा महसूस कर रहे हैं?' },
  { id: 'as', label: 'অসমীয়া', greeting: 'নমস্কাৰ। মই আপোনাৰ সৈতে আছোঁ। আজি আপোনাৰ কেনে লাগিছে?' },
  { id: 'bn', label: 'বাংলা', greeting: 'নমস্কার। আমি আপনার সঙ্গে আছি। আজ আপনার কেমন লাগছে?' }
]

const starters = {
  en: ['How are you feeling today?', 'Tell me about your family.', 'What did you enjoy doing when you were young?', 'What would you like to talk about?'],
  hi: ['आज आप कैसा महसूस कर रहे हैं?', 'मुझे अपने परिवार के बारे में बताइए।', 'जब आप छोटे थे तो क्या करना पसंद करते थे?', 'आप किस बारे में बात करना चाहेंगे?'],
  as: ['আজি আপোনাৰ কেনে লাগিছে?', 'আপোনাৰ পৰিয়ালৰ বিষয়ে মোক কওক।', 'আপুনি সৰু থাকোঁতে কি কৰি ভাল পাইছিল?', 'আপুনি কিহৰ বিষয়ে কথা পাতিব বিচাৰে?'],
  bn: ['আজ আপনার কেমন লাগছে?', 'আপনার পরিবারের কথা আমাকে বলুন।', 'ছোটবেলায় আপনি কী করতে ভালোবাসতেন?', 'আপনি কী নিয়ে কথা বলতে চান?']
}

const voiceLabels = {
  idle: 'Tap to Speak', listening: 'Listening...', processing: 'Thinking...', speaking: 'Speaking...', error: 'Try again'
}

function KeySetup({ onBack }) {
  const [keys, setKeys] = useState({ geminiApiKey: '', bhashiniUlcaApiKey: '', bhashiniInferenceApiKey: '' })
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  async function saveKeys(event) {
    event.preventDefault()
    setStatus('')
    setSaving(true)
    try {
      const response = await fetch('/api/settings/keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(keys)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save the keys.')
      setStatus('Keys saved. You can start talking now.')
      setKeys({ geminiApiKey: '', bhashiniUlcaApiKey: '', bhashiniInferenceApiKey: '' })
    } catch (error) {
      setStatus(error.message)
    } finally {
      setSaving(false)
    }
  }

  return <main className="app-shell settings-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark" aria-hidden="true"><Heart size={24} fill="currentColor" /></span><div><strong>Dementia Companion</strong><span>A gentle place to talk</span></div></div></header>
    <section className="settings-page">
      <button className="back-button" onClick={onBack}><ArrowLeft size={18} /> Back to companion</button>
      <p className="eyebrow">Set up your companion</p>
      <h1>Add your API keys</h1>
      <p className="settings-intro">Add the keys below to enable Gemini conversations and Bhashini voice services. Your keys are saved only in this app's local backend `.env` file.</p>
      <div className="settings-steps"><strong>How to get your keys</strong><span>1. For talking, open <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>, sign in, choose <b>Create API key</b>, copy the key, and paste it in the Gemini box.</span><span>2. For Indian-language voice, open the <a href="https://dashboard.bhashini.co.in/" target="_blank" rel="noreferrer">Bhashini dashboard</a>, copy your ULCA/update key and inference key, and paste them below.</span><span>3. Press <b>Save keys</b>. Return to the companion and send a message.</span></div>
      <form className="key-form" onSubmit={saveKeys}>
        <div className="key-section"><h2>Gemini talking key</h2><p>Required for written conversations with the companion.</p><label htmlFor="gemini-key">Gemini API key</label><input id="gemini-key" type="password" value={keys.geminiApiKey} onChange={(event) => setKeys({ ...keys, geminiApiKey: event.target.value })} placeholder="Paste your Gemini API key here" autoComplete="off" /></div>
        <div className="key-section"><h2>Bhashini voice keys</h2><p>Optional. These enable speech recognition and spoken replies.</p><label htmlFor="ulca-key">Bhashini ULCA / update key</label><input id="ulca-key" type="password" value={keys.bhashiniUlcaApiKey} onChange={(event) => setKeys({ ...keys, bhashiniUlcaApiKey: event.target.value })} placeholder="Paste your Bhashini update key here" autoComplete="off" /><label htmlFor="inference-key">Bhashini inference key</label><input id="inference-key" type="password" value={keys.bhashiniInferenceApiKey} onChange={(event) => setKeys({ ...keys, bhashiniInferenceApiKey: event.target.value })} placeholder="Paste your Bhashini inference key here" autoComplete="off" /></div>
        <button className="save-keys-button" type="submit" disabled={saving}><KeyRound size={18} /> {saving ? 'Saving...' : 'Save keys'}</button>
        {status && <p className="settings-status" role="status">{status}</p>}
      </form>
    </section>
  </main>
}

function App() {
  const [language, setLanguage] = useState('en')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [voiceState, setVoiceState] = useState('idle')
  const [voiceError, setVoiceError] = useState('')
  const [capabilities, setCapabilities] = useState({ configured: false, languages: ['en', 'hi', 'as', 'bn'], languageConfig: {} })
  const [isMuted, setIsMuted] = useState(false)
  const [audioUrl, setAudioUrl] = useState('')
  const [showKeySetup, setShowKeySetup] = useState(false)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const audioRef = useRef(null)
  const endRef = useRef(null)

  const availableLanguages = languages.filter((item) => capabilities.languages.includes(item.id))
  const selectedLanguage = languages.find((item) => item.id === language) || languages[0]
  const startersForLanguage = starters[language] || starters.en
  const voiceSupported = Boolean(capabilities.configured && capabilities.languages.includes(language))

  useEffect(() => {
    fetch('/api/speech/capabilities')
      .then((response) => response.json())
      .then((data) => {
        setCapabilities(data)
        if (data.languages?.length && !data.languages.includes(language)) setLanguage(data.languages[0])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, isSending])

  useEffect(() => () => {
    audioRef.current?.pause()
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  }, [audioUrl])

  if (showKeySetup) return <KeySetup onBack={() => setShowKeySetup(false)} />

  function addUserMessage(content) {
    setMessages((current) => [...current, { role: 'user', content }])
  }

  async function sendMessage(message = input, selectedLanguageId = language) {
    const content = message.trim()
    if (!content || isSending) return
    addUserMessage(content)
    setInput('')
    setIsSending(true)
    try {
      const history = [...messages, { role: 'user', content }]
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, language: selectedLanguageId })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to connect')
      setMessages((current) => [...current, { role: 'assistant', content: data.reply }])
      if (voiceState === 'speaking') stopAudio()
      return data.reply
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', content: error.message || 'I could not connect right now. You can try again.', isError: true }])
      return null
    } finally {
      setIsSending(false)
    }
  }

  async function startRecording() {
    if (!voiceSupported || voiceState !== 'idle') return
    setVoiceError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data)
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        processRecording(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }), language)
      }
      recorderRef.current = recorder
      recorder.start()
      setVoiceState('listening')
    } catch {
      setVoiceState('error')
      setVoiceError('Microphone access is off. You can still type your message below.')
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') {
      setVoiceState('processing')
      recorderRef.current.stop()
    }
  }

  async function processRecording(blob, selectedLanguageId) {
    try {
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')
      formData.append('language', selectedLanguageId)
      const response = await fetch('/api/speech/transcribe', { method: 'POST', body: formData })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      const reply = await sendMessage(data.text, selectedLanguageId)
      if (reply) await speak(reply, selectedLanguageId)
      setVoiceState('idle')
    } catch (error) {
      setVoiceState('error')
      setVoiceError(error.message || 'Sorry, I could not hear that. Please try again.')
    }
  }

  async function speak(text, selectedLanguageId = language) {
    if (!capabilities.configured || !capabilities.languages.includes(selectedLanguageId) || isMuted) return
    try {
      setVoiceState('speaking')
      const response = await fetch('/api/speech/synthesize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language: selectedLanguageId })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      if (data.language !== selectedLanguageId || language !== selectedLanguageId) {
        throw new Error('The voice language changed. Please try again.')
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      const nextUrl = `data:${data.mimeType};base64,${data.audio}`
      setAudioUrl(nextUrl)
      const audio = new Audio(nextUrl)
      audioRef.current = audio
      audio.onended = () => setVoiceState('idle')
      await audio.play()
    } catch {
      setVoiceState('idle')
      setVoiceError('Audio is unavailable, but the written reply is here for you.')
    }
  }

  function stopAudio() {
    audioRef.current?.pause()
    audioRef.current = null
    setVoiceState('idle')
  }

  function handleVoiceClick() {
    if (voiceState === 'listening') return stopRecording()
    if (voiceState === 'speaking') return stopAudio()
    startRecording()
  }

  function handleLanguageChange(event) {
    const nextLanguage = event.target.value
    setLanguage(nextLanguage)
    setVoiceError('')
    if (!capabilities?.languages.includes(nextLanguage)) stopAudio()
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true"><Heart size={24} fill="currentColor" /></span><div><strong>Dementia Companion</strong><span>A gentle place to talk</span></div></div>
        <div className="topbar-actions"><button className="add-key-button" onClick={() => setShowKeySetup(true)}><KeyRound size={17} /> Add key</button><label className="language-picker"><Languages size={19} aria-hidden="true" /><span className="sr-only">Choose language</span><select value={language} onChange={handleLanguageChange} disabled={!availableLanguages.length}>{availableLanguages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
      </header>

      <section className="welcome" aria-labelledby="welcome-title">
        <p className="eyebrow">A little company, whenever you need it</p>
        <h1 id="welcome-title">Hello, I’m glad you’re here.</h1>
        <p className="welcome-copy">We can talk about today, yesterday, or anything that feels comfortable.</p>
      </section>

      <section className="conversation" aria-label="Conversation">
        <div className="messages">
          <article className="message assistant-message"><div className="avatar" aria-hidden="true"><Heart size={18} fill="currentColor" /></div><div><span className="message-label">Dementia Companion</span><p>{selectedLanguage.greeting}</p></div></article>
          {messages.map((message, index) => <article className={`message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`} key={`${message.role}-${index}`}>
            {message.role === 'assistant' && <div className="avatar" aria-hidden="true"><Heart size={18} fill="currentColor" /></div>}
            <div><span className="message-label">{message.role === 'user' ? 'You' : 'Dementia Companion'}</span><p className={message.isError ? 'error-text' : ''}>{message.content}</p>{message.role === 'assistant' && !message.isError && voiceSupported && <button className="listen-button" onClick={() => speak(message.content, language)}><Volume2 size={17} /> Listen</button>}</div>
          </article>)}
          {isSending && <article className="message assistant-message"><div className="avatar" aria-hidden="true"><LoaderCircle className="spin" size={18} /></div><div><span className="message-label">Dementia Companion</span><p className="thinking">Thinking gently...</p></div></article>}
          <div ref={endRef} />
        </div>
      </section>

      <section className="voice-panel" aria-label="Voice conversation">
        <div className="voice-copy"><h2>Would you like to speak?</h2><p>{voiceSupported ? 'Tap the microphone, then talk in your own time.' : 'Voice services are not connected yet. You can still write to me.'}</p></div>
        <button className={`voice-button voice-${voiceState}`} onClick={handleVoiceClick} disabled={!voiceSupported && voiceState !== 'speaking'} aria-label={voiceLabels[voiceState]}>{voiceState === 'processing' ? <LoaderCircle className="spin" size={34} /> : voiceState === 'speaking' ? <Square size={30} fill="currentColor" /> : voiceState === 'listening' ? <Mic size={36} /> : voiceState === 'error' ? <Mic size={34} /> : <Mic size={36} />}<span>{voiceLabels[voiceState]}</span></button>
        {voiceState === 'speaking' && <button className="stop-audio" onClick={stopAudio}><Square size={16} fill="currentColor" /> Stop audio</button>}
        {voiceError && <p className="voice-error" role="alert">{voiceError}</p>}
      </section>

      <section className="composer" aria-label="Write a message">
        <form onSubmit={(event) => { event.preventDefault(); sendMessage() }}><label className="sr-only" htmlFor="message-input">Write a message</label><input id="message-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Write something here..." disabled={isSending} /><button type="submit" aria-label="Send message" disabled={!input.trim() || isSending}><Send size={23} /></button></form>
        <div className="starter-row" aria-label="Conversation starters">{startersForLanguage.map((starter) => <button key={starter} onClick={() => sendMessage(starter)} disabled={isSending}>{starter}</button>)}</div>
      </section>

      <footer><button className="quiet-button" onClick={() => setIsMuted((value) => !value)} aria-pressed={isMuted}>{isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />} {isMuted ? 'Sound off' : 'Sound on'}</button><span>Your conversation stays on this page.</span><Pause size={16} aria-hidden="true" /></footer>
    </main>
  )
}

export default App
