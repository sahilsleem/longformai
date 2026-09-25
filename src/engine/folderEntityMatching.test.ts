import { describe, it, expect } from 'vitest';
import {
  extractMediaIdentityTokens,
  calculateDirectEntityConsistencyModifier,
  generateDraftTimeline,
} from './draftTimeline';
import type { AudioSegment, MediaAsset, MediaFolder } from '../types/project';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMedia(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'media-1',
    name: 'vid_001.mp4',
    type: 'video',
    url: 'blob:http://localhost/mock-video-1',
    width: 1920,
    height: 1080,
    duration: 10,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9',
    createdAt: 1700000000000,
    folderIds: [],
    analysis: {
      analyzed: true,
      description: 'A person standing on a stage at an event',
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

describe('Media Folders as Explicit Identity Metadata in Draft Matching', () => {
  const folders: MediaFolder[] = [
    { id: 'f_katrina', name: 'Katrina Kaif', createdAt: 1000, updatedAt: 1000 },
    { id: 'f_salman', name: 'Salman Khan', createdAt: 1001, updatedAt: 1001 },
    { id: 'f_vicky', name: 'Vicky Kaushal', createdAt: 1002, updatedAt: 1002 },
    { id: 'f_broll', name: 'B-Roll', createdAt: 1003, updatedAt: 1003 },
    { id: 'f_background', name: 'Background', createdAt: 1004, updatedAt: 1004 },
    { id: 'f_events', name: 'Events', createdAt: 1005, updatedAt: 1005 },
    { id: 'f_other', name: 'Other', createdAt: 1006, updatedAt: 1006 },
    { id: 'f_misc', name: 'Misc', createdAt: 1007, updatedAt: 1007 },
    { id: 'f_event_footage', name: 'Event Footage', createdAt: 1008, updatedAt: 1008 },
  ];

  // 1. Folder-based token extraction
  it('extracts identity tokens from assigned folders', () => {
    const asset = makeMedia({ id: 'vid_kat', name: 'vid001.mp4', folderIds: ['f_katrina'] });
    const tokens = extractMediaIdentityTokens(asset, folders);
    expect(tokens).toContain('katrina');
    expect(tokens).toContain('kaif');
  });

  // 2. Narration "Katrina Kaif..." selects Katrina folder media over higher semantic score generic media
  it('selects Katrina folder media over higher raw semantic score generic media', async () => {
    const katrinaMedia = makeMedia({
      id: 'vid_katrina',
      name: 'vid001.mp4',
      folderIds: ['f_katrina'],
      analysis: {
        analyzed: true,
        description: 'A person standing at an event', // low generic description
      },
    });

    const genericMedia = makeMedia({
      id: 'vid_generic',
      name: 'vid002.mp4',
      folderIds: ['f_broll'],
      analysis: {
        analyzed: true,
        description: 'Katrina Kaif arrived at the awards ceremony dazzling the crowd', // highly similar description
      },
    });

    const segments = [
      makeSegment({ id: 'seg-1', text: 'Katrina Kaif arrived at the grand gala.', startTime: 0, endTime: 5 }),
    ];

    const result = await generateDraftTimeline(segments, [katrinaMedia, genericMedia], {
      folders,
      similarityThreshold: 0.15,
    });

    expect(result.timeline.length).toBe(1);
    expect(result.timeline[0].mediaId).toBe('vid_katrina');
  });

  // 3. Narration "Salman Khan stepped on stage." selects Salman folder media
  it('selects Salman folder media when Salman Khan is mentioned', async () => {
    const salmanMedia = makeMedia({
      id: 'vid_salman',
      name: 'vid002.mp4',
      folderIds: ['f_salman'],
      analysis: { analyzed: true, description: 'A speaker addressing the audience' },
    });

    const katrinaMedia = makeMedia({
      id: 'vid_katrina',
      name: 'vid001.mp4',
      folderIds: ['f_katrina'],
      analysis: { analyzed: true, description: 'A celebrity smiling on stage' },
    });

    const segments = [
      makeSegment({ id: 'seg-1', text: 'Salman Khan stepped on stage to receive his award.', startTime: 0, endTime: 5 }),
    ];

    const result = await generateDraftTimeline(segments, [katrinaMedia, salmanMedia], { folders });

    expect(result.timeline.length).toBe(1);
    expect(result.timeline[0].mediaId).toBe('vid_salman');
  });

  // 4. Multiple identities in narration ("Salman Khan and Katrina Kaif...")
  it('rewards media assigned to both folders when narration references both entities', () => {
    const multiFolderMedia = makeMedia({
      id: 'vid_both',
      name: 'vid005.mp4',
      folderIds: ['f_salman', 'f_katrina'],
    });

    const narration = 'Salman Khan and Katrina Kaif walked together on the red carpet.';
    const result = calculateDirectEntityConsistencyModifier(narration, multiFolderMedia, [], folders);

    expect(result.status).toBe('MATCH');
    expect(result.modifier).toBe(0.15);
    expect(result.matchedTokens).toContain('salman');
    expect(result.matchedTokens).toContain('katrina');
  });

  // 5. Media assigned to multiple celebrity folders (Katrina + Vicky)
  it('matches single celebrity mentions for multi-folder media', () => {
    const multiMedia = makeMedia({
      id: 'vid_vicky_kat',
      name: 'clip10.mp4',
      folderIds: ['f_katrina', 'f_vicky'],
    });

    // Mention Katrina only
    const resKat = calculateDirectEntityConsistencyModifier('Katrina gave a speech.', multiMedia, [], folders);
    expect(resKat.status).toBe('MATCH');
    expect(resKat.matchedTokens).toContain('katrina');

    // Mention Vicky only
    const resVicky = calculateDirectEntityConsistencyModifier('Vicky cheered from the front row.', multiMedia, [], folders);
    expect(resVicky.status).toBe('MATCH');
    expect(resVicky.matchedTokens).toContain('vicky');
  });

  // 6. Case and punctuation normalization in folder names
  it('normalizes folder names with punctuation, dashes, and casing', () => {
    const customFolders: MediaFolder[] = [
      { id: 'f1', name: 'Katrina-Kaif', createdAt: 1, updatedAt: 1 },
      { id: 'f2', name: 'ranveer_singh_official', createdAt: 2, updatedAt: 2 },
      { id: 'f3', name: 'DEEPIKA PADUKONE', createdAt: 3, updatedAt: 3 },
    ];

    const m1 = makeMedia({ id: 'm1', name: 'clip1.mp4', folderIds: ['f1'] });
    const m2 = makeMedia({ id: 'm2', name: 'clip2.mp4', folderIds: ['f2'] });
    const m3 = makeMedia({ id: 'm3', name: 'clip3.mp4', folderIds: ['f3'] });

    expect(extractMediaIdentityTokens(m1, customFolders)).toEqual(expect.arrayContaining(['katrina', 'kaif']));
    expect(extractMediaIdentityTokens(m2, customFolders)).toEqual(expect.arrayContaining(['ranveer', 'singh']));
    expect(extractMediaIdentityTokens(m3, customFolders)).toEqual(expect.arrayContaining(['deepika', 'padukone']));
  });

  // 7. Generic folders ("B-Roll", "Background", "Events", "Other", "Misc", "Event Footage") do not become celebrity entities
  it('treats generic folders as neutral stopwords producing zero identity tokens', () => {
    const genericFoldersMedia = [
      makeMedia({ id: 'g1', name: '1001.mp4', folderIds: ['f_broll'] }),
      makeMedia({ id: 'g2', name: '1002.mp4', folderIds: ['f_background'] }),
      makeMedia({ id: 'g3', name: '1003.mp4', folderIds: ['f_events'] }),
      makeMedia({ id: 'g4', name: '1004.mp4', folderIds: ['f_other'] }),
      makeMedia({ id: 'g5', name: '1005.mp4', folderIds: ['f_misc'] }),
      makeMedia({ id: 'g6', name: '1006.mp4', folderIds: ['f_event_footage'] }),
    ];

    for (const media of genericFoldersMedia) {
      const tokens = extractMediaIdentityTokens(media, folders);
      expect(tokens).toEqual([]);
      const mod = calculateDirectEntityConsistencyModifier('Katrina Kaif was seen today.', media, [], folders);
      expect(mod.status).toBe('NEUTRAL');
      expect(mod.modifier).toBe(0.0);
    }
  });

  // 8. Narration with no explicit person keeps normal semantic ranking
  it('maintains neutral status and normal ranking for narration without person entities', () => {
    const katrinaMedia = makeMedia({ id: 'vid_kat', name: 'vid01.mp4', folderIds: ['f_katrina'] });
    const narration = 'The city skyline looked breathtaking during sunset.';

    const result = calculateDirectEntityConsistencyModifier(narration, katrinaMedia, [], folders);
    expect(result.status).toBe('NEUTRAL');
    expect(result.modifier).toBe(0.0);
  });

  // 9. Confirmed folder identity survives candidate pre-filtering below threshold
  it('allows media with confirmed folder identity to survive pre-filtering even below threshold', async () => {
    const katrinaMedia = makeMedia({
      id: 'vid_katrina_low_score',
      name: 'vid999.mp4',
      folderIds: ['f_katrina'],
      analysis: {
        analyzed: true,
        description: 'An abstract visual background', // extremely low similarity to narration
      },
    });

    const segments = [
      makeSegment({
        id: 'seg-1',
        text: 'Katrina Kaif spoke passionately about her journey.',
        startTime: 0,
        endTime: 5,
      }),
    ];

    const result = await generateDraftTimeline(segments, [katrinaMedia], {
      folders,
      similarityThreshold: 0.60, // very high threshold
    });

    // Even though similarity is below 0.60, direct folder entity match allows it to survive pre-filtering
    expect(result.timeline.length).toBe(1);
    expect(result.timeline[0].mediaId).toBe('vid_katrina_low_score');
  });

  // 10. Deterministic output
  it('produces identical deterministic output across repeated runs', async () => {
    const katrinaMedia = makeMedia({ id: 'vid_kat', name: 'vid01.mp4', folderIds: ['f_katrina'] });
    const salmanMedia = makeMedia({ id: 'vid_sal', name: 'vid02.mp4', folderIds: ['f_salman'] });
    const brollMedia = makeMedia({ id: 'vid_broll', name: 'vid03.mp4', folderIds: ['f_broll'] });

    const segments = [
      makeSegment({ id: 'seg-1', text: 'Salman Khan greeted the audience.', startTime: 0, endTime: 6 }),
      makeSegment({ id: 'seg-2', text: 'Katrina Kaif smiled from the stage.', startTime: 7, endTime: 13 }),
    ];

    const run1 = await generateDraftTimeline(segments, [katrinaMedia, salmanMedia, brollMedia], { folders });
    const run2 = await generateDraftTimeline(segments, [katrinaMedia, salmanMedia, brollMedia], { folders });

    expect(run1.timeline.map((t) => t.mediaId)).toEqual(run2.timeline.map((t) => t.mediaId));
    expect(run1.timeline[0].mediaId).toBe('vid_sal');
    expect(run1.timeline[1].mediaId).toBe('vid_kat');
  });
});
