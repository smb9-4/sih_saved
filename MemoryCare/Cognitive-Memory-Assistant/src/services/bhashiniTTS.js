/**
 * Bhashini TTS Service
 * ---------------------
 * Integrates with the Bhashini (ULCA/Dhruva) API to provide high-quality
 * Text-to-Speech for Indian languages: Hindi, Bengali, Assamese,
 * Manipuri (Meitei), Bodo, and other Northeast languages.
 *
 * Flow:
 *  1. Fetch pipeline config → get serviceId per language (cached)
 *  2. Call inference endpoint with text → get base64 audio
 *  3. Play audio via Audio() element
 */

// ─── API Keys ───────────────────────────────────────────────────────────────
const BHASHINI_UPDATE_KEY = "4056de1605-4860-4a91-ad7b-8a63dbb8a279";
const BHASHINI_INFERENCE_KEY =
  "Kyvhl-2S-mfhow-yfKJWTg0w5laqGqtssYIC0eM0kLP_QMbvh76lS2xYme2XfGU2";

function getSavedUpdateKey() {
  try {
    return localStorage.getItem("bhashiniUpdateKey") || null;
  } catch {
    return null;
  }
}

function getSavedInferenceKey() {
  try {
    return localStorage.getItem("bhashiniInferenceKey") || null;
  } catch {
    return null;
  }
}

function getUpdateKey() {
  return getSavedUpdateKey() || BHASHINI_UPDATE_KEY;
}

function getInferenceKey() {
  return getSavedInferenceKey() || BHASHINI_INFERENCE_KEY;
}

// ─── Endpoints ──────────────────────────────────────────────────────────────
const PIPELINE_CONFIG_URL =
  "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline";
const INFERENCE_URL =
  "https://dhruva-api.bhashini.gov.in/services/inference/pipeline";

// ─── Bhashini-supported languages ───────────────────────────────────────────
const BHASHINI_LANGS = {
  hi: "hi",    // Hindi
  bn: "bn",    // Bengali
  as: "as",    // Assamese
  mni: "mni",  // Manipuri (Meitei)
  brx: "brx",  // Bodo
};

// Female Indic TTS models. Indo-Aryan (hi/bn/as) and misc (mni/brx)
// must not share a serviceId — the wrong family often returns a male
// or off-language voice. IITM covers Assamese/Bodo/Manipuri as backup.
const TTS_SERVICE_IDS = {
  hi: "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
  bn: "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
  as: "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
  mni: "ai4bharat/indic-tts-coqui-misc-gpu--t4",
  brx: "ai4bharat/indic-tts-coqui-misc-gpu--t4",
};

const TTS_SCRIPT_CODES = {
  hi: "Deva",
  bn: "Beng",
  as: "Beng",
  mni: "Beng",
  brx: "Deva",
};

const IITM_TTS_SERVICE = "Bhashini/IITM/TTS";

// ─── Cache ──────────────────────────────────────────────────────────────────
let pipelineConfigCache = null; // { langCode: serviceId }
let configFetchPromise = null;
let lastError = null;

// ─── Public helpers ─────────────────────────────────────────────────────────

/**
 * Returns true if the given language code should use Bhashini TTS.
 */
export function isBhashiniLang(lang) {
  const code = String(lang || "").toLowerCase();
  return Object.prototype.hasOwnProperty.call(BHASHINI_LANGS, code);
}

/**
 * Checks basic online status.
 */
export function checkBhashiniOnline() {
  if (typeof navigator !== "undefined" && "onLine" in navigator) {
    return navigator.onLine;
  }
  return true; // assume online if we can't determine
}

/**
 * Returns the last Bhashini error message (or null).
 */
export function getLastBhashiniError() {
  return lastError;
}

/**
 * Clears the last error.
 */
export function clearBhashiniError() {
  lastError = null;
}

// ─── Pipeline config ────────────────────────────────────────────────────────

/**
 * Fetches the pipeline configuration to get serviceIds for TTS.
 * Result is cached in memory.
 */
