/**
 * Step 53: Direct Entity & Subject Consistency Intelligence
 *
 * Tests for:
 *  1. extractMediaIdentityTokens (pure token extraction & stopword filtering)
 *  2. calculateDirectEntityConsistencyModifier:
 *     - Positive match (+0.15)
 *     - Confirmed conflicting identity penalty (-0.15)
 *     - Neutral score (0.0) for generic footage
 *     - Neutral score (0.0) for narration without person/entity names
 *  3. Multi-word entity names (e.g. "Katrina Kaif", "Salman Khan")
 *  4. Invariants & determinism
 *  5. End-to-end integration with generateDraftTimeline:
 *     - Correct person footage selected over wrong person footage despite raw scene similarity
 *     - DraftProvenance entityConsistencyModifier and entityMatchReason populated
 */

import { describe, it, expect } from 'vitest';
import {
  extractMediaIdentityTokens,
  calculateDirectEntityConsistencyModifier,
  generateDraftTimeline,
} from './draftTimeline';
import type { AudioSegment, MediaAsset } from '../types/project';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMedia(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'media-1',
    name: 'test_video.mp4',
    type: 'video',
    url: 'blob:http://localhost/mock-video',
    width: 1920,
    height: 1080,
    duration: 10,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9',
    createdAt: 1700000000000,
    analysis: {
      analyzed: true,
      description: 'A person standing at a public event',
      tags: ['event', 'person'],
    },
    ...overrides,
  };
}

