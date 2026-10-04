import { describe, it, expect } from 'vitest';
import {
  generateVisualTreatmentPlan,
  resolveEntityForCandidate,
  formatFullscreenCardText,
} from './visualStoryDirector';
import type {
  AudioSegment,
  DraftProvenance,
  MediaAsset,
  MediaFolder,
  TimelineItem,
  TransformState,
} from '../types/project';

// ---------------------------------------------------------------------------
// Synthetic Fixtures
// ---------------------------------------------------------------------------

const defaultTransform: TransformState = {
  x: 0,
  y: 0,
  scale: 1,
  fitMode: 'cover',
  crop: { x: 0, y: 0, width: 1, height: 1 },
};

function createItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: `item-${Math.random().toString(36).substring(2, 9)}`,
    mediaId: 'media-video-1',
    trackIndex: 0,
    startTime: 0,
    duration: 4.0,
    sourceStart: 0,
    sourceDuration: 10.0,
    transform: { ...defaultTransform },
    ...overrides,
  };
}

function createMedia(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'media-video-1',
    name: 'test_footage.mp4',
    type: 'video',
    url: 'blob:http://localhost/video-1',
    width: 1920,
    height: 1080,
    duration: 10.0,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9 Native',
    createdAt: 1700000000000,
    folderIds: [],
    ...overrides,
  };
}

function createProvenance(overrides: Partial<DraftProvenance> = {}): DraftProvenance {
  return {
    sourceSegmentId: 'seg-1',
    originalScore: 0.75,
    adjustedScore: 0.80,
    explanation: 'Matched segment successfully.',
    reuseCount: 0,
    candidateConfidenceLevel: 'HIGH',
    narrationRole: 'action',
    visualImpactScore: 0.50,
    ...overrides,
  };
}

