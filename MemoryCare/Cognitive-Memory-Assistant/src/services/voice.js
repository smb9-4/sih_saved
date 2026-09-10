import { VOICE_PHRASES } from "../voicePhrases";
import {
  isBhashiniLang,
  bhashiniSpeak,
  stopBhashiniAudio,
  pauseBhashiniAudio,
  resumeBhashiniAudio,
  isBhashiniPlaying,
} from "./bhashiniTTS";

const LANG_MAP = {
  en: "en-IN",
  hi: "hi-IN",
  as: "as-IN",
  bn: "bn-IN",
  mni: "mni-IN",
};

const REMOTE_LOCALES = {
  en: "en",
  hi: "hi",
  bn: "bn",
  as: "as",
  mni: "mni",
};

let currentLang = "en";
let lastSpokenText = "";
let speakGeneration = 0;
let activeUtterance = null;
let activeAudio = null;
let speakTimer = 0;
let repeatSettleTimer = 0;
let pausedByUser = false;
let resumeFallbackTimer = 0;
let resumeWatch = 0;
let voicesCache = [];
let voicesAttached = false;
let pendingRemote = null;
let unlockAttached = false;
let useAnyVoiceFallback = false;
let skipBundleOnce = false;
let voicesFinalCount = 0;

function refreshVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return voicesCache;
  const list = window.speechSynthesis.getVoices() || [];
  if (list.length) voicesCache = list;
  if (!voicesAttached) {
    voicesAttached = true;
    try {
      window.speechSynthesis.addEventListener("voiceschanged", () => {
        const updated = window.speechSynthesis.getVoices() || [];
        if (updated.length) voicesCache = updated;
      });
    } catch {
      /* ignore */
    }
  }
  return voicesCache;
}

