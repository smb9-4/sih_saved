import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { getAppLanguage } from '../i18n';
import { speak, setVoiceLang, stopSpeaking } from '../services/voice';
import Navigation from '../components/Navigation';
import '../styles/VoiceAssistantScreen.css';

const RECOGNITION_LANG = {
  en: 'en-IN',
  hi: 'hi-IN',
  as: 'as-IN',
  bn: 'bn-IN',
  mni: 'mni-IN',
};

const UI = {
  title: {
    en: 'Voice Assistant',
    hi: 'वॉयस असिस्टेंट',
    as: 'ভইচ সহায়ক',
    bn: 'ভয়েস অ্যাসিস্ট্যান্ট',
    mni: 'খোল অসিস্তন্ত',
  },
  subtitle: {
    en: 'Talk to your healthcare assistant',
    hi: 'अपने स्वास्थ्य सहायक से बात करें',
    as: 'আপোনাৰ স্বাস্থ্য সহায়কৰ সৈতে কথা কওক',
    bn: 'আপনার স্বাস্থ্য সহায়কের সাথে কথা বলুন',
    mni: 'নহগী মাহা পাঁগল সকপগা ৱারী তাবীয়ু',
  },
  listening: {
    en: 'Listening... Speak now',
    hi: 'सुन रही हूँ... अब बोलें',
    as: 'শুনি আছো... এতিয়া কওক',
    bn: 'শুনছি... এখন বলুন',
    mni: 'তাজবি... হৌজিক ৱারী তাবীয়ু',
  },
  tapToSpeak: {
    en: 'Tap the microphone and speak',
    hi: 'माइक्रोफ़ोन पर टैप करें और बोलें',
    as: 'মাইক্ৰফোনত টিপক আৰু কওক',
    bn: 'মাইক্রোফোনে চাপ দিয়ে বলুন',
    mni: 'মাইক্রোফোনদা নম্বীয়ু অমসুং ৱারী তাবীয়ু',
  },
  ready: {
    en: 'Ready to listen...',
    hi: 'सुनने के लिए तैयार...',
    as: 'শুনিবলৈ সাজু...',
    bn: 'শোনার জন্য প্রস্তুত...',
    mni: 'তাজনবা থংগৈদা লৈরি...',
  },
  unsupported: {
    en: 'Voice recognition is not supported in this browser',
    hi: 'इस ब्राउज़र में वॉयस पहचान उपलब्ध नहीं है',
    as: 'এই ব্ৰাউজাৰত ভইচ চিনাক্তকৰণ সমৰ্থিত নহয়',
    bn: 'এই ব্রাউজারে ভয়েস শনাক্তকরণ সমর্থিত নয়',
    mni: 'অসি ব্ৰাউজারদা খোল চিনদ্রকপা থাঙাইখি ইয়াদে',
  },
  youSaid: {
    en: 'You said:',
    hi: 'आपने कहा:',
    as: 'আপুনি ক’লে:',
    bn: 'আপনি বলেছেন:',
    mni: 'নহাক্না হায়খি:',
  },
  assistant: {
    en: 'Assistant:',
    hi: 'सहायक:',
    as: 'সহায়ক:',
    bn: 'সহায়ক:',
    mni: 'সহায়ক:',
  },
  micDenied: {
    en: 'Microphone access was blocked. Please allow microphone permission and try again.',
    hi: 'माइक्रोफ़ोन की अनुमति नहीं मिली। कृपया माइक्रोफ़ोन की अनुमति दें और फिर कोशिश करें।',
    as: 'মাইক্ৰফোন এক্সেছ আটকাৱা হৈছে। অনুগ্ৰহ কৰি মাইক্ৰফোনৰ অনুমতি দি আকৌ চেষ্টা কৰক।',
    bn: 'মাইক্রোফোন অ্যাক্সেস ব্লক হয়েছে। অনুগ্রহ করে মাইক্রোফোন অনুমতি দিন এবং আবার চেষ্টা করুন।',
    mni: 'মাইক্ৰফোন মথাং তাবগী য়াওদে। অনৌতবুনা মাইক্ৰফোনগী অনুমতি পীবিয়ু অমসুং অমুক হন্না হোৎনবীয়ু।',
  },
  noHear: {
    en: 'I could not hear you clearly. Please try again.',
    hi: 'मैं आपको साफ़ नहीं सुन सकी। कृपया फिर से कोशिश करें।',
    as: 'আপোনাক স্পষ্টকৈ শুনা নগ’ল। অনুগ্ৰহ কৰি আকৌ চেষ্টা কৰক।',
    bn: 'আপনাকে স্পষ্ট শোনা যায়নি। আবার চেষ্টা করুন।',
mni: 'নহাক আথিকপনা তাবে। হন্না হোৎনবীয়ু।',
  },
  startError: {
    en: 'I could not start listening. Please try again.',
    hi: 'मैं सुनना शुरू नहीं कर सकी। कृपया फिर से कोशिश करें।',
    as: 'শুনা আৰম্ভ কৰিব পৰা নগ’ল। অনুগ্ৰহ কৰি আকৌ চেষ্টা কৰক।',
    bn: 'শোনা শুরু করা যায়নি। আবার চেষ্টা করুন।',
    mni: 'হৌখিব অমুক হোৎনবীয়ুয়ু।',
  },
  clear: {
    en: 'Clear',
    hi: 'हटाएं',
    as: 'মচক',
    bn: 'মুছুন',
    mni: 'চাইথোকপীয়ু',
  },
  tipsTitle: {
    en: 'Tips',
    hi: 'सुझाव',
    as: 'পৰামৰ্শ',
    bn: 'টিপস',
    mni: 'ৱাহংগী মখোনশিং',
  },
  tips: {
    en: ['Speak clearly and naturally', 'Keep sentences short and simple', 'Try: "Show my reminders" or "Emergency call"'],
    hi: ['साफ़ और सामान्य रूप से बोलें', 'वाक्य छोटे और सरल रखें', 'कहने की कोशिश करें: "रिमाइंडर दिखाएं" या "आपातकाल कॉल"'],
    as: ['স্পষ্ট আৰু স্বাভাৱিকভাৱে কওক', 'বাক্য চুটি আৰু সৰল ৰাখক', 'চেষ্টা কৰক: "ৰিমাইণ্ডাৰ দেখুৱাওক" বা "জৰুৰীকালীন কল"'],
    bn: ['স্পষ্ট ও স্বাভাবিকভাবে বলুন', 'বাক্য ছোট ও সহজ রাখুন', 'চেষ্টা করুন: "রিমাইন্ডার দেখান" বা "জরুরি কল"'],
    mni: ['আথিকপনা অমসুং মরুপ অওইনা ৱারী তাবীয়ু', 'ৱারী অকপা অমসুং অমকপা ওইনা থম্বীয়ু', 'হোৎনবীয়ু: "রিমাইন্ডার দেখান" নত্রগা "জরুরি কল"'],
  },
};

