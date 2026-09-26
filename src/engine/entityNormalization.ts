/**
 * LongFormAI - Multilingual Entity Normalization Layer
 * Provides deterministic cross-script entity recognition, Unicode text normalization,
 * and alias expansion across English (Latin), Urdu/Arabic, and Hindi (Devanagari) scripts.
 */

// Mapping of canonical entity names / tokens to their deterministic multilingual representations
export interface EntityScriptVariants {
  canonical: string;
  latin: string[];
  urdu: string[];
  hindi: string[];
}

/**
 * Common entity dictionary for high-frequency names and cross-script transliterations.
 * Deterministic, offline, zero-dependency.
 */
export const MULTILINGUAL_ENTITY_MAP: Record<string, { latin: string[]; urdu: string[]; hindi: string[] }> = {
  salman: {
    latin: ['salman', 'salmaan', 'salmankhan', 'salman khan'],
    urdu: ['سلمان', 'سلمان خان', 'سلمان کھان'],
    hindi: ['सलमान', 'सलमान खान'],
  },
  katrina: {
    latin: ['katrina', 'katrinakaif', 'katrina kaif', 'katty'],
    urdu: ['کترینہ', 'کترینہ کیف', 'قترینا', 'قترینہ', 'قترینا کافی', 'قترینا کاف', 'قترینہ کاف', 'کافی', 'کاف'],
    hindi: ['कटरीना', 'कटरीना कैफ', 'कैटरीना', 'कैटरीना कैफ'],
  },
  kaif: {
    latin: ['kaif', 'katrina kaif'],
    urdu: ['کیف', 'کاف', 'کافی', 'کترینہ کیف', 'قترینا کاف'],
    hindi: ['कैफ', 'कटरीना कैफ'],
  },
  khan: {
    latin: ['khan', 'khaan'],
    urdu: ['خان', 'کھان'],
    hindi: ['खान'],
  },
  vicky: {
    latin: ['vicky', 'vicky kaushal', 'vickykaushal'],
    urdu: ['وکی', 'وکی کوشل', 'وکٹر'],
    hindi: ['विक्की', 'विक्की कौशल', 'विकी'],
  },
  kaushal: {
    latin: ['kaushal', 'vicky kaushal'],
    urdu: ['کوشل', 'وکی کوشل'],
    hindi: ['कौशल', 'विक्की कौशल'],
  },
  sohail: {
    latin: ['sohail', 'suhail', 'sohail khan', 'sohailkhan'],
    urdu: ['سوحیل', 'سوحیل خان', 'سوحیل کھان', 'سہیل', 'سہیل خان'],
    hindi: ['सोहेल', 'सोहेल खान', 'सुहैल'],
  },
  arbaaz: {
    latin: ['arbaaz', 'arbaz', 'arbaaz khan', 'arbaazkhan'],
    urdu: ['ارباز', 'ارباز خان', 'ارباز کھان'],
    hindi: ['अरबाज़', 'अरबाज', 'अरबाज़ खान', 'अरबाज खान'],
  },
  ranveer: {
    latin: ['ranveer', 'ranveer singh', 'ranveersingh'],
    urdu: ['رنویر', 'رنویر سنگھ'],
    hindi: ['रणवीर', 'रणवीर सिंह'],
  },
  singh: {
    latin: ['singh', 'ranveer singh'],
    urdu: ['سنگھ', 'رنویر سنگھ'],
    hindi: ['सिंह', 'रणवीर सिंह'],
  },
  deepika: {
    latin: ['deepika', 'deepika padukone', 'deepikapadukone'],
    urdu: ['دیپیکا', 'دیپیکا پڈوکون'],
    hindi: ['दीपिका', 'दीपिका पादुकोण'],
  },
  padukone: {
    latin: ['padukone', 'deepika padukone'],
    urdu: ['پڈوکون', 'دیپیکا پڈوکون'],
    hindi: ['पादुकोण', 'दीपिका पादुकोण'],
  },
  shahrukh: {
    latin: ['shahrukh', 'srk', 'shah rukh', 'shahrukh khan'],
    urdu: ['شاہ رخ', 'شاہ رخ خان', 'شاہ رخ'],
    hindi: ['शाहरुख', 'शाहरुख खान', 'शाह रुख'],
  },
  aamir: {
    latin: ['aamir', 'amir', 'aamir khan'],
    urdu: ['عامر', 'عامر خان'],
    hindi: ['आमिर', 'आमिर खान', 'आमीर'],
  },
  akshay: {
    latin: ['akshay', 'akshay kumar', 'akshaykumar'],
    urdu: ['اکشے', 'اکشے کمار'],
    hindi: ['अक्षय', 'अक्षय कुमार'],
  },
  kumar: {
    latin: ['kumar', 'akshay kumar'],
    urdu: ['کمار', 'اکشے کمار'],
    hindi: ['कुमार', 'अक्षय कुमार'],
  },
  amitabh: {
    latin: ['amitabh', 'amitabh bachchan', 'amitabhbachchan'],
    urdu: ['امیتابھ', 'امیتابھ بچن'],
    hindi: ['अमिताभ', 'अमिताभ बच्चन'],
  },
  bachchan: {
    latin: ['bachchan', 'amitabh bachchan'],
    urdu: ['بچن', 'امیتابھ بچن'],
    hindi: ['बच्चन', 'अमिताभ बच्चन'],
  },
  ranbir: {
    latin: ['ranbir', 'ranbir kapoor', 'ranbirkapoor'],
    urdu: ['رنبیر', 'رنبیر کپور'],
    hindi: ['रणबीर', 'रणबीर कपूर'],
  },
  kareena: {
    latin: ['kareena', 'kareena kapoor', 'kareenakapoor'],
    urdu: ['کرینہ', 'کرینہ کپور'],
    hindi: ['करीना', 'करीना कपूर'],
  },
  kapoor: {
    latin: ['kapoor', 'ranbir kapoor', 'kareena kapoor'],
    urdu: ['کپور', 'رنبیر کپور', 'کرینہ کپور'],
    hindi: ['कपूर', 'रणबीर कपूर', 'करीना कपूर'],
  },
  alia: {
    latin: ['alia', 'alia bhatt', 'aliabhatt'],
    urdu: ['عالیہ', 'عالیہ بھٹ'],
    hindi: ['आलिया', 'आलिया भट्ट'],
  },
  bhatt: {
    latin: ['bhatt', 'alia bhatt'],
    urdu: ['بھٹ', 'عالیہ بھٹ'],
    hindi: ['भट्ट', 'आलिया भट्ट'],
  },
  priyanka: {
    latin: ['priyanka', 'priyanka chopra', 'priyankachopra'],
    urdu: ['پریانکا', 'پریانکا چوپڑا'],
    hindi: ['प्रियंका', 'प्रियंका चोपड़ा'],
  },
  chopra: {
    latin: ['chopra', 'priyanka chopra'],
    urdu: ['چوپڑا', 'پریانکا چوپڑا'],
    hindi: ['चोपड़ा', 'प्रियंका चोपड़ा'],
  },
  hrithik: {
    latin: ['hrithik', 'hrithik roshan', 'hrithikroshan'],
    urdu: ['ریتھک', 'ریتھک روشن', 'ہرتھک'],
    hindi: ['ऋतिक', 'ऋतिक रोशन', 'रितिक'],
  },
  roshan: {
    latin: ['roshan', 'hrithik roshan'],
    urdu: ['روشن', 'ریتھک روشن'],
    hindi: ['रोशन', 'ऋतिक रोशन'],
  },
};