function makeSegment(overrides: Partial<AudioSegment> = {}): AudioSegment {
  return {
    id: 'seg-1',
    text: 'Katrina Kaif arrived at the awards ceremony.',
    startTime: 0,
    endTime: 5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. extractMediaIdentityTokens
// ---------------------------------------------------------------------------

describe('Step 53: extractMediaIdentityTokens', () => {
  it('extracts multi-word identity tokens from clean filenames', () => {
    const asset = makeMedia({ name: 'katrina_kaif_red_carpet.mp4' });
    const tokens = extractMediaIdentityTokens(asset);
    expect(tokens).toContain('katrina');
    expect(tokens).toContain('kaif');
    expect(tokens).not.toContain('red');
    expect(tokens).not.toContain('carpet');
    expect(tokens).not.toContain('mp4');
  });

  it('filters generic media stopwords and file extensions', () => {
    const asset = makeMedia({ name: 'salman_khan_press_conference_interview_clip_1080p.mov' });
    const tokens = extractMediaIdentityTokens(asset);
    expect(tokens).toEqual(['salman', 'khan']);
  });

  it('returns empty array for purely generic filenames', () => {
    const asset = makeMedia({ name: 'red_carpet_event_broll_footage_4k.mp4' });
    const tokens = extractMediaIdentityTokens(asset);
    expect(tokens).toEqual([]);
  });

  it('includes explicit custom tags if present', () => {
    const asset = makeMedia({
      name: 'interview_01.mp4',
      analysis: {
        analyzed: true,
        tags: ['Katrina Kaif', 'celebrity'],
      },
    });
    const tokens = extractMediaIdentityTokens(asset);
    expect(tokens).toContain('katrina');
    expect(tokens).toContain('kaif');
  });
});

// ---------------------------------------------------------------------------
// 2. calculateDirectEntityConsistencyModifier
// ---------------------------------------------------------------------------

describe('Step 53: calculateDirectEntityConsistencyModifier', () => {
  const katrinaAsset = makeMedia({ id: 'm-katrina', name: 'katrina_kaif_interview.mp4' });
  const salmanAsset = makeMedia({ id: 'm-salman', name: 'salman_khan_red_carpet.mp4' });
  const genericAsset = makeMedia({ id: 'm-generic', name: 'red_carpet_event_broll.mp4' });
  const allMedia = [katrinaAsset, salmanAsset, genericAsset];

  it('awards +0.15 bonus when narration matches media entity identity', () => {
    const narration = 'Katrina Kaif walked onto the red carpet in a stunning dress.';
    const result = calculateDirectEntityConsistencyModifier(narration, katrinaAsset, allMedia);
    expect(result.status).toBe('MATCH');
    expect(result.modifier).toBe(0.15);
    expect(result.matchedTokens).toContain('katrina');
    expect(result.matchedTokens).toContain('kaif');
  });

  it('applies -0.15 penalty when candidate identity conflicts with narration subject present in library', () => {
    const narration = 'Katrina Kaif walked onto the red carpet in a stunning dress.';
    const result = calculateDirectEntityConsistencyModifier(narration, salmanAsset, allMedia);
    expect(result.status).toBe('CONFLICT');
    expect(result.modifier).toBe(-0.15);
    expect(result.conflictingTokens).toContain('salman');
    expect(result.conflictingTokens).toContain('khan');
  });

  it('returns 0.0 neutral modifier for generic footage without specific entity names', () => {
    const narration = 'Katrina Kaif walked onto the red carpet in a stunning dress.';
    const result = calculateDirectEntityConsistencyModifier(narration, genericAsset, allMedia);
    expect(result.status).toBe('NEUTRAL');
    expect(result.modifier).toBe(0.0);
  });

  it('returns 0.0 neutral modifier when narration contains no entity names', () => {
    const narration = 'The red carpet event was packed with cheering fans and flashing cameras.';
    const resKatrina = calculateDirectEntityConsistencyModifier(narration, katrinaAsset, allMedia);
    const resSalman = calculateDirectEntityConsistencyModifier(narration, salmanAsset, allMedia);
    const resGeneric = calculateDirectEntityConsistencyModifier(narration, genericAsset, allMedia);

    expect(resKatrina.modifier).toBe(0.0);
    expect(resSalman.modifier).toBe(0.0);
    expect(resGeneric.modifier).toBe(0.0);
  });

  it('is deterministic across repeated invocations', () => {
    const narration = 'Katrina Kaif gave an exclusive interview.';
    const r1 = calculateDirectEntityConsistencyModifier(narration, katrinaAsset, allMedia);
    const r2 = calculateDirectEntityConsistencyModifier(narration, katrinaAsset, allMedia);
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// 3. End-to-End generateDraftTimeline Integration
// ---------------------------------------------------------------------------

describe('Step 53: generateDraftTimeline Entity Consistency Integration', () => {
  it('selects matching celebrity footage over conflicting celebrity footage and populates provenance', async () => {
    const katrinaAsset = makeMedia({
      id: 'm-katrina',
      name: 'katrina_kaif_interview.mp4',
      analysis: {
        analyzed: true,
        description: 'A woman speaking on a stage with a microphone',
        tags: ['interview', 'speech', 'katrina', 'kaif'],
      },
    });

    const salmanAsset = makeMedia({
      id: 'm-salman',
      name: 'salman_khan_red_carpet.mp4',
      analysis: {
        analyzed: true,
        description: 'A man in a black suit on a red carpet smiling at cameras',
        tags: ['red', 'carpet', 'salman', 'khan'],
      },
    });

    const segments: AudioSegment[] = [
      makeSegment({
        id: 'seg-1',
        text: 'Katrina Kaif arrived at the red carpet event and greeted the press.',
        startTime: 0,
        endTime: 6,
      }),
    ];

    const result = await generateDraftTimeline(segments, [salmanAsset, katrinaAsset], {
      similarityThreshold: 0.15,
    });

    expect(result.timeline).toHaveLength(1);
    const item = result.timeline[0];

    // Katrina Kaif footage must be selected because of +0.15 entity bonus and -0.15 Salman conflict
    expect(item.mediaId).toBe('m-katrina');
    expect(item.provenance).toBeDefined();
    expect(item.provenance?.entityConsistencyModifier).toBe(0.15);
    expect(item.provenance?.entityMatchReason).toContain('Direct entity match (+0.15)');
    expect(item.provenance?.explanation).toMatch(/katrina/i);
  });
});
