import type { Category, Unit } from '../domain';
import type { LanguageCode } from './languages';

export interface CropEntry {
  key: string;
  /** Keypad digit in the IVR crop menu. */
  ivrKey: string;
  category: Category;
  defaultUnit: Unit;
  names: Record<LanguageCode, string>;
  /** Extra spoken forms the rules interpreter accepts. */
  synonyms: string[];
}

/** Crops offered in the IVR listing journey (keypad 1–8). */
export const IVR_CROPS: readonly CropEntry[] = [
  {
    key: 'TOMATO',
    ivrKey: '1',
    category: 'VEGETABLES',
    defaultUnit: 'KG',
    names: {
      'te-IN': 'టమాటా',
      'ta-IN': 'தக்காளி',
      'kn-IN': 'ಟೊಮ್ಯಾಟೊ',
      'ml-IN': 'തക്കാളി',
      'hi-IN': 'टमाटर',
      'en-IN': 'Tomato',
    },
    synonyms: ['tomato', 'tomatoes', 'టమోటా'],
  },
  {
    key: 'ONION',
    ivrKey: '2',
    category: 'VEGETABLES',
    defaultUnit: 'KG',
    names: {
      'te-IN': 'ఉల్లిపాయ',
      'ta-IN': 'வெங்காயம்',
      'kn-IN': 'ಈರುಳ್ಳಿ',
      'ml-IN': 'ഉള്ളി',
      'hi-IN': 'प्याज़',
      'en-IN': 'Onion',
    },
    synonyms: ['onion', 'onions', 'प्याज'],
  },
  {
    key: 'BRINJAL',
    ivrKey: '3',
    category: 'VEGETABLES',
    defaultUnit: 'KG',
    names: {
      'te-IN': 'వంకాయ',
      'ta-IN': 'கத்தரிக்காய்',
      'kn-IN': 'ಬದನೆಕಾಯಿ',
      'ml-IN': 'വഴുതന',
      'hi-IN': 'बैंगन',
      'en-IN': 'Brinjal',
    },
    synonyms: ['brinjal', 'eggplant'],
  },
  {
    key: 'OKRA',
    ivrKey: '4',
    category: 'VEGETABLES',
    defaultUnit: 'KG',
    names: {
      'te-IN': 'బెండకాయ',
      'ta-IN': 'வெண்டைக்காய்',
      'kn-IN': 'ಬೆಂಡೆಕಾಯಿ',
      'ml-IN': 'വെണ്ടയ്ക്ക',
      'hi-IN': 'भिंडी',
      'en-IN': 'Okra',
    },
    synonyms: ['okra', 'ladies finger', "lady's finger"],
  },
  {
    key: 'GREEN_CHILLI',
    ivrKey: '5',
    category: 'VEGETABLES',
    defaultUnit: 'KG',
    names: {
      'te-IN': 'పచ్చిమిర్చి',
      'ta-IN': 'பச்சை மிளகாய்',
      'kn-IN': 'ಹಸಿರು ಮೆಣಸಿನಕಾಯಿ',
      'ml-IN': 'പച്ചമുളക്',
      'hi-IN': 'हरी मिर्च',
      'en-IN': 'Green chilli',
    },
    synonyms: ['chilli', 'chili', 'green chilli', 'मिर्च'],
  },
  {
    key: 'BANANA',
    ivrKey: '6',
    category: 'FRUITS',
    defaultUnit: 'DOZEN',
    names: {
      'te-IN': 'అరటి పండు',
      'ta-IN': 'வாழைப்பழம்',
      'kn-IN': 'ಬಾಳೆಹಣ್ಣು',
      'ml-IN': 'വാഴപ്പഴം',
      'hi-IN': 'केला',
      'en-IN': 'Banana',
    },
    synonyms: ['banana', 'bananas', 'అరటి'],
  },
  {
    key: 'MANGO',
    ivrKey: '7',
    category: 'FRUITS',
    defaultUnit: 'KG',
    names: {
      'te-IN': 'మామిడి పండు',
      'ta-IN': 'மாம்பழம்',
      'kn-IN': 'ಮಾವಿನಹಣ್ಣು',
      'ml-IN': 'മാമ്പഴം',
      'hi-IN': 'आम',
      'en-IN': 'Mango',
    },
    synonyms: ['mango', 'mangoes', 'మామిడి'],
  },
  {
    key: 'SPINACH',
    ivrKey: '8',
    category: 'LEAFY_GREENS',
    defaultUnit: 'BUNCH',
    names: {
      'te-IN': 'పాలకూర',
      'ta-IN': 'பசலைக்கீரை',
      'kn-IN': 'ಪಾಲಕ್ ಸೊಪ್ಪು',
      'ml-IN': 'ചീര',
      'hi-IN': 'पालक',
      'en-IN': 'Spinach',
    },
    synonyms: ['spinach', 'palak'],
  },
];

export function findCrop(key: string): CropEntry | undefined {
  return IVR_CROPS.find((c) => c.key === key);
}
