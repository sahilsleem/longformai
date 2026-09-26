import { describe, it, expect } from 'vitest';
import {
  calculateDirectEntityConsistencyModifier,
  generateDraftTimeline,
} from './draftTimeline';
import type { AudioSegment, MediaAsset, MediaFolder } from '../types/project';

function makeMedia(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'media-1',
    name: 'test_video.mp4',
    type: 'video',
    url: 'blob:http://localhost/mock-video',
    width: 1920,
    height: 1080,
    duration: 30,
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
    text: 'Narration text',
    startTime: 0,
    endTime: 5,
    ...overrides,
  };
}

describe('Multilingual Entity Normalization and Ranking Protection', () => {
  const folders: MediaFolder[] = [
    { id: 'f_salman', name: 'Salman Khan', createdAt: 1001, updatedAt: 1001 },
    { id: 'f_katrina', name: 'Katrina Kaif', createdAt: 1002, updatedAt: 1002 },
    { id: 'f_broll', name: 'B-Roll', createdAt: 1003, updatedAt: 1003 },
  ];

  const salmanAsset = makeMedia({
    id: 'salman_vid',
    name: 'salman_clip.mp4',
    folderIds: ['f_salman'],
  });

  const katrinaAsset = makeMedia({
    id: 'katrina_vid',
    name: 'katrina_clip.mp4',
    folderIds: ['f_katrina'],
  });

  const genericAsset = makeMedia({
    id: 'generic_vid',
    name: 'city_night_broll.mp4',
    folderIds: ['f_broll'],
  });

  const allMedia = [salmanAsset, katrinaAsset, genericAsset];

  // 1. English Entity Detection
  describe('English entity detection', () => {
    it('detects "Salman Khan" as Salman', () => {
      const res = calculateDirectEntityConsistencyModifier('Salman Khan arrived on stage.', salmanAsset, allMedia, folders);
      expect(res.status).toBe('MATCH');
      expect(res.modifier).toBe(0.15);
    });

    it('detects "Katrina Kaif" as Katrina', () => {
      const res = calculateDirectEntityConsistencyModifier('Katrina Kaif was awarded best actress.', katrinaAsset, allMedia, folders);
      expect(res.status).toBe('MATCH');
      expect(res.modifier).toBe(0.15);
    });
  });

  // 2. Urdu / Arabic Script Entity Detection
  describe('Urdu script entity detection', () => {
    it('detects "سلمان خان" as Salman', () => {
      const res = calculateDirectEntityConsistencyModifier('سلمان خان نے تقریب میں شرکت کی۔', salmanAsset, allMedia, folders);
      expect(res.status).toBe('MATCH');
      expect(res.modifier).toBe(0.15);
    });

    it('detects single word "سلمان" as Salman', () => {
      const res = calculateDirectEntityConsistencyModifier('سلمان نے خود بتایا کہ انہوں نے وزن کم کیا۔', salmanAsset, allMedia, folders);
      expect(res.status).toBe('MATCH');
      expect(res.modifier).toBe(0.15);
    });

    it('detects "کترینہ کیف" as Katrina', () => {
      const res = calculateDirectEntityConsistencyModifier('یہ کترینہ کیف کی ایک نئی فلم ہے۔', katrinaAsset, allMedia, folders);
      expect(res.status).toBe('MATCH');
      expect(res.modifier).toBe(0.15);
    });

    it('detects single word "کترینہ" or phonetic "قترینا" as Katrina', () => {
      const res1 = calculateDirectEntityConsistencyModifier('کترینہ نے اپنی خوبصورتی سے سب کو متاثر کیا۔', katrinaAsset, allMedia, folders);
      expect(res1.status).toBe('MATCH');
      expect(res1.modifier).toBe(0.15);

      const res2 = calculateDirectEntityConsistencyModifier('یہ قترینا کافی ہے یا پھر ان کا چہرہ بدل گیا۔', katrinaAsset, allMedia, folders);
      expect(res2.status).toBe('MATCH');
      expect(res2.modifier).toBe(0.15);
    });
  });

  // 3. Hindi / Devanagari Script Entity Detection
  describe('Hindi / Devanagari script entity detection', () => {
    it('detects "सलमान खान" as Salman', () => {
      const res = calculateDirectEntityConsistencyModifier('सलमान खान ने अपनी नई फिल्म की घोषणा की।', salmanAsset, allMedia, folders);
      expect(res.status).toBe('MATCH');
      expect(res.modifier).toBe(0.15);
    });

    it('detects single word "सलमान" as Salman', () => {
      const res = calculateDirectEntityConsistencyModifier('सलमान हमेशा अपने फैंस के बीच लोकप्रिय रहे हैं।', salmanAsset, allMedia, folders);
      expect(res.status).toBe('MATCH');
      expect(res.modifier).toBe(0.15);
    });

    it('detects "कटरीना कैफ" / "कैटरीना कैफ" as Katrina', () => {
      const res = calculateDirectEntityConsistencyModifier('कटरीना कैफ का यह नया लुक सोशल मीडिया पर वायरल है।', katrinaAsset, allMedia, folders);
      expect(res.status).toBe('MATCH');
      expect(res.modifier).toBe(0.15);
    });

    it('detects single word "कटरीना" / "कैटरीना" as Katrina', () => {
      const res = calculateDirectEntityConsistencyModifier('कैटरीना ने इवेंट में शानदार डांस परफॉर्मेंस दी।', katrinaAsset, allMedia, folders);
      expect(res.status).toBe('MATCH');
      expect(res.modifier).toBe(0.15);
    });
  });

  // 4. Entity Conflict
  describe('Entity conflict handling', () => {
    it('penalizes conflicting Katrina asset when narration explicitly mentions Salman in Urdu', () => {
      const narration = 'سلمان نے خود بتایا کہ انہوں نے سولہ کلو وزن کم کیا ہے۔';
      const salmanRes = calculateDirectEntityConsistencyModifier(narration, salmanAsset, allMedia, folders);
      const katrinaRes = calculateDirectEntityConsistencyModifier(narration, katrinaAsset, allMedia, folders);

      expect(salmanRes.status).toBe('MATCH');
      expect(salmanRes.modifier).toBe(0.15);

      expect(katrinaRes.status).toBe('CONFLICT');
      expect(katrinaRes.modifier).toBe(-0.15);
    });

    it('penalizes conflicting Salman asset when narration explicitly mentions Katrina in Hindi', () => {
      const narration = 'कटरीना कैफ ने अपने फिटनेस रूटीन के बारे में बताया।';
      const katrinaRes = calculateDirectEntityConsistencyModifier(narration, katrinaAsset, allMedia, folders);
      const salmanRes = calculateDirectEntityConsistencyModifier(narration, salmanAsset, allMedia, folders);

      expect(katrinaRes.status).toBe('MATCH');
      expect(katrinaRes.modifier).toBe(0.15);

      expect(salmanRes.status).toBe('CONFLICT');
      expect(salmanRes.modifier).toBe(-0.15);
    });
  });

  // 5. Reuse Protection (Entity Match > Reuse Penalty)
  describe('Reuse protection vs. conflicting entity', () => {
    it('keeps repeatedly used Salman asset selected over conflicting Katrina asset', async () => {
      const segments: AudioSegment[] = [
        makeSegment({ id: 's1', text: 'سلمان خان نے پہلی بار یہ بات بتائی۔', startTime: 0, endTime: 5 }),
        makeSegment({ id: 's2', text: 'سلمان نے کہا کہ وہ روزانہ ورزش کرتے ہیں۔', startTime: 5, endTime: 10 }),
        makeSegment({ id: 's3', text: 'سلمان ہمیشہ اپنے فیصلے خود کرتے ہیں۔', startTime: 10, endTime: 15 }),
      ];

      const result = await generateDraftTimeline(segments, [salmanAsset, katrinaAsset], {
        folders,
        similarityThreshold: 0.30,
        reusePenalty: 0.08,
      });

      expect(result.timeline.length).toBe(3);
      // Even with reuse penalty accumulating, all 3 beats must select Salman and never switch to Katrina!
      expect(result.timeline[0].mediaId).toBe('salman_vid');
      expect(result.timeline[1].mediaId).toBe('salman_vid');
      expect(result.timeline[2].mediaId).toBe('salman_vid');
    });
  });

  // 6. Mixed Entity Beats
  describe('Mixed-entity beats', () => {
    it('marks both entities as MATCH when narration mentions both Salman and Katrina', () => {
      const narration = 'ایک طرف قترینا کافی دوسری طرف سلمان کھان جن کا لگ بدل گیا۔';
      const salmanRes = calculateDirectEntityConsistencyModifier(narration, salmanAsset, allMedia, folders);
      const katrinaRes = calculateDirectEntityConsistencyModifier(narration, katrinaAsset, allMedia, folders);

      expect(salmanRes.status).toBe('MATCH');
      expect(salmanRes.modifier).toBe(0.15);

      expect(katrinaRes.status).toBe('MATCH');
      expect(katrinaRes.modifier).toBe(0.15);
    });
  });

  // 7. Non-Entity Narration
  describe('Non-entity narration', () => {
    it('returns NEUTRAL (0.0) for both assets when narration is generic', () => {
      const narration = 'شہر کی خوبصورت سڑکوں پر رات کا منظر بہت دلکش دکھائی دے رہا تھا۔';
      const salmanRes = calculateDirectEntityConsistencyModifier(narration, salmanAsset, allMedia, folders);
      const katrinaRes = calculateDirectEntityConsistencyModifier(narration, katrinaAsset, allMedia, folders);
      const genericRes = calculateDirectEntityConsistencyModifier(narration, genericAsset, allMedia, folders);

      expect(salmanRes.status).toBe('NEUTRAL');
      expect(salmanRes.modifier).toBe(0.0);

      expect(katrinaRes.status).toBe('NEUTRAL');
      expect(katrinaRes.modifier).toBe(0.0);

      expect(genericRes.status).toBe('NEUTRAL');
      expect(genericRes.modifier).toBe(0.0);
    });
  });

  // 8. Same-Entity Reuse
  describe('Same-entity continuous reuse', () => {
    it('allows clean single-asset reuse across an entity-specific monologue', async () => {
      const segments: AudioSegment[] = [
        makeSegment({ id: 's1', text: 'कटरीना कैफ का करियर हमेशा चर्चा में रहा।', startTime: 0, endTime: 5 }),
        makeSegment({ id: 's2', text: 'कटरीना ने कई सुपरहिट फिल्मों में काम किया।', startTime: 5, endTime: 10 }),
      ];

      const result = await generateDraftTimeline(segments, [katrinaAsset, genericAsset], {
        folders,
        similarityThreshold: 0.30,
        reusePenalty: 0.08,
      });

      expect(result.timeline.length).toBe(2);
      expect(result.timeline[0].mediaId).toBe('katrina_vid');
      expect(result.timeline[1].mediaId).toBe('katrina_vid');
    });
  });

  // 9. Real-World Sample 6 Project Test
  describe('Sample 6 Real-World Regression Test', () => {
    it('verifies explicit entity beats are correctly assigned without ping-pong degradation', async () => {
      // @ts-ignore
      const fs = await import('node:fs');
      const rawData = fs.readFileSync('C:/Users/Asma/Downloads/untitled_longform_project.longform (6).json', 'utf8');
      const proj = JSON.parse(rawData).project;

      const result = await generateDraftTimeline(
        proj.voiceover.segments,
        proj.media,
        {
          similarityThreshold: 0.30,
          reusePenalty: 0.08,
          preferVideoOverImage: true,
          folders: proj.folders || [],
        }
      );

      expect(result.timeline.length).toBe(23);

      const salmanAssetId = 'media_1790417316253_cdzjl'; // raazz.filmae (salman khan folder)
      const katrinaAssetId = 'media_1790417328597_uvgm3'; // buzzzookaprime (katrina kaif folder)

      console.log('\n================ SAMPLE 6 BEAT-BY-BEAT TRACE (NEW) ================');
      result.timeline.forEach((item, idx) => {
        const media = proj.media.find((m: any) => m.id === item.mediaId);
        const folder = proj.folders?.find((f: any) => media?.folderIds?.includes(f.id));
        console.log(`Beat #${idx + 1} [${item.startTime.toFixed(1)}s - ${(item.startTime + item.duration).toFixed(1)}s] -> ${folder?.name.toUpperCase()} (${media?.name}) | EntityMod: ${item.provenance?.entityConsistencyModifier} | AdjScore: ${item.provenance?.adjustedScore} | Reuse: ${item.provenance?.reuseCount}`);
      });
      console.log('====================================================================\n');

      // Beat #1 ("یہ قترینا کافی ہے یا پھر کچھ سالوں میں...") explicitly discusses Katrina
      expect(result.timeline[0].mediaId).toBe(katrinaAssetId);
      expect(result.timeline[0].provenance?.entityConsistencyModifier).toBe(0.15);

      // Beat #2 ("βیڈیوں میں قترینا کا بضلہ ہوا لگ دیکھ...") explicitly discusses Katrina
      // In the old broken baseline, Beat #2 ping-ponged to Salman due to reuse penalty!
      // Now it must stay on Katrina!
      expect(result.timeline[1].mediaId).toBe(katrinaAssetId);
      expect(result.timeline[1].provenance?.entityConsistencyModifier).toBe(0.15);

      // Beat #15 ("سلمان نے خود بتایا تھا کہ انہوں نے سولہ کلو وجن کم کیا ہے...") explicitly discusses Salman
      expect(result.timeline[14].mediaId).toBe(salmanAssetId);
      expect(result.timeline[14].provenance?.entityConsistencyModifier).toBe(0.15);

      // Beat #22 ("سلمان ہمیشہ وہی سلمان ہے لیکن اصلی جندگی میں ستارے...") explicitly discusses Salman
      // In the old broken baseline, Beat #22 ping-ponged to Katrina due to reuse penalty!
      // Now it must stay on Salman!
      expect(result.timeline[21].mediaId).toBe(salmanAssetId);
      expect(result.timeline[21].provenance?.entityConsistencyModifier).toBe(0.15);
    });
  });
});