const FALLBACK_RESPONSES = {
  en: ["I'm here to help. What else can I do for you?", "Thank you for telling me. I'll remember that.", 'I understand. Let me help you with that.'],
  hi: ['मैं आपकी मदद के लिए यहाँ हूँ। और क्या कर सकती हूँ?', 'बताने के लिए धन्यवाद। मुझे याद रहेगा।', 'समझ गई। मैं इसमें आपकी मदद करती हूँ।'],
  as: ['আপোনাক সহায় কৰিবলৈ মই ইয়াত আছো। আৰু কি সহায় লাগিব?', 'কোৱাৰ বাবে ধন্যবাদ। মই মনত ৰাখিম।', 'বুজিলো। মই ইয়াত সহায় কৰিম।'],
  bn: ['আপনাকে সাহায্য করতে আমি এখানে আছি। আর কিছু করতে পারি?', 'বলার জন্য ধন্যবাদ। আমি মনে রাখব।', 'বুঝেছি। আমি এতে সাহায্য করব।'],
  mni: ['অহাক্কী মাতেং পীবা য়ুদনা য়াওয়া। করিগুম্বা মাপসা?', 'হায়খিবগী মথকে নুকশি। য়ুমদা থম্বিগনি।', 'খঙলে। অহাক্কী অসিদা মাতেং পীবগনি।'],
};