async function fetchPipelineConfig() {
  if (pipelineConfigCache) return pipelineConfigCache;

  // Deduplicate concurrent calls
  if (configFetchPromise) return configFetchPromise;

  configFetchPromise = (async () => {
    try {
      const response = await fetch(PIPELINE_CONFIG_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ulcaApiKey: getUpdateKey(),
          userID: getUpdateKey(),
        },
        body: JSON.stringify({
          pipelineTasks: [{ taskType: "tts" }],
          pipelineRequestConfig: {
            pipelineId: "64392f96dadc914b18571",
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Pipeline config failed: ${response.status}`);
      }

      const data = await response.json();
      const configMap = {};

      // Parse the response to extract serviceId per language
      const responseConfig =
        data.pipelineResponseConfig || data.pipelineInferenceAPIEndPoint;
      const taskConfigs =
        responseConfig?.pipelineResponseConfig ||
        data.pipelineResponseConfig ||
        [];

      // Try to find TTS configs
      let ttsConfigs = [];
      if (Array.isArray(taskConfigs)) {
        ttsConfigs = taskConfigs.filter(
          (c) => c.taskType === "tts" || c.config
        );
      }

      // Also check data.languages for available language configs
      if (
        data.languages &&
        Array.isArray(data.languages)
      ) {
        for (const langEntry of data.languages) {
          const srcLang =
            langEntry.sourceLanguage || langEntry.languageCode || "";
          if (BHASHINI_LANGS[srcLang] && langEntry.serviceId) {
            configMap[srcLang] = langEntry.serviceId;
          }
        }
      }

      // Parse from pipelineResponseConfig array
      if (ttsConfigs.length > 0) {
        for (const cfg of ttsConfigs) {
          const languages = cfg.config?.language || cfg.language || [];
          const serviceId = cfg.config?.serviceId || cfg.serviceId;
          if (Array.isArray(languages)) {
            for (const langObj of languages) {
              const src =
                langObj.sourceLanguage || langObj.languageCode || "";
              if (BHASHINI_LANGS[src] && serviceId) {
                configMap[src] = serviceId;
              }
            }
          } else if (typeof languages === "object") {
            const src = languages.sourceLanguage || languages.languageCode || "";
            if (BHASHINI_LANGS[src] && serviceId) {
              configMap[src] = serviceId;
            }
          }
        }
      }

      // Fallback: if the response structure includes pipelineResponseConfig
      // at the top level with different nesting
      if (Object.keys(configMap).length === 0 && data.pipelineResponseConfig) {
        const configs = Array.isArray(data.pipelineResponseConfig)
          ? data.pipelineResponseConfig
          : [data.pipelineResponseConfig];
        for (const cfg of configs) {
          if (cfg.config) {
            for (const taskCfg of Array.isArray(cfg.config)
              ? cfg.config
              : [cfg.config]) {
              const serviceId = taskCfg.serviceId;
              const langList = taskCfg.language?.sourceLanguage
                ? [taskCfg.language.sourceLanguage]
                : [];
              for (const src of langList) {
                if (BHASHINI_LANGS[src] && serviceId) {
                  configMap[src] = serviceId;
                }
              }
            }
          }
        }
      }

      // Store the inference endpoint if provided
      if (data.pipelineInferenceAPIEndPoint?.callbackUrl) {
        configMap._inferenceUrl =
          data.pipelineInferenceAPIEndPoint.callbackUrl;
      }
      if (
        data.pipelineInferenceAPIEndPoint
          ?.inferenceApiKey?.value
      ) {
        configMap._inferenceKey =
          data.pipelineInferenceAPIEndPoint.inferenceApiKey.value;
      }

      pipelineConfigCache = configMap;
      return configMap;
    } catch (err) {
      lastError = `Pipeline config error: ${err.message}`;
      console.warn("[BhashiniTTS] Pipeline config fetch failed:", err);
      return null;
    } finally {
      configFetchPromise = null;
    }
  })();

  return configFetchPromise;
}

// ─── Audio Cache & Session Management ──────────────────────────────────────
const audioCache = new Map(); // key: `${lang}::${text}` -> base64
const MAX_CACHE_ENTRIES = 80;

function getCachedAudio(lang, text) {
  const key = `${lang}::${text}`;
  return audioCache.get(key) || null;
}

function setCachedAudio(lang, text, base64) {
  if (!base64) return;
  const key = `${lang}::${text}`;
  if (audioCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = audioCache.keys().next().value;
    if (oldestKey) audioCache.delete(oldestKey);
  }
  audioCache.set(key, base64);
}

let activeSessionId = 0;
let activeAbortController = null;
const workingServiceCache = {}; // lang -> serviceId that succeeded

// ─── TTS Inference ──────────────────────────────────────────────────────────

/**
 * Calls the Bhashini TTS inference API and returns base64 audio content.
 * @param {string} text - Text to convert to speech
 * @param {string} lang - Language code
 * @param {string} serviceId - Candidate service ID
 * @param {string} inferenceUrl - Endpoint URL
 * @param {string} inferenceKey - Auth key
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<string|null>} base64 audio string or null on failure
 */
function ttsServiceCandidates(lang, config) {
  const remembered = workingServiceCache[lang];
  const ids = [
    remembered,
    TTS_SERVICE_IDS[lang],
    config && config[lang],
    IITM_TTS_SERVICE,
  ];
  return ids.filter((id, index) => id && ids.indexOf(id) === index);
}

async function requestTTSAudio(text, lang, serviceId, inferenceUrl, inferenceKey, signal = null) {
  const language = { sourceLanguage: lang };
  if (TTS_SCRIPT_CODES[lang]) {
    language.sourceScriptCode = TTS_SCRIPT_CODES[lang];
  }

  const payload = {
    pipelineTasks: [
      {
        taskType: "tts",
        config: {
          language,
          ...(serviceId ? { serviceId } : {}),
          gender: "female",
          samplingRate: 22050,
        },
      },
    ],
    inputData: {
      input: [{ source: text }],
    },
  };

  const response = await fetch(inferenceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: inferenceKey,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(`TTS inference failed: ${response.status}`);
  }

  const data = await response.json();
  return (
    data?.pipelineResponse?.[0]?.audio?.[0]?.audioContent ||
    data?.audio?.[0]?.audioContent ||
    data?.pipelineResponse?.[0]?.output?.[0]?.audio?.[0]?.audioContent ||
    null
  );
}

async function fetchTTSAudio(text, lang, signal = null) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return null;

  // Check cache first for INSTANT 0ms playback on repeat
  const cached = getCachedAudio(lang, cleanText);
  if (cached) {
    return cached;
  }

  const config = await fetchPipelineConfig();
  const inferenceUrl = (config && config._inferenceUrl) || INFERENCE_URL;
  const inferenceKey = (config && config._inferenceKey) || getInferenceKey();
  const candidates = ttsServiceCandidates(lang, config);

  for (const serviceId of candidates) {
    if (signal && signal.aborted) return null;
    try {
      const audioContent = await requestTTSAudio(
        cleanText,
        lang,
        serviceId,
        inferenceUrl,
        inferenceKey,
        signal
      );
      if (audioContent) {
        lastError = null;
        workingServiceCache[lang] = serviceId;
        setCachedAudio(lang, cleanText, audioContent);
        return audioContent;
      }
    } catch (err) {
      if (signal && signal.aborted) return null;
      lastError = `TTS error: ${err.message}`;
      console.warn("[BhashiniTTS] Inference error:", serviceId, err);
    }
  }

  if (!lastError) lastError = "No audio content received from Bhashini";
  return null;
}

// ─── Audio playback ─────────────────────────────────────────────────────────

let activeBhashiniAudio = null;

/**
 * Stops any currently playing Bhashini audio and aborts pending fetches.
 */
export function stopBhashiniAudio() {
  activeSessionId++;
  if (activeAbortController) {
    try {
      activeAbortController.abort();
    } catch {
      /* ignore */
    }
    activeAbortController = null;
  }
  if (activeBhashiniAudio) {
    try {
      activeBhashiniAudio.pause();
      activeBhashiniAudio.currentTime = 0;
      activeBhashiniAudio.removeAttribute("src");
      activeBhashiniAudio.load();
    } catch {
      /* ignore */
    }
    activeBhashiniAudio = null;
  }
}

/**
 * Main TTS function. Fetches audio from Bhashini and plays it.
 * Discards any stale in-flight requests to eliminate echoing.
 * @param {string} text - Text to speak
 * @param {string} lang - Language code
 * @param {function} onend - Optional callback when playback ends
 * @returns {Promise<boolean>} true if playback started successfully
 */
export async function bhashiniSpeak(text, lang, onend = null) {
  if (!text || !isBhashiniLang(lang)) {
    if (onend) onend();
    return false;
  }

  if (!checkBhashiniOnline()) {
    lastError = "offline";
    if (onend) onend();
    return false;
  }

  // Stop any previous Bhashini audio & abort in-flight requests immediately
  stopBhashiniAudio();

  const mySessionId = ++activeSessionId;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  activeAbortController = controller;

  try {
    const base64Audio = await fetchTTSAudio(
      String(text).trim(),
      lang,
      controller ? controller.signal : null
    );

    // If another speak was initiated or stop was called, abandon this stale audio
    if (mySessionId !== activeSessionId) {
      return false;
    }

    if (!base64Audio) {
      if (onend && mySessionId === activeSessionId) onend();
      return false;
    }

    // Stop and detach before creating new audio
    if (activeBhashiniAudio) {
      try {
        activeBhashiniAudio.pause();
        activeBhashiniAudio.currentTime = 0;
        activeBhashiniAudio.removeAttribute("src");
      } catch {}
      activeBhashiniAudio = null;
    }

    const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
    activeBhashiniAudio = audio;

    return new Promise((resolve) => {
      audio.onended = () => {
        if (activeBhashiniAudio === audio) {
          activeBhashiniAudio = null;
        }
        if (mySessionId === activeSessionId && onend) {
          onend();
        }
        resolve(true);
      };

      audio.onerror = () => {
        if (activeBhashiniAudio === audio) {
          activeBhashiniAudio = null;
        }
        lastError = "Audio playback error";
        if (mySessionId === activeSessionId && onend) {
          onend();
        }
        resolve(false);
      };

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch((err) => {
          if (activeBhashiniAudio === audio) {
            activeBhashiniAudio = null;
          }
          lastError = `Playback blocked: ${err.name}`;
          if (mySessionId === activeSessionId && onend) {
            onend();
          }
          resolve(false);
        });
      }
    });
  } catch (err) {
    if (mySessionId === activeSessionId) {
      lastError = `bhashiniSpeak error: ${err.message}`;
      if (onend) onend();
    }
    return false;
  }
}

/**
 * Pause Bhashini audio if playing.
 * @returns {boolean} true if was paused
 */
export function pauseBhashiniAudio() {
  if (activeBhashiniAudio && !activeBhashiniAudio.paused) {
    try {
      activeBhashiniAudio.pause();
    } catch {
      /* ignore */
    }
    return true;
  }
  return false;
}

/**
 * Resume Bhashini audio if paused.
 * @returns {boolean} true if was resumed
 */
export function resumeBhashiniAudio() {
  if (activeBhashiniAudio && activeBhashiniAudio.paused) {
    try {
      activeBhashiniAudio.play();
    } catch {
      /* ignore */
    }
    return true;
  }
  return false;
}

/**
 * Check if Bhashini audio is currently playing.
 */
export function isBhashiniPlaying() {
  return (
    activeBhashiniAudio !== null &&
    !activeBhashiniAudio.paused &&
    !activeBhashiniAudio.ended
  );
}

/**
 * Pre-warm: fetch pipeline config early so TTS calls are faster.
 */
export function prewarmBhashiniConfig() {
  if (!checkBhashiniOnline()) return;
  fetchPipelineConfig().catch(() => {});
}