function ensureResumeWatch() {
  if (resumeWatch || !("speechSynthesis" in window)) return;
  resumeWatch = window.setInterval(() => {
    try {
      if (!pausedByUser && window.speechSynthesis.speaking && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch {
      /* ignore */
    }
  }, 250);
}

export function setVoiceLang(lang) {
  currentLang = Object.prototype.hasOwnProperty.call(LANG_MAP, lang) ? lang : "en";
  refreshVoices();
}

export function getVoiceLang() {
  return currentLang;
}

function voiceMatchesLang(voice, langCode) {
  const code = String(langCode || currentLang).toLowerCase();
  const mapped = String(LANG_MAP[code] || "").toLowerCase();
  const lang = String(voice.lang || "").toLowerCase();
  if (!lang) return false;
  if (mapped && (lang === mapped || lang.startsWith(`${mapped}-`) || lang.startsWith(mapped))) {
    return true;
  }
  return lang === code || lang.startsWith(`${code}-`);
}

function isLikelyFemaleVoice(voice) {
  const blob = `${voice.name || ""} ${voice.voiceURI || ""}`.toLowerCase();
  if (/\b(male|man|boy|madhur|prabhat|bashkar|priyom|ravi)\b/.test(blob)) return false;
  if (String(voice.gender || "").toLowerCase() === "female") return true;
  return /\b(female|woman|girl|swara|neerja|tanishaa|yashica|zira|samantha|heera|kalpana)\b/.test(blob);
}

function pickFemaleMatch(list) {
  if (!list.length) return null;
  return list.find(isLikelyFemaleVoice) || list[0];
}

export function hasVoiceFor(lang) {
  return refreshVoices().some((voice) => voiceMatchesLang(voice, lang || currentLang));
}

export function canSpeak(lang) {
  const code = String(lang || currentLang).toLowerCase();
  if (REMOTE_LOCALES[code] || isBhashiniLang(code)) return true;
  return hasVoiceFor(code);
}

function remoteUrl(text, lang) {
  const locale = REMOTE_LOCALES[lang];
  if (!locale) return null;
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${locale}&q=${encodeURIComponent(
    String(text).slice(0, 200)
  )}`;
}

function attachGestureUnlock() {
  if (unlockAttached || typeof document === "undefined") return;
  unlockAttached = true;
  const tryPlay = () => {
    const item = pendingRemote;
    if (!item) return;
    pendingRemote = null;
    const { audio, onend, generation } = item;
    if (!audio || generation !== speakGeneration) {
      if (onend) onend();
      return;
    }
    const promise = audio.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch(() => {
        if (activeAudio === audio) activeAudio = null;
        if (onend) onend();
      });
    }
  };
  document.addEventListener("pointerdown", tryPlay, { capture: true });
  document.addEventListener("touchstart", tryPlay, { capture: true });
  document.addEventListener("keydown", tryPlay, { capture: true });
}

function speakRemote(text, generation, onend) {
  const url = remoteUrl(text, currentLang);
  if (!url) return false;
  try {
    const audio = new Audio();
    audio.src = url;
    audio.preload = "auto";
    activeAudio = audio;
    const clear = () => {
      if (activeAudio === audio) activeAudio = null;
    };
    const okEnd = () => {
      clear();
      logDebug("remote", `played ${currentLang}`);
      if (generation === speakGeneration && onend) onend();
    };
    audio.onended = okEnd;
    audio.onerror = () => {
      clear();
      logDebug("remote", `audio error for ${currentLang}`);
      if (pendingRemote && pendingRemote.audio === audio) pendingRemote = null;
      if (generation === speakGeneration) {
        useAnyVoiceFallback = true;
        startUtterance(text, generation, onend);
      } else if (onend) onend();
    };
    const promise = audio.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch((err) => {
        if (generation !== speakGeneration) {
          clear();
          return;
        }
        const blocked = err && (err.name === "NotAllowedError" || err.name === "AbortError");
        if (blocked) {
          logDebug("remote", `autoplay blocked for ${currentLang}, waiting for tap`);
          pendingRemote = { audio, onend, generation };
          attachGestureUnlock();
          window.setTimeout(() => {
            if (pendingRemote && pendingRemote.generation === generation) {
              pendingRemote = null;
              clear();
              useAnyVoiceFallback = true;
              startUtterance(text, generation, onend);
            }
          }, 2500);
          return;
        }
        logDebug("remote", `play rejected (${err && err.name}) for ${currentLang}`);
        clear();
        useAnyVoiceFallback = true;
        startUtterance(text, generation, onend);
      });
    }
    return true;
  } catch {
    activeAudio = null;
    return false;
  }
}

const debugLog = [];
function logDebug(message, extra) {
  debugLog.push({
    t: new Date().toISOString().slice(11, 19),
    m: message,
    x: extra != null ? String(extra) : "",
  });
  if (debugLog.length > 20) debugLog.shift();
}

function pickExactOrPrefix() {
  const voices = refreshVoices();
  if (!voices.length) return null;
  const matches = voices.filter((v) => voiceMatchesLang(v, currentLang));
  return pickFemaleMatch(matches);
}

function emitSpeech(text, generation, onend) {
  if (generation !== speakGeneration) return;

  // ── Bhashini TTS: highest priority for Indian languages ──
  if (isBhashiniLang(currentLang)) {
    logDebug("speak", `trying Bhashini TTS for ${currentLang}`);
    bhashiniSpeak(text, currentLang, () => {
      if (generation === speakGeneration && onend) onend();
    }).then((ok) => {
      if (generation !== speakGeneration) return;
      if (!ok) {
        logDebug("speak", `Bhashini failed for ${currentLang}, falling back`);
        // Fall back to remote Google TTS → local SpeechSynthesis
        emitSpeechFallback(text, generation, onend);
      }
    });
    return;
  }

  emitSpeechFallback(text, generation, onend);
}

/** Original emit logic, now used as fallback when Bhashini unavailable */
function emitSpeechFallback(text, generation, onend) {
  if (generation !== speakGeneration) return;

  const remote = remoteUrl(text, currentLang);

  const scheduleLocal = () => {
    const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isiOS) {
      startUtterance(text, generation, onend);
      return;
    }
    speakTimer = window.setTimeout(() => {
      speakTimer = 0;
      startUtterance(text, generation, onend);
    }, 80);
  };

  if (!("speechSynthesis" in window)) {
    if (remote) {
      logDebug("speak", `no speechSynthesis, using remote (${currentLang})`);
      speakRemote(text, generation, onend);
    } else {
      logDebug("speak", `no speechSynthesis and no remote for ${currentLang}`);
      if (onend) onend();
    }
    return;
  }

  const voices = refreshVoices();
  const matching = !!pickExactOrPrefix();

  if (matching) {
    logDebug("speak", `local voice for ${currentLang} (${voices.length} voices)`);
    scheduleLocal();
    return;
  }

  if (remote) {
    logDebug("speak", `no ${currentLang} voice in list; trying remote audio first`);
    if (speakRemote(text, generation, onend)) {
      return;
    }
    logDebug("speak", `remote unavailable; falling back to local TTS`);
  }

  useAnyVoiceFallback = true;
  scheduleLocal();
}

function startUtterance(text, generation, onend) {
  if (generation !== speakGeneration) return;
  if (!("speechSynthesis" in window)) {
    if (onend) onend();
    return;
  }
  ensureResumeWatch();

  const voices = refreshVoices();
  if (!voices.length) {
    window.setTimeout(() => startUtterance(text, generation, onend), 250);
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LANG_MAP[currentLang];
  const indianFemale = Object.prototype.hasOwnProperty.call(LANG_MAP, currentLang)
    && currentLang !== "en";
  utterance.rate = indianFemale ? 0.85 : 0.9;
  utterance.pitch = indianFemale ? 1.05 : 1;
  utterance.volume = 1;
  const voice = pickExactOrPrefix()
    || (useAnyVoiceFallback ? pickFemaleMatch(voices) : null);
  if (voice) utterance.voice = voice;
  if (useAnyVoiceFallback) {
    logDebug(
      "utterance",
      `fallback voice ${voice ? voice.name : "none"} for ${currentLang}, lang=${utterance.lang}`
    );
  }

  utterance.onend = () => {
    if (activeUtterance === utterance) activeUtterance = null;
    if (generation === speakGeneration && onend) onend();
  };
  utterance.onerror = (event) => {
    if (activeUtterance === utterance) activeUtterance = null;
    logDebug("utterance", `error (${event && event.error ? event.error : "unknown"}) for ${currentLang}`);
  };

  activeUtterance = utterance;
  window.speechSynthesis.speak(utterance);
  try {
    window.speechSynthesis.resume();
  } catch {
    /* ignore */
  }
}

function findBundleKey(lang, text) {
  const pack = VOICE_PHRASES[lang];
  if (!pack) return null;
  for (const key of Object.keys(pack)) {
    if (pack[key] === text) return key;
  }
  return null;
}

function playBundle(lang, key, text, generation, onend) {
  try {
    const base = process.env.PUBLIC_URL || "";
    const audio = new Audio();
    audio.src = `${base}/voice/${lang}/${key}.mp3`;
    audio.preload = "auto";
    activeAudio = audio;
    const clear = () => {
      if (activeAudio === audio) activeAudio = null;
    };
    audio.onended = () => {
      clear();
      if (generation === speakGeneration && onend) onend();
    };
    audio.onerror = () => {
      clear();
      logDebug("bundle", `error ${lang}/${key}, fallback to TTS`);
      if (generation === speakGeneration) {
        skipBundleOnce = true;
        speak(text, onend);
      }
    };
    const promise = audio.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch((err) => {
        clear();
        const blocked = err && (err.name === "NotAllowedError" || err.name === "AbortError");
        if (blocked) {
          logDebug("bundle", `autoplay blocked ${lang}/${key}, waiting for tap`);
          pendingRemote = { audio, onend, generation };
          attachGestureUnlock();
        } else if (generation === speakGeneration) {
          skipBundleOnce = true;
          speak(text, onend);
        }
      });
    }
    logDebug("bundle", `playing ${lang}/${key}.mp3`);
    return true;
  } catch {
    return false;
  }
}

function playBundleText(text, generation, onend) {
  const key = findBundleKey(currentLang, text);
  if (!key) return false;
  return playBundle(currentLang, key, text, generation, onend);
}

export function speak(text, onend = null) {
  if (text == null) return;
  const next = String(text).trim();
  if (!next) return;

  const generation = ++speakGeneration;
  lastSpokenText = next;
  useAnyVoiceFallback = false;
  pausedByUser = false;
  if (resumeFallbackTimer) {
    window.clearTimeout(resumeFallbackTimer);
    resumeFallbackTimer = 0;
  }
  if (repeatSettleTimer) {
    window.clearTimeout(repeatSettleTimer);
    repeatSettleTimer = 0;
  }
  if (speakTimer) {
    window.clearTimeout(speakTimer);
    speakTimer = 0;
  }
  voicesFinalCount = voicesCache.length;

  activeUtterance = null;
  hardStopAudio();
  hardCancelSpeechSynthesis();
  // Stop any Bhashini audio too
  stopBhashiniAudio();

  const tryBundle = !skipBundleOnce;
  skipBundleOnce = false;
  if (tryBundle && playBundleText(next, generation, onend)) {
    return;
  }

  // If Indian language, Bhashini is used directly without waiting for local synthesis voices
  if (isBhashiniLang(currentLang)) {
    emitSpeech(next, generation, onend);
    return;
  }

  if (!("speechSynthesis" in window)) {
    if (onend) onend();
    return;
  }

  // Chrome reports voices asynchronously; wait a moment for the list before deciding.
  let waited = 0;
  const begin = () => {
    if (generation !== speakGeneration) return;
    if (!voicesCache.length && waited < 6) {
      waited += 1;
      window.setTimeout(begin, 250);
      return;
    }
    voicesFinalCount = voicesCache.length;
    logDebug(
      "speak",
      `${next.slice(0, 40)} | lang=${currentLang} | voices=${voicesFinalCount}`
    );
    emitSpeech(next, generation, onend);
  };
  begin();
}

export function speakKey(lang, key, text = null) {
  const pack = VOICE_PHRASES[lang];
  const phrase = pack && Object.prototype.hasOwnProperty.call(pack, key) ? pack[key] : null;
  if (phrase) {
    speak(phrase);
    return;
  }
  if (text != null) {
    speak(text);
  }
}

export function speakSequence(texts) {
  const sequence = texts
    .filter((text) => text != null)
    .map((text) => String(text).trim())
    .filter(Boolean)
    .join(" ");
  if (sequence) speak(sequence);
}

let customRepeatHandler = null;

export function registerRepeatHandler(fn) {
  customRepeatHandler = fn;
  return () => {
    if (customRepeatHandler === fn) {
      customRepeatHandler = null;
    }
  };
}

let lastRepeatTimestamp = 0;

export function repeatLast() {
  const now = Date.now();
  if (now - lastRepeatTimestamp < 250) {
    return; // Ignore accidental spam clicks within 250ms
  }
  lastRepeatTimestamp = now;

  stopSpeaking();

  // Some Android WebViews need a beat for cancel() to take effect before a
  // new utterance starts; otherwise the previous voice keeps playing over
  // the new one. Settle is short enough to be imperceptible.
  repeatSettleTimer = window.setTimeout(() => {
    repeatSettleTimer = 0;
    if (typeof customRepeatHandler === 'function') {
      customRepeatHandler();
      return;
    }
    if (!lastSpokenText) return;
    speak(lastSpokenText);
  }, 50);
}

export function isSpeechPaused() {
  return pausedByUser;
}

export function toggleSpeaking() {
  // Handle Bhashini audio pause/resume
  if (isBhashiniPlaying()) {
    pausedByUser = true;
    pauseBhashiniAudio();
    return true;
  }
  if (pausedByUser && resumeBhashiniAudio()) {
    pausedByUser = false;
    return false;
  }

  if (activeAudio) {
    if (pausedByUser) {
      pausedByUser = false;
      try {
        activeAudio.play();
      } catch {
        /* ignore */
      }
      return false;
    }
    pausedByUser = true;
    try {
      activeAudio.pause();
    } catch {
      /* ignore */
    }
    return true;
  }

  if (!("speechSynthesis" in window)) return false;

  // If speech is currently speaking, pause it
  if (window.speechSynthesis.speaking && !pausedByUser) {
    pausedByUser = true;
    try {
      window.speechSynthesis.pause();
    } catch {
      /* ignore */
    }
    return true;
  }

  // If it was paused by user, resume it
  if (pausedByUser) {
    pausedByUser = false;
    try {
      window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }
    if (resumeFallbackTimer) window.clearTimeout(resumeFallbackTimer);
    const phrase = lastSpokenText;
    resumeFallbackTimer = window.setTimeout(() => {
      resumeFallbackTimer = 0;
      if (!window.speechSynthesis.speaking || window.speechSynthesis.paused) {
        if (typeof customRepeatHandler === 'function') {
          customRepeatHandler();
        } else if (phrase) {
          speak(phrase);
        }
      }
    }, 1500);
    return false;
  }

  // If not currently speaking and not paused, clicking play triggers repeat/speak
  if (!window.speechSynthesis.speaking) {
    pausedByUser = false;
    if (typeof customRepeatHandler === 'function') {
      customRepeatHandler();
    } else if (lastSpokenText) {
      speak(lastSpokenText);
    }
    return false;
  }

  pausedByUser = true;
  try {
    window.speechSynthesis.pause();
  } catch {
    /* ignore */
  }
  return true;
}

function hardStopAudio() {
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.removeAttribute("src");
      activeAudio.load();
    } catch {
      /* ignore */
    }
    activeAudio = null;
  }
  if (pendingRemote && pendingRemote.audio) {
    try {
      pendingRemote.audio.pause();
      pendingRemote.audio.removeAttribute("src");
      pendingRemote.audio.load();
    } catch {
      /* ignore */
    }
  }
  pendingRemote = null;
}

function hardCancelSpeechSynthesis() {
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
  } catch {
    /* ignore */
  }
}

export function stopSpeaking() {
  ++speakGeneration;
  pausedByUser = false;
  useAnyVoiceFallback = false;
  if (speakTimer) {
    window.clearTimeout(speakTimer);
    speakTimer = 0;
  }
  if (repeatSettleTimer) {
    window.clearTimeout(repeatSettleTimer);
    repeatSettleTimer = 0;
  }
  if (resumeFallbackTimer) {
    window.clearTimeout(resumeFallbackTimer);
    resumeFallbackTimer = 0;
  }
  activeUtterance = null;
  hardStopAudio();
  // Stop Bhashini audio
  stopBhashiniAudio();

  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
  } catch {
    /* ignore */
  }
}

export function getVoiceDebug() {
  const voices = refreshVoices();
  if (!voicesCache.length && voices.length) voicesCache = voices;
  return {
    supported: typeof window !== "undefined" && "speechSynthesis" in window,
    currentLang,
    voices: voicesCache.slice(0, 40).map((v) => `${v.name} (${v.lang})`),
    voicesFinalCount,
    entries: debugLog.slice(),
  };
}

try {
  if (typeof window !== "undefined") {
    window.__voiceDebug = getVoiceDebug;
  }
} catch {
  /* ignore */
}