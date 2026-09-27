import { describe, it, expect } from 'vitest';
import { getQueryEntityAnchors } from './matching';
import { MediaFolder } from '../types/project';

describe('Query-Side Canonical Entity Anchoring & False-Positive Regression', () => {
  const folders: MediaFolder[] = [
    {
      id: 'f1',
      name: 'Katrina Kaif',
      aliases: ['कैटरीना कैफ', 'कैटरीना', 'قترینا کاف', 'کترینہ'],
      createdAt: 0
    },
    {
      id: 'f2',
      name: 'Salman Khan',
      aliases: ['سلمان کھان', 'سلمان', 'सलमान खान', 'کہان'],
      createdAt: 0
    }
  ];

  it('1. "کہانی" MUST NOT detect Khan (Fixes false positive where "kahani" matched "kahan")', () => {
    // "کہانی" = kahani (story). It should NOT match "کہان" (kahan/khan).
    const text = 'لیکن کہانی صرف قترینہ کی نہیں ہے';
    const anchor = getQueryEntityAnchors(text, folders);
    // It should ONLY detect Katrina Kaif, not Salman Khan
    expect(anchor.trim()).toBe('Katrina Kaif');
  });

  it('2. "کہان" MAY detect Khan if "کہان" is actually an intentional alias', () => {
    // Exact token match should still work
    const text = 'یہ کہان کی تصویر ہے';
    const anchor = getQueryEntityAnchors(text, folders);
    expect(anchor).toContain('Salman Khan');
  });

  it('3. Existing Urdu Khan references MUST still detect Khan', () => {
    const text = 'سلمان نے خود بتایا تھا';
    const anchor = getQueryEntityAnchors(text, folders);
    expect(anchor).toContain('Salman Khan');
  });

  it('4. Existing Urdu Katrina references MUST still detect Katrina', () => {
    const text = 'حال کی تصویروں میں قترینا کا بضلہ ہوا';
    const anchor = getQueryEntityAnchors(text, folders);
    expect(anchor).toContain('Katrina Kaif');
  });

  it('5. Existing English "Khan" detection MUST still work', () => {
    const text = 'This is about Salman.';
    const anchor = getQueryEntityAnchors(text, folders);
    expect(anchor).toContain('Salman Khan');
  });

  it('6. Existing English "Katrina Kaif" detection MUST still work', () => {
    const text = 'This is about Katrina Kaif.';
    const anchor = getQueryEntityAnchors(text, folders);
    expect(anchor).toContain('Katrina Kaif');
  });

  it('7. Mixed Katrina + Salman detection MUST still work', () => {
    const text = 'ایک طرف قترینا کاف دوسری طرف سلمان کھان';
    const anchor = getQueryEntityAnchors(text, folders);
    expect(anchor).toContain('Katrina Kaif');
    expect(anchor).toContain('Salman Khan');
  });

  it('8. Query-side entity anchoring NO-ENTITY query remains unchanged', () => {
    const text = 'یہ ایک عام جملہ ہے جس میں کسی کا نام نہیں';
    const anchor = getQueryEntityAnchors(text, folders);
    expect(anchor).toBe('');
  });
  
  it('9. Suffix token matching still allows very short common suffixes', () => {
    // "salman's" or similar small grammatical additions should still trigger step 3 match if alias is just "salman".
    // We added 'ko', 'ne', 'ka', 's', 'es' to the allowed suffixes.
    const textLatin = "salman's house";
    expect(getQueryEntityAnchors(textLatin, folders)).toContain('Salman Khan');
    
    // We didn't explicitly mock "salman's" in aliases, but the stem is "salman" and suffix "'s" is not in our whitelist explicitly.
    // Wait, the test uses "salman's"? We only allowed "s" not "'s".
    // Actually, extractUnicodeTokens strips punctuation, so "salman's" becomes "salman".
    // Let's test a concatenated Urdu suffix like "سلمانکو" (salmanko).
    const textUrdu = "سلمانکو دیکھا";
    expect(getQueryEntityAnchors(textUrdu, folders)).toContain('Salman Khan');
  });
});
