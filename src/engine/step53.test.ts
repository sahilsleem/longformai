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
 *     - Correct named entity below threshold survives candidate filtering
 *     - Correct named entity beats wrong named entity with higher raw semantic similarity
 *     - Generic low-score B-roll is still filtered normally
 *     - Narration without entity names behaves exactly as before
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

  it('matches concatenated social media filename katrinakaifcutie with Katrina Kaif', () => {
    const asset = makeMedia({ name: 'katrinakaifcutie-20260922-0001.mp4' });
    const narration = 'Katrina Kaif arrived at the awards ceremony.';
    const result = calculateDirectEntityConsistencyModifier(narration, asset);
    expect(result.status).toBe('MATCH');
    expect(result.modifier).toBe(0.15);
    expect(result.matchedTokens).toContain('katrina');
  });

  it('matches compound social media filename vickykatrina.updates with Katrina', () => {
    const asset = makeMedia({ name: 'vickykatrina.updates-20260922-0001.mp4' });
    const narration = 'Katrina arrived at the party.';
    const result = calculateDirectEntityConsistencyModifier(narration, asset);
    expect(result.status).toBe('MATCH');
    expect(result.modifier).toBe(0.15);
    expect(result.matchedTokens).toContain('katrina');
  });

  it('matches compound social media filename salmankhanfanclub with Salman Khan', () => {
    const asset = makeMedia({ name: 'salmankhanfanclub-20260922-0001.mp4' });
    const narration = 'Salman Khan attended the grand press conference.';
    const result = calculateDirectEntityConsistencyModifier(narration, asset);
    expect(result.status).toBe('MATCH');
    expect(result.modifier).toBe(0.15);
    expect(result.matchedTokens).toContain('salman');
    expect(result.matchedTokens).toContain('khan');
  });

  it('returns NEUTRAL and not falsely MATCH for purely generic filenames with Katrina narration', () => {
    const asset = makeMedia({ name: 'red_carpet_event_broll_footage_4k.mp4' });
    const narration = 'Katrina Kaif walked onto the red carpet.';
    const result = calculateDirectEntityConsistencyModifier(narration, asset);
    expect(result.status).toBe('NEUTRAL');
    expect(result.modifier).toBe(0.0);
    expect(result.matchedTokens).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. End-to-End generateDraftTimeline Integration
// ---------------------------------------------------------------------------

describe('Step 53: generateDraftTimeline Entity Consistency Integration', () => {
  it('1. Correct named entity below default threshold (0.30) survives candidate pre-filtering and is selected', async () => {
    const katrinaAsset = makeMedia({
      id: 'm-katrina',
      name: 'katrina_kaif_interview.mp4',
      analysis: {
        analyzed: true,
        // Description does not match scene terms, giving low raw similarity
        description: 'A woman speaking on a stage with a microphone',
        tags: ['interview', 'speech', 'katrina', 'kaif'],
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

    // Default threshold is 0.30. Katrina asset has a direct entity match and must survive.
    const result = await generateDraftTimeline(segments, [katrinaAsset], {
      similarityThreshold: 0.30,
    });

    expect(result.timeline).toHaveLength(1);
    const item = result.timeline[0];
    expect(item.mediaId).toBe('m-katrina');
    expect(item.provenance?.entityConsistencyModifier).toBe(0.15);
    expect(item.provenance?.entityMatchReason).toContain('Direct entity match (+0.15)');
    expect(item.provenance?.explanation).toMatch(/katrina/i);
  });

  it('2. Correct named entity beats a wrong named entity with higher raw semantic similarity at default threshold', async () => {
    const katrinaAsset = makeMedia({
      id: 'm-katrina',
      name: 'katrina_kaif_studio.mp4',
      analysis: {
        analyzed: true,
        // Generic studio description -> low scene score
        description: 'A woman sitting in a studio backdrop',
        tags: ['studio', 'katrina', 'kaif'],
      },
    });

    const salmanAsset = makeMedia({
      id: 'm-salman',
      name: 'salman_khan_red_carpet.mp4',
      analysis: {
        analyzed: true,
        // High scene similarity on "red carpet event"
        description: 'A man in a black suit on a red carpet smiling at cameras and fans',
        tags: ['red', 'carpet', 'fans', 'salman', 'khan'],
      },
    });

    const segments: AudioSegment[] = [
      makeSegment({
        id: 'seg-1',
        text: 'Katrina Kaif made a grand entrance on the red carpet, dazzling the photographers and fans.',
        startTime: 0,
        endTime: 6,
      }),
    ];

    // With default threshold (0.30): Salman meets threshold on scene terms, but Katrina has direct entity match (+0.15)
    // while Salman gets entity conflict penalty (-0.15). Katrina must win!
    const result = await generateDraftTimeline(segments, [salmanAsset, katrinaAsset], {
      similarityThreshold: 0.30,
    });

    expect(result.timeline).toHaveLength(1);
    const item = result.timeline[0];
    expect(item.mediaId).toBe('m-katrina');
    expect(item.provenance?.entityConsistencyModifier).toBe(0.15);
  });

  it('3. Generic low-score B-roll is still filtered normally by threshold', async () => {
    const genericLowScoreAsset = makeMedia({
      id: 'm-generic-low',
      name: 'office_desk_broll.mp4',
      analysis: {
        analyzed: true,
        description: 'A wooden office desk with a laptop and coffee cup',
        tags: ['office', 'desk', 'coffee'],
      },
    });

    const highMatchAsset = makeMedia({
      id: 'm-high-match',
      name: 'red_carpet_celebration.mp4',
      analysis: {
        analyzed: true,
        description: 'A grand red carpet event with photographers and crowd',
        tags: ['red', 'carpet', 'crowd'],
      },
    });

    const segments: AudioSegment[] = [
      makeSegment({
        id: 'seg-1',
        text: 'The red carpet event was packed with cheering fans and paparazzi.',
        startTime: 0,
        endTime: 6,
      }),
    ];

    const result = await generateDraftTimeline(segments, [genericLowScoreAsset, highMatchAsset], {
      similarityThreshold: 0.30,
    });

    expect(result.timeline).toHaveLength(1);
    // Generic office desk must NOT bypass threshold
    expect(result.timeline[0].mediaId).toBe('m-high-match');
  });

  it('4. Narration without entity names strictly preserves standard threshold scoring', async () => {
    const natureAsset = makeMedia({
      id: 'm-nature',
      name: 'mountain_landscape.mp4',
      analysis: {
        analyzed: true,
        description: 'A beautiful sunny mountain landscape with green trees',
        tags: ['mountain', 'nature', 'trees'],
      },
    });

    const cityAsset = makeMedia({
      id: 'm-city',
      name: 'city_traffic_night.mp4',
      analysis: {
        analyzed: true,
        description: 'City street at night with neon lights and moving cars',
        tags: ['city', 'traffic', 'night'],
      },
    });

    const segments: AudioSegment[] = [
      makeSegment({
        id: 'seg-1',
        text: 'The majestic mountains stood tall under the warm golden morning sun.',
        startTime: 0,
        endTime: 5,
      }),
    ];

    const result = await generateDraftTimeline(segments, [cityAsset, natureAsset], {
      similarityThreshold: 0.30,
    });

    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0].mediaId).toBe('m-nature');
    expect(result.timeline[0].provenance?.entityConsistencyModifier).toBe(0);
  });

  it('5. Explicit Katrina match beats generic high-semantic-similarity B-roll candidate', async () => {
    const katrinaAsset = makeMedia({
      id: 'm-katrina',
      name: 'katrinakaifcutie-20260922-0001.mp4',
      analysis: {
        analyzed: true,
        // Generic description with low semantic overlap to transcript
        description: 'A woman wearing a dress posing for cameras',
        tags: ['fashion', 'dress', 'woman'],
      },
    });

    const genericEventBrollAsset = makeMedia({
      id: 'm-generic-event',
      name: 'bollywoodchronicle-20260922-0001.mp4',
      analysis: {
        analyzed: true,
        // Very high semantic overlap to transcript keywords like "awards ceremony" / "red carpet"
        description: 'A grand red carpet event at the annual cinema awards ceremony with cheering crowd and press',
        tags: ['awards', 'ceremony', 'press', 'carpet', 'event', 'crowd'],
      },
    });

    const segments: AudioSegment[] = [
      makeSegment({
        id: 'seg-1',
        text: 'Katrina Kaif arrived at the grand awards ceremony, smiling for the cameras.',
        startTime: 0,
        endTime: 6,
      }),
    ];

    const result = await generateDraftTimeline(segments, [genericEventBrollAsset, katrinaAsset], {
      similarityThreshold: 0.30,
    });

    expect(result.timeline).toHaveLength(1);
    // Entity-priority must ensure Katrina footage is selected over generic event B-roll
    expect(result.timeline[0].mediaId).toBe('m-katrina');
    expect(result.timeline[0].provenance?.entityConsistencyModifier).toBe(0.15);
    expect(result.timeline[0].provenance?.explanation).toMatch(/katrina/i);
  });
});
