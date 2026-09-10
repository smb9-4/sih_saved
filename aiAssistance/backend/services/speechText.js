const emojiPattern = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu

export function sanitizeTextForSpeech(text, language) {
  if (typeof text !== 'string') return ''

  let speechText = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    .replace(emojiPattern, '')

  speechText = speechText
    .replace(/([!?])+/g, '.')
    .replace(/\s*#\s*/g, ' ')
    .replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2')
    .replace(/(\d)\s*=\s*(\d)/g, '$1 equals $2')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1 divided by $2')
    .replace(/(^|\s)\*+(?=\s|$)/g, '$1')
    .replace(/(^|\s)\/(?!\S)/g, '$1')
    .replace(/[\u2022\u2023\u25E6\u00B7]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return language ? speechText : speechText
}