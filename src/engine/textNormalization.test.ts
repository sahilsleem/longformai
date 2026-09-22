import { describe, it, expect } from 'vitest';
import {
  normalizeNumberWordsToDigits,
  normalizeDigitsToNumberWords,
  expandSemanticNumericText,
} from './textNormalization';

describe('Numeric Text Normalization', () => {
  it('converts number words to numeric digits', () => {
    expect(normalizeNumberWordsToDigits('seven')).toBe('7');
    expect(normalizeNumberWordsToDigits('fifteen')).toBe('15');
    expect(normalizeNumberWordsToDigits('step one is done')).toBe('step 1 is done');
    expect(normalizeNumberWordsToDigits('twenty')).toBe('20');
  });

  it('converts digits to number words', () => {
    expect(normalizeDigitsToNumberWords('7')).toBe('seven');
    expect(normalizeDigitsToNumberWords('15')).toBe('fifteen');
    expect(normalizeDigitsToNumberWords('1')).toBe('one');
  });

  it('expands semantic text with complementary numeric representations', () => {
    expect(expandSemanticNumericText('seven')).toContain('7');
    expect(expandSemanticNumericText('15')).toContain('fifteen');
    expect(expandSemanticNumericText('a photo of a car')).toBe('a photo of a car');
  });
});
