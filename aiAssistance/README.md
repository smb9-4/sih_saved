# Dementia Companion

A simple AI companion for older adults who may have memory difficulties. It supports calm text and voice conversations in English, Hindi, Assamese, and Bengali.

## What We Built

- Accessible, large-text conversational interface.
- Gemini-powered companion responses through a secure backend.
- BHASHINI speech-to-text and text-to-speech.
- Language-specific AI responses and voices.
- Conversation starters and a large **Tap to Speak** button.
- Friendly fallbacks when voice or network services fail.
- TTS cleanup for emojis, Markdown, code, and decorative symbols.

## Technology

- Frontend: React and Vite
- Backend: Node.js and Express
- AI: Google Gemini Flash
- Voice: BHASHINI

## Setup

Requirements: Node.js 18+ and npm.

```sh
npm run install:all
```

## Run

```sh
npm run dev
```

Open http://localhost:5173.

The backend uses `gemini-3.6-flash` by default. Voice requires microphone permission and valid BHASHINI credentials. Text chat remains available if voice fails.