const INTENT_DEFS = [
  {
    key: 'emergency',
    redirect: '/emergency',
    reply: {
      en: 'Understood. I am taking you to emergency help now.',
      hi: 'समझ गई। अब आपको आपातकालीन मदद के पास ले जा रही हूँ।',
      as: 'বুজিলো। এতিয়া জৰুৰীকালীন সহায়লৈ লৈ যাই আছো।',
      bn: 'বুঝেছি। এখন আপনাকে জরুরি সহায়তায় নিয়ে যাচ্ছি।',
      mni: 'খঙলে। হৌজিক থোক-মুথী মাতেংগী মখনদা পুতলি।',
    },
    patterns: {
      en: /emergency|help me|help!|\bsos\b|call for help|बचाओ/,
      hi: /आपातकाल|आपातकालीन|मदद|सोस|बचाओ|इमरजेंसी/,
      as: /জৰুৰী|সাহায্য|সোছ|উদ্ধাৰ/,
      bn: /জরুরি|সাহায্য|সোছ|উদ্ধার/,
      mni: /চকথোক|থোক-মুথী|মাতেং|এমার্জেন্সি/,
    },
  },
  {
    key: 'reminders',
    redirect: '/reminders',
    reply: {
      en: 'I can help with that. Your daily tasks are in the Reminders section. Opening it for you now.',
      hi: 'मैं इसमें मदद कर सकती हूँ। आपके दैनिक कार्य रिमाइंडर में हैं। अब आपके लिए खोल रही हूँ।',
      as: 'মই ইয়াত সহায় কৰিব পাৰো। আপোনাৰ দৈনিক কাম ৰিমাইণ্ডাৰত আছে। এতিয়া খোলি দিছো।',
      bn: 'আমি এতে সাহায্য করতে পারি। আপনার দৈনিক কাজ রিমাইন্ডারে আছে। এখন খুলে দিচ্ছি।',
      mni: 'অহাক্কী মাতেং পীবা য়াবনে। নহগী নুমিদাঙী থৌরমশিং রিমাইন্ডারদা লৈরি। হৌজিক খঙহনলি।',
    },
    patterns: {
      en: /remind|medication|pill|medicine|medicine time/,
      hi: /रिमाइंडर|दवा|दवाई|गोली|याद दिला|दवा लेनी/,
      as: /ৰিমাইণ্ডাৰ|ঔষধ|গুটি/,
      bn: /রিমাইন্ডার|ওষুধ|ঔষধ|বড়ি/,
      mni: /রিমাইন্ডার|ডবাক|রসই/,
    },
  },
  {
    key: 'schedule',
    redirect: '/reminders',
    reply: {
      en: 'Let me show you today’s schedule.',
      hi: 'मैं आपको आज का शेड्यूल दिखाती हूँ।',
      as: 'আজিৰ দিনটোৰ সময়সূচী দেখুৱাওঁ।',
      bn: 'আজকের সময়সূচী দেখাচ্ছি।',
      mni: 'ঙসিগী মতমশিং উদোক পীবগনি।',
    },
    patterns: {
      en: /schedule|plan|routine|day|task|what.*next|नियमित|काम/,
      hi: /शेड्यूल|दिनचर्या|योजना|रूटीन|काम|आज का/,
      as: /সময়সূচী|দৈনিক|কাম|ৰুটিন/,
      bn: /সময়সূচী|রুটিন|কাজ|দিন/,
      mni: /মতম|থৌরম|চয়োল/,
    },
  },
  {
    key: 'games',
    redirect: '/game',
    reply: {
      en: 'Let me open the games for you.',
      hi: 'मैं आपके लिए खेल खोलती हूँ।',
      as: 'আপোনাৰ বাবে খেলখন খোলি দিছো।',
      bn: 'আপনার জন্য খেলা খুলে দিচ্ছি।',
      mni: 'নহগী শানবা খঙহনলি।',
    },
    patterns: {
      en: /game|play|खेल/,
      hi: /खेल|गेम|खेलना/,
      as: /খেল|শান/,
      bn: /খেলা|গেম/,
      mni: /শানবা|গেম/,
    },
  },
  {
    key: 'breathing',
    redirect: '/breathing',
    reply: {
      en: 'Let me open the breathing exercise for you.',
      hi: 'मैं आपके लिए सांस का अभ्यास खोलती हूँ।',
      as: 'আপোনাৰ বাবে উশাহ-নিশাহৰ অভ্যাস খোলি দিছো।',
      bn: 'আপনার জন্য শ্বাস-প্রশ্বাসের ব্যায়াম খুলে দিচ্ছি।',
      mni: 'নহগী স্বাস হোনবা এক্সরসাইজ খঙহনলি।',
    },
    patterns: {
      en: /breathe|breathing|inhale|exhale|calm|relax/,
      hi: /सांस|सांस लेना|श्वास|शांत|आराम/,
      as: /উশাহ|শ্বাস|শান্ত|জিৰণি/,
      bn: /শ্বাস|শ্বাস-প্রশ্বাস|শান্ত|বিশ্রাম/,
      mni: /স্বাস|হোনবা|তপ্না/,
    },
  },
  {
    key: 'progress',
    redirect: '/progress',
    reply: {
      en: 'Let me show you your recent progress.',
      hi: 'मैं आपको आपकी हाल की प्रगति दिखाती हूँ।',
      as: 'আপোনাৰ শেহতীয়া অগ্ৰগতি দেখুৱাওঁ।',
      bn: 'আপনার সাম্প্রতিক অগ্রগতি দেখাচ্ছি।',
      mni: 'নহগী হন্দক্কী মায়পাকপা উদোক পীবগনি।',
    },
    patterns: {
      en: /progress|score|performance|how am i doing|how did i do/,
      hi: /प्रगति|स्कोर|प्रदर्शन|कैसा|कैसे कर/,
      as: /অগ্ৰগতি|স্ক'ৰ|পৰিৱেশন/,
      bn: /অগ্রগতি|স্কোর|পারফরম্যান্স/,
      mni: /মায়পাকপা|স্কোর|থৌগৎপা/,
    },
  },
];