function createSegment(overrides: Partial<AudioSegment> = {}): AudioSegment {
  return {
    id: 'seg-1',
    startTime: 0,
    endTime: 4.0,
    text: 'This is a sample narration.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Visual Story Director (Stage 1)', () => {
  // Test 1: Empty / Normal item -> NORMAL_CLIP
  it('1. Empty/normal item → NORMAL_CLIP with safe default', () => {
    const item = createItem({
      id: 'item-normal-1',
      provenance: createProvenance({
        narrationRole: 'action',
        candidateConfidenceLevel: 'MODERATE',
        visualImpactScore: 0.40,
      }),
    });

    const plan = generateVisualTreatmentPlan([item]);

    expect(plan.treatments[item.id]).toBeDefined();
    const t = plan.treatments[item.id];
    expect(t.motion).toBe('NORMAL_CLIP');
    expect(t.typography).toBe('NONE');
    expect(t.transition).toBe('HARD_CUT');
    expect(t.reason).toMatch(/safe default|normal clip/i);
  });

  // Test 2: Low confidence -> NORMAL_CLIP
  it('2. Low confidence → NORMAL_CLIP regardless of other signals', () => {
    const item = createItem({
      id: 'item-low-conf',
      duration: 5.0,
      provenance: createProvenance({
        narrationRole: 'emphasis',
        candidateConfidenceLevel: 'LOW',
        visualImpactScore: 0.90, // even with high impact, low confidence guards it
      }),
    });

    const stillImage = createMedia({ id: 'img-1', type: 'image' });
    item.mediaId = 'img-1';

    const plan = generateVisualTreatmentPlan([item], { mediaAssets: [stillImage] });
    const t = plan.treatments[item.id];

    expect(t.motion).toBe('NORMAL_CLIP');
    expect(t.typography).toBe('NONE');
    expect(t.transition).toBe('HARD_CUT');
    expect(t.reason).toMatch(/low candidate.*confidence/i);
  });

  // Test 3: Long still image -> SLOW_ZOOM
  it('3. Long still image (>= 2s) → SLOW_ZOOM', () => {
    const imageAsset = createMedia({ id: 'photo-1', type: 'image' });
    const item = createItem({
      id: 'item-photo',
      mediaId: 'photo-1',
      duration: 3.5,
      provenance: createProvenance({
        narrationRole: 'description',
        candidateConfidenceLevel: 'HIGH',
      }),
    });

    const plan = generateVisualTreatmentPlan([item], { mediaAssets: [imageAsset] });
    const t = plan.treatments[item.id];

    expect(t.motion).toBe('SLOW_ZOOM');
    expect(t.motionParams?.startScale).toBe(1.0);
    expect(t.motionParams?.endScale).toBe(1.08);
    expect(t.reason).toMatch(/still image/i);
  });

  // Test 4: Opening establishing shot -> SLOW_ZOOM
  it('4. Opening establishing shot → SLOW_ZOOM', () => {
    const item = createItem({
      id: 'item-opening',
      provenance: createProvenance({
        beatId: 'beat-0',
        beatPosition: 1,
        narrationRole: 'establishing',
        framingScale: 'WIDE',
        candidateConfidenceLevel: 'HIGH',
      }),
    });

    const plan = generateVisualTreatmentPlan([item]);
    const t = plan.treatments[item.id];

    expect(t.motion).toBe('SLOW_ZOOM');
    expect(t.motionParams?.startScale).toBe(1.0);
    expect(t.motionParams?.endScale).toBe(1.10);
    expect(t.reason).toMatch(/opening establishing shot/i);
  });

  // Test 5: High-confidence emphasis -> PUNCH_ZOOM
  it('5. High-confidence emphasis → PUNCH_ZOOM', () => {
    const item = createItem({
      id: 'item-emphasis-1',
      provenance: createProvenance({
        narrationRole: 'emphasis',
        candidateConfidenceLevel: 'HIGH',
        visualImpactScore: 85, // 0-100 scale
      }),
    });

    const plan = generateVisualTreatmentPlan([item]);
    const t = plan.treatments[item.id];

    expect(t.motion).toBe('PUNCH_ZOOM');
    expect(t.motionParams?.scale).toBe(1.25);
    expect(t.reason).toMatch(/emphasis beat/i);
  });

  // Test 6: Reliable emphasis word -> EMPHASIS_TEXT
  it('6. Reliable emphasis word → EMPHASIS_TEXT', () => {
    const seg = createSegment({
      id: 'seg-emp',
      text: 'This was a spectacular breakthrough.',
      words: [
        { word: 'This', start: 0.1, end: 0.3, confidence: 0.99 },
        { word: 'was', start: 0.4, end: 0.6, confidence: 0.99 },
        { word: 'a', start: 0.7, end: 0.8, confidence: 0.99 },
        { word: 'spectacular', start: 0.9, end: 1.6, confidence: 0.98 },
        { word: 'breakthrough', start: 1.7, end: 2.5, confidence: 0.97 },
      ],
    });

    const item = createItem({
      id: 'item-emp-word',
      startTime: 0,
      duration: 3.0,
      provenance: createProvenance({
        sourceSegmentId: 'seg-emp',
        narrationRole: 'emphasis',
        candidateConfidenceLevel: 'HIGH',
        visualImpactScore: 0.80, // normalized scale
      }),
    });

    const plan = generateVisualTreatmentPlan([item], { segments: [seg] });
    const t = plan.treatments[item.id];

    expect(t.motion).toBe('PUNCH_ZOOM');
    expect(t.typography).toBe('EMPHASIS_TEXT');
    expect(t.text).toBeDefined();
    // Should choose one of the content words: 'breakthrough' or 'spectacular'
    expect(['breakthrough', 'spectacular']).toContain(t.text?.toLowerCase());
    expect(t.textTiming?.start).toBeGreaterThanOrEqual(0.9);
  });

  // Test 7: No reliable emphasis word -> no emphasis text
  it('7. No reliable emphasis word → no emphasis text (typography remains NONE)', () => {
    const seg = createSegment({
      id: 'seg-stopwords',
      text: 'And then it was there.',
      words: [
        { word: 'And', start: 0.1, end: 0.3 },
        { word: 'then', start: 0.4, end: 0.6 },
        { word: 'it', start: 0.7, end: 0.8 },
        { word: 'was', start: 0.9, end: 1.1 },
        { word: 'there', start: 1.2, end: 1.5 },
      ],
    });

    const item = createItem({
      id: 'item-no-emp-word',
      provenance: createProvenance({
        sourceSegmentId: 'seg-stopwords',
        narrationRole: 'emphasis',
        candidateConfidenceLevel: 'HIGH',
        visualImpactScore: 0.85,
      }),
    });

    const plan = generateVisualTreatmentPlan([item], { segments: [seg] });
    const t = plan.treatments[item.id];

    expect(t.motion).toBe('PUNCH_ZOOM');
    expect(t.typography).toBe('NONE');
    expect(t.text).toBeUndefined();
  });

  // Test 8: First reliable entity appearance -> CONTEXT_LABEL
  it('8. First reliable entity appearance → CONTEXT_LABEL', () => {
    const folder: MediaFolder = {
      id: 'f-katrina',
      name: 'Katrina Kaif',
      createdAt: 1000,
    };

    const media1 = createMedia({
      id: 'm-katrina-1',
      folderIds: ['f-katrina'],
    });

    const item1 = createItem({
      id: 'item-katrina-1',
      mediaId: 'm-katrina-1',
      provenance: createProvenance({ candidateConfidenceLevel: 'HIGH' }),
    });

    const item2 = createItem({
      id: 'item-katrina-2',
      mediaId: 'm-katrina-1',
      provenance: createProvenance({ candidateConfidenceLevel: 'HIGH' }),
    });

    const plan = generateVisualTreatmentPlan([item1, item2], {
      mediaAssets: [media1],
      folders: [folder],
    });

    // First appearance gets CONTEXT_LABEL
    const t1 = plan.treatments[item1.id];
    expect(t1.typography).toBe('CONTEXT_LABEL');
    expect(t1.text).toBe('Katrina Kaif');
    expect(t1.reason).toMatch(/Katrina Kaif/i);

    // Second appearance of the same entity does NOT get repeated CONTEXT_LABEL
    const t2 = plan.treatments[item2.id];
    expect(t2.typography).toBe('NONE');
  });

  // Test 9: Unknown / generic entity -> no context label
  it('9. Unknown / generic entity → no context label', () => {
    const genericFolder: MediaFolder = {
      id: 'f-broll',
      name: 'B-Roll',
      createdAt: 1000,
    };

    const mediaGeneric = createMedia({
      id: 'm-broll-1',
      folderIds: ['f-broll'],
    });

    const item = createItem({
      id: 'item-broll',
      mediaId: 'm-broll-1',
      provenance: createProvenance({ candidateConfidenceLevel: 'HIGH' }),
    });

    const plan = generateVisualTreatmentPlan([item], {
      mediaAssets: [mediaGeneric],
      folders: [genericFolder],
    });

    const t = plan.treatments[item.id];
    expect(t.typography).toBe('NONE');
    expect(t.text).toBeUndefined();
  });

  // Test 10: Transition beat -> CROSSFADE
  it('10. Transition beat (duration >= 2s) → CROSSFADE', () => {
    const item = createItem({
      id: 'item-transition',
      duration: 3.0,
      provenance: createProvenance({
        narrationRole: 'transition',
        candidateConfidenceLevel: 'HIGH',
      }),
    });

    const plan = generateVisualTreatmentPlan([item]);
    const t = plan.treatments[item.id];

    expect(t.transition).toBe('CROSSFADE');
    expect(t.transitionDuration).toBe(0.5);
    expect(t.reason).toMatch(/transition/i);
  });

  // Test 11: Consecutive punch zoom prevention
  it('11. Consecutive punch zoom prevention (Rule 7 Anti-Fatigue)', () => {
    const item1 = createItem({
      id: 'item-punch-1',
      provenance: createProvenance({
        narrationRole: 'emphasis',
        candidateConfidenceLevel: 'HIGH',
        visualImpactScore: 0.90,
      }),
    });

    const item2 = createItem({
      id: 'item-punch-2',
      provenance: createProvenance({
        narrationRole: 'emphasis',
        candidateConfidenceLevel: 'HIGH',
        visualImpactScore: 0.95,
      }),
    });

    const plan = generateVisualTreatmentPlan([item1, item2]);

    expect(plan.treatments[item1.id].motion).toBe('PUNCH_ZOOM');
    // Consecutive punch zoom must be demoted to NORMAL_CLIP
    expect(plan.treatments[item2.id].motion).toBe('NORMAL_CLIP');
    expect(plan.treatments[item2.id].reason).toMatch(/punch zoom demoted/i);
  });

  // Test 12: Slow zoom anti-fatigue (max 2 consecutive)
  it('12. Slow zoom anti-fatigue: demotes 3rd consecutive slow zoom', () => {
    const img1 = createMedia({ id: 'img-1', type: 'image' });
    const img2 = createMedia({ id: 'img-2', type: 'image' });
    const img3 = createMedia({ id: 'img-3', type: 'image' });

    const item1 = createItem({ id: 'i1', mediaId: 'img-1', duration: 3.0, provenance: createProvenance() });
    const item2 = createItem({ id: 'i2', mediaId: 'img-2', duration: 3.0, provenance: createProvenance() });
    const item3 = createItem({ id: 'i3', mediaId: 'img-3', duration: 3.0, provenance: createProvenance() });

    const plan = generateVisualTreatmentPlan([item1, item2, item3], {
      mediaAssets: [img1, img2, img3],
    });

    expect(plan.treatments['i1'].motion).toBe('SLOW_ZOOM');
    expect(plan.treatments['i2'].motion).toBe('SLOW_ZOOM');
    // 3rd consecutive must be demoted
    expect(plan.treatments['i3'].motion).toBe('NORMAL_CLIP');
    expect(plan.treatments['i3'].reason).toMatch(/slow zoom demoted/i);
  });

  // Test 13: Deterministic output
  it('13. Deterministic output across repeated calls with identical data', () => {
    const folder: MediaFolder = { id: 'f1', name: 'Tokyo City', createdAt: 100 };
    const media = createMedia({ id: 'm1', folderIds: ['f1'], type: 'image' });
    const item = createItem({ id: 'item-det', mediaId: 'm1', duration: 3.5, provenance: createProvenance() });

    const planA = generateVisualTreatmentPlan([item], { mediaAssets: [media], folders: [folder] });
    const planB = generateVisualTreatmentPlan([item], { mediaAssets: [media], folders: [folder] });

    expect(planA).toEqual(planB);
  });

  // Test 14: Existing inputs are not mutated
  it('14. Existing inputs are strictly not mutated', () => {
    const item = createItem({ id: 'item-freeze', duration: 4.0 });
    const originalItemCopy = JSON.parse(JSON.stringify(item));
    const media = createMedia({ id: item.mediaId });
    const originalMediaCopy = JSON.parse(JSON.stringify(media));

    const items = [item];
    generateVisualTreatmentPlan(items, { mediaAssets: [media] });

    expect(item).toEqual(originalItemCopy);
    expect(media).toEqual(originalMediaCopy);
  });

  // Test 15: All treatments have reasons
  it('15. All treatments have non-empty human-readable reasons', () => {
    const items = [
      createItem({ id: 'i-1', provenance: createProvenance({ narrationRole: 'action' }) }),
      createItem({ id: 'i-2', provenance: createProvenance({ candidateConfidenceLevel: 'LOW' }) }),
      createItem({ id: 'i-3', provenance: createProvenance({ narrationRole: 'emphasis', visualImpactScore: 0.85 }) }),
      createItem({ id: 'i-4', duration: 3.0, provenance: createProvenance({ narrationRole: 'transition' }) }),
    ];

    const plan = generateVisualTreatmentPlan(items);

    for (const id of Object.keys(plan.treatments)) {
      const treatment = plan.treatments[id];
      expect(typeof treatment.reason).toBe('string');
      expect(treatment.reason.trim().length).toBeGreaterThan(0);
    }
  });

  // Test 16: Treatment statistics are correct
  it('16. Treatment statistics correctly tally all items and categories', () => {
    const img = createMedia({ id: 'img-stat', type: 'image' });
    const folder: MediaFolder = { id: 'f-stat', name: 'Albert Einstein', createdAt: 1 };

    const items = [
      // 0: normal
      createItem({ id: 's-1', provenance: createProvenance({ narrationRole: 'action' }) }),
      // 1: slow zoom (image) + context label
      createItem({
        id: 's-2',
        mediaId: 'img-stat',
        duration: 3.0,
        provenance: createProvenance({ candidateConfidenceLevel: 'HIGH' }),
      }),
      // 2: punch zoom
      createItem({
        id: 's-3',
        provenance: createProvenance({
          narrationRole: 'emphasis',
          candidateConfidenceLevel: 'HIGH',
          visualImpactScore: 0.88,
        }),
      }),
      // 3: transition crossfade
      createItem({
        id: 's-4',
        duration: 3.0,
        provenance: createProvenance({
          narrationRole: 'transition',
          candidateConfidenceLevel: 'HIGH',
        }),
      }),
    ];

    img.folderIds = ['f-stat'];

    const plan = generateVisualTreatmentPlan(items, {
      mediaAssets: [img],
      folders: [folder],
    });

    const sum = plan.summary;
    expect(sum.totalItems).toBe(4);
    expect(sum.normalClips + sum.slowZooms + sum.punchZooms + sum.holds).toBe(4);
    expect(sum.hardCuts + sum.crossfades).toBe(4);
    expect(sum.contextLabels).toBe(1);
    expect(sum.crossfades).toBe(1);
    expect(sum.punchZooms).toBe(1);
    expect(sum.slowZooms).toBe(1);
    expect(sum.normalClips).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Focused Regression Tests (Adversarial Review Findings)
  // -------------------------------------------------------------------------

  // Test A — Relative timestamp
  it('Regression Test A — Relative timestamp: converts absolute audio timestamp to clip-relative offset', () => {
    const seg = createSegment({
      id: 'seg-rel-time',
      startTime: 30.0,
      endTime: 34.0,
      text: 'A spectacular breakthrough occurred.',
      words: [
        { word: 'A', start: 30.2, end: 30.4 },
        { word: 'spectacular', start: 30.5, end: 31.2 },
        { word: 'breakthrough', start: 31.5, end: 32.5, confidence: 0.98 },
        { word: 'occurred', start: 32.6, end: 33.5 },
      ],
    });

    const item = createItem({
      id: 'item-rel-time',
      startTime: 30.0,
      duration: 4.0,
      provenance: createProvenance({
        sourceSegmentId: 'seg-rel-time',
        narrationRole: 'emphasis',
        candidateConfidenceLevel: 'HIGH',
        visualImpactScore: 0.90,
      }),
    });

    const plan = generateVisualTreatmentPlan([item], { segments: [seg] });
    const t = plan.treatments[item.id];

    expect(t.motion).toBe('PUNCH_ZOOM');
    expect(t.typography).toBe('EMPHASIS_TEXT');
    expect(t.textTiming?.start).toBe(1.5);
    expect(t.textTiming?.end).toBe(2.5);
    expect(t.motionParams?.triggerTime).toBe(1.5);
  });

  // Test B — End clamping
  it('Regression Test B — End clamping: ensures end <= duration and never exceeds clip length', () => {
    const seg = createSegment({
      id: 'seg-clamp',
      startTime: 30.0,
      endTime: 34.0,
      text: 'A breakthrough was achieved.',
      words: [
        { word: 'breakthrough', start: 31.5, end: 33.0, confidence: 0.98 },
      ],
    });

    const item = createItem({
      id: 'item-clamp',
      startTime: 30.0,
      duration: 2.0, // Clip ends at 32.0, but word runs until 33.0
      provenance: createProvenance({
        sourceSegmentId: 'seg-clamp',
        narrationRole: 'emphasis',
        candidateConfidenceLevel: 'HIGH',
        visualImpactScore: 0.90,
      }),
    });

    const plan = generateVisualTreatmentPlan([item], { segments: [seg] });
    const t = plan.treatments[item.id];

    expect(t.motion).toBe('PUNCH_ZOOM');
    expect(t.typography).toBe('EMPHASIS_TEXT');
    expect(t.textTiming?.start).toBe(1.5);
    expect(t.textTiming?.end).toBeLessThanOrEqual(2.0);
    expect(t.textTiming?.end).toBeGreaterThanOrEqual(1.5);
    expect(t.motionParams?.triggerTime).toBe(1.5);
    expect(t.textTiming?.start).toBeLessThanOrEqual(item.duration);
    expect(t.textTiming?.end).toBeLessThanOrEqual(item.duration);
  });

  // Test C — Keyword outside clip
  it('Regression Test C — Keyword outside clip: no EMPHASIS_TEXT and no punch trigger when word is outside clip window', () => {
    const seg = createSegment({
      id: 'seg-outside',
      startTime: 30.0,
      endTime: 37.0,
      text: 'A late breakthrough was noticed.',
      words: [
        // Spoken at 35.0s, which is outside the clip window [30.0, 34.0]
        { word: 'breakthrough', start: 35.0, end: 36.0, confidence: 0.98 },
      ],
    });

    const item = createItem({
      id: 'item-outside',
      startTime: 30.0,
      duration: 4.0, // Clip runs from 30.0 to 34.0
      provenance: createProvenance({
        sourceSegmentId: 'seg-outside',
        narrationRole: 'emphasis',
        candidateConfidenceLevel: 'HIGH',
        visualImpactScore: 0.90,
      }),
    });

    const plan = generateVisualTreatmentPlan([item], { segments: [seg] });
    const t = plan.treatments[item.id];

    expect(t.motion).toBe('PUNCH_ZOOM');
    expect(t.typography).toBe('NONE');
    expect(t.text).toBeUndefined();
    expect(t.motionParams?.triggerTime).toBeUndefined();
    expect(t.reason).toMatch(/spoken keyword outside clip window/i);
  });

  // Test D — Entity fallback
  it('Regression Test D — Entity fallback: parses subject group and never extracts generic word "match"', () => {
    const item = createItem({
      id: 'item-subject-fallback',
      provenance: createProvenance({
        entityConsistencyModifier: 0.15,
        entityMatchReason: 'Direct entity match (+0.15): candidate matches narration subject (katrina, kaif)',
      }),
    });

    const resolved = resolveEntityForCandidate(item);
    expect(resolved).toBe('Katrina Kaif');
    expect(resolved).not.toBe('match');
    expect(resolved).not.toBe('entity');
    expect(resolved).not.toBe('direct');
  });

  // Test E — Suppressed entity label deferred to later eligible clip
  it('Regression Test E — Suppressed entity label: defers context label to subsequent clip if earlier appearance was suppressed', () => {
    const folder: MediaFolder = {
      id: 'f-vicky',
      name: 'Vicky Kaushal',
      createdAt: 1000,
    };

    const media = createMedia({
      id: 'm-vicky',
      folderIds: ['f-vicky'],
    });

    const seg = createSegment({
      id: 'seg-vicky',
      text: 'Vicky gave a spectacular performance.',
      words: [{ word: 'spectacular', start: 0.2, end: 0.8, confidence: 0.99 }],
    });

    // Clip 1: Has emphasis role + keyword -> receives EMPHASIS_TEXT, suppressing CONTEXT_LABEL
    const item1 = createItem({
      id: 'item-vicky-1',
      startTime: 0,
      duration: 3.0,
      mediaId: 'm-vicky',
      provenance: createProvenance({
        sourceSegmentId: 'seg-vicky',
        narrationRole: 'emphasis',
        candidateConfidenceLevel: 'HIGH',
        visualImpactScore: 0.85,
      }),
    });

    // Clip 2: Neutral clip immediately following -> typography suppressed by spacing guard (<= 1 clip from item1)
    const item2 = createItem({
      id: 'item-vicky-2',
      startTime: 3.0,
      duration: 3.0,
      mediaId: 'm-vicky',
      provenance: createProvenance({
        narrationRole: 'action',
        candidateConfidenceLevel: 'HIGH',
      }),
    });

    // Clip 3: 2 clips away from item1 -> Eligible! Must receive CONTEXT_LABEL
    const item3 = createItem({
      id: 'item-vicky-3',
      startTime: 6.0,
      duration: 3.0,
      mediaId: 'm-vicky',
      provenance: createProvenance({
        narrationRole: 'description',
        candidateConfidenceLevel: 'HIGH',
      }),
    });

    // Clip 4: Subsequent appearance -> Already introduced! Typography remains NONE
    const item4 = createItem({
      id: 'item-vicky-4',
      startTime: 9.0,
      duration: 3.0,
      mediaId: 'm-vicky',
      provenance: createProvenance({
        narrationRole: 'description',
        candidateConfidenceLevel: 'HIGH',
      }),
    });

    const plan = generateVisualTreatmentPlan([item1, item2, item3, item4], {
      mediaAssets: [media],
      folders: [folder],
      segments: [seg],
    });

    // Item 1 received EMPHASIS_TEXT
    expect(plan.treatments[item1.id].typography).toBe('EMPHASIS_TEXT');

    // Item 2 was suppressed by spacing guard
    expect(plan.treatments[item2.id].typography).toBe('NONE');

    // Item 3 must receive CONTEXT_LABEL because Vicky Kaushal was not yet introduced to the viewer!
    expect(plan.treatments[item3.id].typography).toBe('CONTEXT_LABEL');
    expect(plan.treatments[item3.id].text).toBe('Vicky Kaushal');

    // Item 4 must not receive repeated CONTEXT_LABEL
    expect(plan.treatments[item4.id].typography).toBe('NONE');
  });

  // Test F — Determinism remains intact
  it('Regression Test F — Determinism remains intact across complex scenarios', () => {
    const folder: MediaFolder = { id: 'f-det', name: 'Mount Everest', createdAt: 500 };
    const media = createMedia({ id: 'm-det', folderIds: ['f-det'], type: 'image' });
    const items = [
      createItem({ id: 'det-1', mediaId: 'm-det', startTime: 0, duration: 4.0, provenance: createProvenance() }),
      createItem({ id: 'det-2', mediaId: 'm-det', startTime: 4.0, duration: 3.0, provenance: createProvenance() }),
    ];

    const plan1 = generateVisualTreatmentPlan(items, { mediaAssets: [media], folders: [folder] });
    const plan2 = generateVisualTreatmentPlan(items, { mediaAssets: [media], folders: [folder] });

    expect(plan1).toEqual(plan2);
  });

  // ---------------------------------------------------------------------------
  // Stage 4A: FULLSCREEN_TEXT Story Card Tests
  // ---------------------------------------------------------------------------
  describe('Stage 4A: FULLSCREEN_TEXT Story Card Execution', () => {
    it('1. Triggers FULLSCREEN_TEXT on narrationRole: title with duration >= 2.5s', () => {
      const item = createItem({
        id: 'item-title-1',
        startTime: 0,
        duration: 3.5,
        provenance: createProvenance({
          narrationRole: 'title' as any,
          candidateConfidenceLevel: 'HIGH',
        }),
      });
      const seg = createSegment({
        id: 'seg-1',
        text: 'The Rise of Modern Cinema in India',
      });

      const plan = generateVisualTreatmentPlan([item], { segments: [seg] });
      const treatment = plan.treatments[item.id];

      expect(treatment).toBeDefined();
      expect(treatment.typography).toBe('FULLSCREEN_TEXT');
      expect(treatment.text).toBe('The Rise of Modern Cinema in India');
      expect(treatment.textTiming).toEqual({ start: 0, end: 3.5 });
      expect(plan.summary.fullscreenTexts).toBe(1);
    });

    it('2. Triggers FULLSCREEN_TEXT on narrationRole: chapter with entity priority', () => {
      const folder: MediaFolder = { id: 'f-1', name: 'Tokyo Drift Chapter', createdAt: 100 };
      const media = createMedia({ id: 'm-1', folderIds: ['f-1'] });
      const item = createItem({
        id: 'item-chap-1',
        mediaId: 'm-1',
        startTime: 10.0,
        duration: 4.0,
        provenance: createProvenance({
          narrationRole: 'chapter' as any,
          candidateConfidenceLevel: 'HIGH',
        }),
      });
      const seg = createSegment({
        id: 'seg-1',
        text: 'And here begins the thrilling journey across neon streets.',
      });

      const plan = generateVisualTreatmentPlan([item], {
        mediaAssets: [media],
        folders: [folder],
        segments: [seg],
      });
      const treatment = plan.treatments[item.id];

      expect(treatment).toBeDefined();
      expect(treatment.typography).toBe('FULLSCREEN_TEXT');
      // Entity/folder name takes priority over segment text
      expect(treatment.text).toBe('Tokyo Drift Chapter');
      expect(treatment.textTiming).toEqual({ start: 0, end: 4.0 });
    });

    it('3. Triggers FULLSCREEN_TEXT on narrationRole: intro at opening (i === 0)', () => {
      const item = createItem({
        id: 'item-intro-0',
        startTime: 0,
        duration: 3.0,
        provenance: createProvenance({
          narrationRole: 'intro' as any,
          beatPosition: 1,
          candidateConfidenceLevel: 'HIGH',
        }),
      });
      const seg = createSegment({
        id: 'seg-1',
        text: 'Welcome to this investigative documentary.',
      });

      const plan = generateVisualTreatmentPlan([item], { segments: [seg] });
      const treatment = plan.treatments[item.id];

      expect(treatment.typography).toBe('FULLSCREEN_TEXT');
      expect(treatment.text).toBe('Welcome to this investigative documentary.');
    });

    it('4. Does NOT trigger FULLSCREEN_TEXT on ordinary narrative roles (action, context, etc.)', () => {
      const item = createItem({
        id: 'item-ordinary',
        startTime: 0,
        duration: 3.0,
        provenance: createProvenance({
          narrationRole: 'action',
          candidateConfidenceLevel: 'HIGH',
        }),
      });
      const seg = createSegment({ id: 'seg-1', text: 'Action beat text here' });

      const plan = generateVisualTreatmentPlan([item], { segments: [seg] });
      expect(plan.treatments[item.id].typography).not.toBe('FULLSCREEN_TEXT');
    });

    it('5. Does NOT trigger FULLSCREEN_TEXT if duration < 2.5s', () => {
      const item = createItem({
        id: 'item-short-title',
        startTime: 0,
        duration: 2.0,
        provenance: createProvenance({
          narrationRole: 'title' as any,
          candidateConfidenceLevel: 'HIGH',
        }),
      });
      const seg = createSegment({ id: 'seg-1', text: 'Short Title' });

      const plan = generateVisualTreatmentPlan([item], { segments: [seg] });
      expect(plan.treatments[item.id].typography).toBe('NONE');
    });

    it('6. Does NOT trigger FULLSCREEN_TEXT on low-confidence matches', () => {
      const item = createItem({
        id: 'item-low-conf-title',
        startTime: 0,
        duration: 3.5,
        provenance: createProvenance({
          narrationRole: 'title' as any,
          candidateConfidenceLevel: 'LOW',
        }),
      });
      const seg = createSegment({ id: 'seg-1', text: 'Low Confidence Title' });

      const plan = generateVisualTreatmentPlan([item], { segments: [seg] });
      expect(plan.treatments[item.id].typography).toBe('NONE');
      expect(plan.treatments[item.id].motion).toBe('NORMAL_CLIP');
    });

    it('7. Enforces anti-consecutive FULLSCREEN_TEXT guardrail', () => {
      const item1 = createItem({
        id: 'item-title-1',
        startTime: 0,
        duration: 3.5,
        provenance: createProvenance({
          narrationRole: 'title' as any,
          candidateConfidenceLevel: 'HIGH',
        }),
      });
      const item2 = createItem({
        id: 'item-title-2',
        startTime: 3.5,
        duration: 3.5,
        provenance: createProvenance({
          narrationRole: 'title' as any,
          candidateConfidenceLevel: 'HIGH',
        }),
      });
      const seg = createSegment({ id: 'seg-1', text: 'Consecutive Title Candidate' });

      const plan = generateVisualTreatmentPlan([item1, item2], { segments: [seg] });
      expect(plan.treatments[item1.id].typography).toBe('FULLSCREEN_TEXT');
      // Second consecutive title item must NOT receive FULLSCREEN_TEXT
      expect(plan.treatments[item2.id].typography).not.toBe('FULLSCREEN_TEXT');
    });

    it('8. formatFullscreenCardText clamps words and characters gracefully with Unicode support', () => {
      // Short text
      expect(formatFullscreenCardText('Short Title')).toBe('Short Title');

      // More than 8 words
      const longWords = 'One two three four five six seven eight nine ten';
      const formattedWords = formatFullscreenCardText(longWords);
      expect(formattedWords).toBe('One two three four five six seven eight...');

      // Unicode / Multilingual (Hindi)
      const hindi = 'सिनेमा का इतिहास और नई शुरुआत';
      expect(formatFullscreenCardText(hindi)).toBe('सिनेमा का इतिहास और नई शुरुआत');

      // Empty text
      expect(formatFullscreenCardText('   ')).toBe('');
    });
  });
});
