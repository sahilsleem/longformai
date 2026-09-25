import { describe, it, expect } from 'vitest';
import {
  groupAudioSegmentsIntoVisualBeats,
  detectEntityInText,
  splitLongAudioSegment,
  generateDraftTimeline,
} from './draftTimeline';
import type { AudioSegment, MediaAsset, MediaFolder } from '../types/project';

function makeMedia(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'media-1',
    name: 'sample_video.mp4',
    type: 'video',
    url: 'blob:http://localhost/video-1',
    width: 1920,
    height: 1080,
    duration: 15,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9',
    createdAt: 1000,
    folderIds: [],
    analysis: {
      analyzed: true,
      description: 'A person smiling and talking on stage',
      tags: ['event', 'person'],
    },
    ...overrides,
  };
}

describe('Visual Narration Beats Engine (Meaning-Driven Visual Cuts)', () => {
  const folders: MediaFolder[] = [
    {
      id: 'f_katrina',
      name: 'Katrina Kaif',
      aliases: ['کترینہ', 'کترینہ کیف', 'कैटरीना'],
      createdAt: 1000,
    },
    {
      id: 'f_salman',
      name: 'Salman Khan',
      aliases: ['سلمان', 'سلمان خان', 'सलमान'],
      createdAt: 1001,
    },
    {
      id: 'f_broll',
      name: 'B-Roll',
      createdAt: 1002,
    },
  ];

  // 1. Combining several short adjacent transcript segments belonging to one thought
  it('combines several short adjacent transcript segments belonging to one thought into one visual beat', () => {
    const rawSegments: AudioSegment[] = [
      { id: 's1', startTime: 0.0, endTime: 1.2, text: 'Katrina Kaif' },
      { id: 's2', startTime: 1.2, endTime: 2.7, text: 'बहुत अच्छी' },
      { id: 's3', startTime: 2.7, endTime: 4.1, text: 'लगती है।' },
    ];

    const beats = groupAudioSegmentsIntoVisualBeats(rawSegments, folders);
    expect(beats.length).toBe(1);
    expect(beats[0].startTime).toBe(0.0);
    expect(beats[0].endTime).toBe(4.1);
    expect(beats[0].text).toBe('Katrina Kaif बहुत अच्छी लगती है।');
  });

  // 2. Clear entity change creates a new visual beat immediately
  it('creates a new visual beat immediately when a clear entity change occurs', () => {
    const rawSegments: AudioSegment[] = [
      { id: 's1', startTime: 0.0, endTime: 1.2, text: 'Katrina Kaif' },
      { id: 's2', startTime: 1.2, endTime: 2.7, text: 'बहुत अच्छी' },
      { id: 's3', startTime: 2.7, endTime: 4.1, text: 'लगती है' },
      { id: 's4', startTime: 4.1, endTime: 7.9, text: 'पर Salman Khan ने ये किया।' },
    ];

    const beats = groupAudioSegmentsIntoVisualBeats(rawSegments, folders);
    expect(beats.length).toBe(2);

    // Beat 1: Katrina thought
    expect(beats[0].startTime).toBe(0.0);
    expect(beats[0].endTime).toBe(4.1);
    expect(beats[0].text).toBe('Katrina Kaif बहुत अच्छी लगती है');

    // Beat 2: Salman thought
    expect(beats[1].startTime).toBe(4.1);
    expect(beats[1].endTime).toBe(7.9);
    expect(beats[1].text).toBe('पर Salman Khan ने ये किया।');
  });

  // 3. End-to-end generateDraftTimeline selects distinct media for each beat based on complete beat text
  it('matches media against complete beat text and switches media on entity change', async () => {
    const katrinaMedia = makeMedia({
      id: 'm_katrina',
      name: 'katrina_dance.mp4',
      folderIds: ['f_katrina'],
      analysis: { analyzed: true, description: 'Katrina Kaif performing dance', tags: ['katrina', 'dance'] },
    });
    const salmanMedia = makeMedia({
      id: 'm_salman',
      name: 'salman_interview.mp4',
      folderIds: ['f_salman'],
      analysis: { analyzed: true, description: 'Salman Khan speaking at press conference', tags: ['salman', 'press'] },
    });

    const rawSegments: AudioSegment[] = [
      { id: 's1', startTime: 0.0, endTime: 1.2, text: 'Katrina Kaif' },
      { id: 's2', startTime: 1.2, endTime: 2.7, text: 'बहुत अच्छी' },
      { id: 's3', startTime: 2.7, endTime: 4.1, text: 'लगती है' },
      { id: 's4', startTime: 4.1, endTime: 8.0, text: 'पर Salman Khan ने ये किया।' },
    ];

    const result = await generateDraftTimeline(rawSegments, [katrinaMedia, salmanMedia], {
      folders,
      similarityThreshold: 0.20,
    });

    expect(result.timeline.length).toBe(2);
    // Shot 1: Katrina Media
    expect(result.timeline[0].mediaId).toBe('m_katrina');
    expect(result.timeline[0].startTime).toBe(0.0);
    expect(result.timeline[0].duration).toBe(4.1);

    // Shot 2: Salman Media
    expect(result.timeline[1].mediaId).toBe('m_salman');
    expect(result.timeline[1].startTime).toBe(4.1);
    expect(result.timeline[1].duration).toBe(3.9);
  });

  // 4. Genuinely short beat is not artificially stretched
  it('does not artificially stretch a genuinely short beat beyond its narration duration', () => {
    const rawSegments: AudioSegment[] = [
      { id: 's1', startTime: 0.0, endTime: 2.5, text: 'This was a brief introductory statement.' },
      { id: 's2', startTime: 2.5, endTime: 6.8, text: 'Afterwards, the entire team proceeded with the main demonstration.' },
    ];

    const beats = groupAudioSegmentsIntoVisualBeats(rawSegments, folders);
    expect(beats.length).toBe(2);
    expect(beats[0].endTime - beats[0].startTime).toBe(2.5);
    expect(beats[1].endTime - beats[1].startTime).toBe(4.3);
  });

  // 5. Long narration (>8s) is split only at sensible boundaries
  it('splits long narration exceeding 8 seconds at natural boundaries', () => {
    const longSegmentWithWords: AudioSegment = {
      id: 'long_seg',
      startTime: 0.0,
      endTime: 12.0,
      text: 'The historic palace was built in the early eighteenth century, and it remained the royal family residence until the revolution.',
      words: [
        { word: 'The', start: 0.0, end: 0.4 },
        { word: 'historic', start: 0.4, end: 1.0 },
        { word: 'palace', start: 1.0, end: 1.6 },
        { word: 'was', start: 1.6, end: 1.9 },
        { word: 'built', start: 1.9, end: 2.5 },
        { word: 'in', start: 2.5, end: 2.8 },
        { word: 'the', start: 2.8, end: 3.1 },
        { word: 'early', start: 3.1, end: 3.6 },
        { word: 'eighteenth', start: 3.6, end: 4.5 },
        { word: 'century,', start: 4.5, end: 5.5 },
        { word: 'and', start: 5.5, end: 5.8 },
        { word: 'it', start: 5.8, end: 6.1 },
        { word: 'remained', start: 6.1, end: 6.9 },
        { word: 'the', start: 6.9, end: 7.2 },
        { word: 'royal', start: 7.2, end: 7.7 },
        { word: 'family', start: 7.7, end: 8.4 },
        { word: 'residence', start: 8.4, end: 9.3 },
        { word: 'until', start: 9.3, end: 9.8 },
        { word: 'the', start: 9.8, end: 10.1 },
        { word: 'revolution.', start: 10.1, end: 12.0 },
      ],
    };

    const subBeats = splitLongAudioSegment(longSegmentWithWords, 8.0);
    expect(subBeats.length).toBeGreaterThan(1);
    for (const b of subBeats) {
      const dur = b.endTime - b.startTime;
      expect(dur).toBeLessThanOrEqual(8.0);
      expect(dur).toBeGreaterThanOrEqual(2.5);
    }
    expect(subBeats[0].startTime).toBe(0.0);
    expect(subBeats[subBeats.length - 1].endTime).toBe(12.0);
  });

  // 6. Ultra-short segments (<1s) are absorbed into adjacent compatible segments
  it('absorbs sub-second segments into adjacent compatible segments without leaving ultra-short cuts', () => {
    const rawSegments: AudioSegment[] = [
      { id: 's1', startTime: 0.0, endTime: 0.5, text: 'In fact,' },
      { id: 's2', startTime: 0.5, endTime: 3.8, text: 'the results exceeded all initial laboratory projections.' },
      { id: 's3', startTime: 3.8, endTime: 4.2, text: 'However,' },
      { id: 's4', startTime: 4.2, endTime: 7.5, text: 'further clinical testing remains necessary.' },
    ];

    const beats = groupAudioSegmentsIntoVisualBeats(rawSegments, folders);
    expect(beats.length).toBe(2);
    expect(beats[0].startTime).toBe(0.0);
    expect(beats[0].endTime).toBe(3.8);
    expect(beats[0].text).toContain('In fact');
    expect(beats[0].endTime - beats[0].startTime).toBeGreaterThanOrEqual(3.0);

    expect(beats[1].startTime).toBe(3.8);
    expect(beats[1].endTime).toBe(7.5);
    expect(beats[1].text).toContain('However');
    expect(beats[1].endTime - beats[1].startTime).toBeGreaterThanOrEqual(3.0);
  });

  // 7. Meaningful sentence boundary cuts when visual duration is in sweet spot (4–7s)
  it('cuts at natural sentence boundaries when duration has reached a comfortable shot length (>= 3.5s)', () => {
    const rawSegments: AudioSegment[] = [
      { id: 's1', startTime: 0.0, endTime: 4.2, text: 'The city skyline looked breathtaking at dawn.' },
      { id: 's2', startTime: 4.2, endTime: 8.6, text: 'Morning commuters began filling the central station concourse.' },
    ];

    const beats = groupAudioSegmentsIntoVisualBeats(rawSegments, folders);
    expect(beats.length).toBe(2);
    expect(beats[0].endTime - beats[0].startTime).toBeCloseTo(4.2, 1);
    expect(beats[1].endTime - beats[1].startTime).toBeCloseTo(4.4, 1);
  });

  // 8. Urdu cross-script entity detection
  it('correctly detects Urdu entity in text using detectEntityInText', () => {
    expect(detectEntityInText('یہ کترینہ کیف ہے', folders)).toBe('f_katrina');
    expect(detectEntityInText('سلمان خان اسٹیج پر آئے', folders)).toBe('f_salman');
    expect(detectEntityInText('یہ ایک عام قدرتی منظر ہے', folders)).toBeNull();
  });
});
