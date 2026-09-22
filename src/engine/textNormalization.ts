/**
 * LongFormAI (Project Hail Mary) - Numeric Text Normalization Layer
 * Provides deterministic bi-directional normalization between spoken number words
 * and numeric digits for robust semantic matching and OCR integration.
 */

export const NUMBER_WORD_TO_DIGIT: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  seventy: '70',
  eighty: '80',
  ninety: '90',
  hundred: '100',
  // Common ordinals
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
  eleventh: '11',
  twelfth: '12',
  thirteenth: '13',
  fourteenth: '14',
  fifteenth: '15',
  sixteenth: '16',
  seventeenth: '17',
  eighteenth: '18',
  nineteenth: '19',
  twentieth: '20',
};

export const DIGIT_TO_NUMBER_WORD: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
  '10': 'ten',
  '11': 'eleven',
  '12': 'twelve',
  '13': 'thirteen',
  '14': 'fourteen',
  '15': 'fifteen',
  '16': 'sixteen',
  '17': 'seventeen',
  '18': 'eighteen',
  '19': 'nineteen',
  '20': 'twenty',
  '30': 'thirty',
  '40': 'forty',
  '50': 'fifty',
  '60': 'sixty',
  '70': 'seventy',
  '80': 'eighty',
  '90': 'ninety',
  '100': 'hundred',
};

/**
 * Replaces common English number words with numeric digits in a text string.
 */
export function normalizeNumberWordsToDigits(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\b([a-zA-Z]+)\b/g, (match, word) => {
    const lower = word.toLowerCase();
    return NUMBER_WORD_TO_DIGIT[lower] ?? match;
  });
}

/**
 * Replaces standalone numeric digits with English number words in a text string.
 */
export function normalizeDigitsToNumberWords(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\b(\d+)\b/g, (match, digits) => {
    return DIGIT_TO_NUMBER_WORD[digits] ?? match;
  });
}

/**
 * Augments text for semantic embedding by appending both numeric digits and English word representations.
 * Does not alter the original string text in-place.
 */
export function expandSemanticNumericText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (!trimmed) return '';

  const words = trimmed.toLowerCase().split(/[\s,._!?;:"'()]+/);
  const additions: string[] = [];

  for (const w of words) {
    if (NUMBER_WORD_TO_DIGIT[w]) {
      additions.push(NUMBER_WORD_TO_DIGIT[w]);
    } else if (DIGIT_TO_NUMBER_WORD[w]) {
      additions.push(DIGIT_TO_NUMBER_WORD[w]);
    }
  }

  if (additions.length === 0) {
    return trimmed;
  }

  const uniqueAdditions = Array.from(new Set(additions));
  return `${trimmed}. Concepts: ${uniqueAdditions.join(', ')}`;
}