/**
 * Normalizes Unicode text by removing diacritics, unifying letter variants across
 * Arabic/Urdu and Hindi/Devanagari, and collapsing whitespace.
 */
export function normalizeUnicodeText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let normalized = text
    .toLowerCase()
    // Remove Arabic/Urdu diacritics (harakat / tanween / shaddah / sukun)
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    // Unify Arabic/Urdu Yeh variations (ي, ى, ے -> ی)
    .replace(/[\u064A\u0649\u06D2]/g, '\u06CC')
    // Unify Arabic/Urdu Kaf variations (ك -> ک)
    .replace(/\u0643/g, '\u06A9')
    // Unify Arabic/Urdu Heh variations (ة, ه, ھ -> ہ)
    .replace(/[\u0629\u0647\u06BE]/g, '\u06C1')
    // Unify Alef variations (آ, أ, إ, ٱ -> ا)
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    // Replace punctuation / symbols with spaces, preserving Unicode letters, marks, and numbers
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Extracts distinct Unicode word tokens from a text string.
 */
export function extractUnicodeTokens(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const normalized = normalizeUnicodeText(text);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter((w) => w.length >= 2);
}

/**
 * Expands an entity identifier (canonical name, folder name, or alias token) into all known
 * multilingual representations (English, Urdu, Hindi, plus user aliases).
 */