function pick(patternSet, lang) {
  return patternSet[lang] || patternSet.en || /./;
}

function ui(lang, key) {
  const values = UI[key];
  const value = values[lang] || values.en;
  return Array.isArray(value) ? value : value;
}

function detectIntent(text, lang) {
  const lower = String(text || '').toLowerCase();
  for (const intent of INTENT_DEFS) {
    const pattern = pick(intent.patterns, lang);
    if (pattern.test(lower)) {
      return {
        key: intent.key,
        redirect: intent.redirect,
        text: intent.reply[lang] || intent.reply.en || intent.reply.hi || intent.reply.en,
      };
    }
  }
  const fallbackList = FALLBACK_RESPONSES[lang] || FALLBACK_RESPONSES.en;
  return { key: 'fallback', redirect: null, text: fallbackList[Math.floor(Math.random() * fallbackList.length)] };
}

function VoiceAssistantScreen() {
  const navigate = useNavigate();
  const lang = getAppLanguage();
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [response, setResponse] = useState('');
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    setVoiceLang(lang);
    return () => {
      stopSpeaking();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (error) {
          // ignore
        }
        recognitionRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = () => {
    setRecognizedText('');
    setResponse('');
    setUnsupported(false);
    setIsListening(true);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setUnsupported(true);
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = RECOGNITION_LANG[lang] || 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setRecognizedText(transcript);
      const intent = detectIntent(transcript, lang);
      setResponse(intent.text);
      if (intent.redirect) {
        speak(intent.text);
        window.setTimeout(() => navigate(intent.redirect), 1600);
      } else {
        speak(intent.text);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setResponse(ui(lang, 'micDenied'));
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setResponse(ui(lang, 'noHear'));
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (error) {
      setIsListening(false);
      setResponse(ui(lang, 'startError'));
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        // ignore
      }
    }
    setIsListening(false);
  };

  const handleMicrophoneClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleClear = () => {
    stopListening();
    setRecognizedText('');
    setResponse('');
    setUnsupported(false);
    stopSpeaking();
  };

  const tips = ui(lang, 'tips');

  return (
    <div className="voice-page">
      <div className="voice-container">
        <div className="voice-content">
          <div className="voice-header">
            <h1 className="voice-title">{ui(lang, 'title')}</h1>
            <p className="voice-subtitle">{ui(lang, 'subtitle')}</p>
          </div>

          <div className="voice-main">
            <div className={`microphone-circle ${isListening ? 'listening' : ''}`}>
              <button
                className="mic-button"
                onClick={handleMicrophoneClick}
              >
                {isListening ? <MicOff size={60} /> : <Mic size={60} />}
              </button>
              {isListening && <div className="listening-indicator">{ui(lang, 'listening')}</div>}
            </div>

            <p className="voice-instruction">
              {isListening ? ui(lang, 'listening') : ui(lang, 'tapToSpeak')}
            </p>

            <div className="voice-display">
              {recognizedText && (
                <div className="recognized-text">
                  <p className="label">{ui(lang, 'youSaid')}</p>
                  <p className="text">"{recognizedText}"</p>
                </div>
              )}

              {response && (
                <div className="response-text">
                  <p className="label">{ui(lang, 'assistant')}</p>
                  <p className="text">"{response}"</p>
                </div>
              )}

              {!recognizedText && !response && (
                <div className="empty-prompt">
                  <Volume2 size={48} />
                  <p>{unsupported ? ui(lang, 'unsupported') : ui(lang, 'ready')}</p>
                </div>
              )}
            </div>

            {(recognizedText || response) && (
              <button className="clear-btn" onClick={handleClear}>
                {ui(lang, 'clear')}
              </button>
            )}
          </div>

          <div className="voice-tips">
            <h3>{ui(lang, 'tipsTitle')}</h3>
            <ul>
              {tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <Navigation />
    </div>
  );
}

export default VoiceAssistantScreen;