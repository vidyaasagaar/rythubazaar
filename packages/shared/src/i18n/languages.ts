export const LANGUAGE_CODES = ['te-IN', 'ta-IN', 'kn-IN', 'ml-IN', 'hi-IN', 'en-IN'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const FALLBACK_LANGUAGE: LanguageCode = 'en-IN';

/** Intents the rules-based (demo) interpreter can recognise from speech/typed input. */
export const SPEECH_INTENTS = [
  'FARMER_SERVICES',
  'ORDER_STATUS',
  'SUPPORT',
  'CONFIRM',
  'CANCEL',
  'REPEAT',
  'BACK',
] as const;
export type SpeechIntent = (typeof SPEECH_INTENTS)[number];

export interface LanguageMeta {
  code: LanguageCode;
  englishName: string;
  nativeName: string;
  /** Keypad digit used in the IVR language menu. */
  ivrKey: string;
  /** BCP-47 locale passed to the browser SpeechRecognition API. */
  speechLocale: string;
  /** BCP-47 locale used to pick a SpeechSynthesis voice. */
  ttsLocale: string;
  script: string;
  /**
   * Capability status as verified in this build. Speech recognition and TTS depend on the
   * browser/OS voices installed, so the app detects them at runtime and falls back to text
   * and keypad. Nothing here claims a capability works until it is tested on a device.
   */
  capabilities: {
    ui: 'SUPPORTED';
    ivrText: 'SUPPORTED';
    speechRecognition: 'RUNTIME_DETECTED_UNVERIFIED';
    textToSpeech: 'RUNTIME_DETECTED_UNVERIFIED';
  };
  knownLimitations: string[];
  /** Sample utterances per intent, used by the rules interpreter and its tests. */
  sampleUtterances: Record<SpeechIntent, string[]>;
}

const runtime = {
  ui: 'SUPPORTED',
  ivrText: 'SUPPORTED',
  speechRecognition: 'RUNTIME_DETECTED_UNVERIFIED',
  textToSpeech: 'RUNTIME_DETECTED_UNVERIFIED',
} as const;

const reviewNote =
  'Translations are authored for the demo and need review by a native speaker before launch.';

export const LANGUAGES: Record<LanguageCode, LanguageMeta> = {
  'te-IN': {
    code: 'te-IN',
    englishName: 'Telugu',
    nativeName: 'తెలుగు',
    ivrKey: '1',
    speechLocale: 'te-IN',
    ttsLocale: 'te-IN',
    script: 'Telugu',
    capabilities: runtime,
    knownLimitations: [reviewNote, 'Many desktop browsers ship no Telugu TTS voice.'],
    sampleUtterances: {
      FARMER_SERVICES: ['రైతు', 'రైతు సేవలు', 'అమ్మాలి'],
      ORDER_STATUS: ['ఆర్డర్', 'ఆర్డర్ స్థితి'],
      SUPPORT: ['సహాయం', 'సపోర్ట్'],
      CONFIRM: ['అవును', 'సరే', 'సేవ్ చేయండి'],
      CANCEL: ['వద్దు', 'రద్దు'],
      REPEAT: ['మళ్ళీ', 'మళ్ళీ చెప్పండి'],
      BACK: ['వెనక్కి', 'మెనూ'],
    },
  },
  'ta-IN': {
    code: 'ta-IN',
    englishName: 'Tamil',
    nativeName: 'தமிழ்',
    ivrKey: '2',
    speechLocale: 'ta-IN',
    ttsLocale: 'ta-IN',
    script: 'Tamil',
    capabilities: runtime,
    knownLimitations: [reviewNote, 'Tamil TTS voice availability varies by OS.'],
    sampleUtterances: {
      FARMER_SERVICES: ['விவசாயி', 'விவசாயி சேவைகள்', 'விற்க'],
      ORDER_STATUS: ['ஆர்டர்', 'ஆர்டர் நிலை'],
      SUPPORT: ['உதவி'],
      CONFIRM: ['ஆம்', 'சரி', 'சேமி'],
      CANCEL: ['வேண்டாம்', 'ரத்து'],
      REPEAT: ['மீண்டும்'],
      BACK: ['பின்', 'மெனு'],
    },
  },
  'kn-IN': {
    code: 'kn-IN',
    englishName: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    ivrKey: '3',
    speechLocale: 'kn-IN',
    ttsLocale: 'kn-IN',
    script: 'Kannada',
    capabilities: runtime,
    knownLimitations: [reviewNote, 'Kannada TTS voice availability varies by OS.'],
    sampleUtterances: {
      FARMER_SERVICES: ['ರೈತ', 'ರೈತ ಸೇವೆಗಳು', 'ಮಾರಾಟ'],
      ORDER_STATUS: ['ಆರ್ಡರ್', 'ಆರ್ಡರ್ ಸ್ಥಿತಿ'],
      SUPPORT: ['ಸಹಾಯ'],
      CONFIRM: ['ಹೌದು', 'ಸರಿ', 'ಉಳಿಸಿ'],
      CANCEL: ['ಬೇಡ', 'ರದ್ದು'],
      REPEAT: ['ಮತ್ತೆ'],
      BACK: ['ಹಿಂದಕ್ಕೆ', 'ಮೆನು'],
    },
  },
  'ml-IN': {
    code: 'ml-IN',
    englishName: 'Malayalam',
    nativeName: 'മലയാളം',
    ivrKey: '4',
    speechLocale: 'ml-IN',
    ttsLocale: 'ml-IN',
    script: 'Malayalam',
    capabilities: runtime,
    knownLimitations: [reviewNote, 'Malayalam TTS voice availability varies by OS.'],
    sampleUtterances: {
      FARMER_SERVICES: ['കർഷകൻ', 'കർഷക സേവനങ്ങൾ', 'വിൽക്കണം'],
      ORDER_STATUS: ['ഓർഡർ', 'ഓർഡർ നില'],
      SUPPORT: ['സഹായം'],
      CONFIRM: ['അതെ', 'ശരി', 'സേവ്'],
      CANCEL: ['വേണ്ട', 'റദ്ദാക്കുക'],
      REPEAT: ['വീണ്ടും'],
      BACK: ['പിന്നോട്ട്', 'മെനു'],
    },
  },
  'hi-IN': {
    code: 'hi-IN',
    englishName: 'Hindi',
    nativeName: 'हिंदी',
    ivrKey: '5',
    speechLocale: 'hi-IN',
    ttsLocale: 'hi-IN',
    script: 'Devanagari',
    capabilities: runtime,
    knownLimitations: [reviewNote],
    sampleUtterances: {
      FARMER_SERVICES: ['किसान', 'किसान सेवाएँ', 'बेचना'],
      ORDER_STATUS: ['ऑर्डर', 'ऑर्डर की स्थिति'],
      SUPPORT: ['सहायता', 'मदद'],
      CONFIRM: ['हाँ', 'हां', 'ठीक है', 'सहेजें'],
      CANCEL: ['नहीं', 'रद्द'],
      REPEAT: ['दोबारा', 'फिर से'],
      BACK: ['पीछे', 'मेनू'],
    },
  },
  'en-IN': {
    code: 'en-IN',
    englishName: 'English',
    nativeName: 'English',
    ivrKey: '6',
    speechLocale: 'en-IN',
    ttsLocale: 'en-IN',
    script: 'Latin',
    capabilities: runtime,
    knownLimitations: [],
    sampleUtterances: {
      FARMER_SERVICES: ['farmer', 'farmer services', 'sell'],
      ORDER_STATUS: ['order', 'order status', 'track'],
      SUPPORT: ['support', 'help'],
      CONFIRM: ['yes', 'confirm', 'save', 'okay'],
      CANCEL: ['no', 'cancel'],
      REPEAT: ['repeat', 'again'],
      BACK: ['back', 'menu'],
    },
  },
};

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGE_CODES as readonly string[]).includes(value);
}

export function resolveLanguage(value: unknown): LanguageCode {
  return isLanguageCode(value) ? value : FALLBACK_LANGUAGE;
}