export function expandMultilingualEntityVariants(rawEntity: string): string[] {
  if (!rawEntity || typeof rawEntity !== 'string') return [];

  const clean = normalizeUnicodeText(rawEntity);
  if (!clean) return [];

  const variants = new Set<string>();
  variants.add(clean);

  // Add individual words
  const words = clean.split(/\s+/).filter((w) => w.length >= 2);
  words.forEach((w) => variants.add(w));

  // Lookup in canonical multilingual map
  for (const [key, mapping] of Object.entries(MULTILINGUAL_ENTITY_MAP)) {
    const allKnown = [key, ...mapping.latin, ...mapping.urdu, ...mapping.hindi].map(normalizeUnicodeText);
    
    // If the input matches key or any known representation
    const matches = allKnown.some(
      (k) => k === clean || words.includes(k) || (k.length >= 3 && clean.includes(k))
    );

    if (matches) {
      mapping.latin.map(normalizeUnicodeText).forEach((v) => v && variants.add(v));
      mapping.urdu.map(normalizeUnicodeText).forEach((v) => v && variants.add(v));
      mapping.hindi.map(normalizeUnicodeText).forEach((v) => v && variants.add(v));
    }
  }

  return Array.from(variants);
}

/**
 * Checks whether an entity (and its multilingual variants) is present in a narration string.
 * Supports multi-word phrases and individual distinctive tokens.
 */
export function matchEntityInNarration(
  narrationText: string,
  entityVariants: string[]
): { matched: boolean; matchedTokens: string[] } {
  if (!narrationText || !entityVariants || entityVariants.length === 0) {
    return { matched: false, matchedTokens: [] };
  }

  const normalizedNarration = normalizeUnicodeText(narrationText);
  const narrationTokens = extractUnicodeTokens(narrationText);
  const narrationTokenSet = new Set(narrationTokens);

  const matchedSet = new Set<string>();

  for (const rawVariant of entityVariants) {
    const variant = normalizeUnicodeText(rawVariant);
    if (!variant || variant.length < 2) continue;

    // 1. Exact phrase substring match in normalized narration (e.g. "salman khan", "سلمان خان", "कटरीना कैफ")
    if (variant.includes(' ') && normalizedNarration.includes(variant)) {
      matchedSet.add(variant);
      continue;
    }

    // 2. Exact word token match
    if (narrationTokenSet.has(variant)) {
      matchedSet.add(variant);
      continue;
    }

    // 3. Substring match for single words >= 3 characters (e.g. "salman" in "salmankhan", or Urdu word stems)
    if (variant.length >= 3) {
      if (normalizedNarration.includes(variant)) {
        matchedSet.add(variant);
      }
    }
  }

  const matchedTokens = Array.from(matchedSet);
  return {
    matched: matchedTokens.length > 0,
    matchedTokens,
  };
}
