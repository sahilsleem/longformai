import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as androidMedia from '../platform/androidMedia';
import NativeWhisper from './NativeWhisper';
import {
  transcribeAudioFile,
  checkTranscriptionWorkerHealth,
} from './transcription';

vi.mock('./NativeWhisper', () => ({
  default: {
    transcribe: vi.fn(),
    releaseModel: vi.fn(),
    getSystemInfo: vi.fn(),
  },
}));

describe('transcription engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('desktop / browser routing', () => {
    it('calls Python worker when not on Android', async () => {
      vi.spyOn(androidMedia, 'isNativeAndroid').mockReturnValue(false);

      const fakeResponse = {
        status: 'success',
        duration: 12.5,
        language: 'ur',
        segments: [
          {
            id: 'seg_1',
            start: 0.0,
            end: 5.2,
            text: 'یہ ایک آزمائشی آواز ہے۔',
            confidence: 0.95,
            words: [
              { word: 'یہ', start: 0.0, end: 1.0, confidence: 0.96 },
              { word: 'ایک', start: 1.1, end: 2.0, confidence: 0.95 },
            ],
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fakeResponse,
      } as any);

      const blob = new Blob(['fake audio'], { type: 'audio/mp3' });
      const res = await transcribeAudioFile(blob, 'sample.mp3', {
        workerUrl: 'http://127.0.0.1:8765',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8765/transcribe',
        expect.objectContaining({ method: 'POST' })
      );
      expect(res.duration).toBe(12.5);
      expect(res.language).toBe('ur');
      expect(res.segments).toHaveLength(1);
      expect(res.segments[0].text).toBe('یہ ایک آزمائشی آواز ہے۔');
      expect(res.segments[0].words).toHaveLength(2);
    });
  });

  describe('native Android routing', () => {
    it('routes to NativeWhisper plugin and formats AudioSegment[] properly', async () => {
      vi.spyOn(androidMedia, 'isNativeAndroid').mockReturnValue(true);

      const transcribeMock = vi.mocked(NativeWhisper.transcribe).mockResolvedValue({
        status: 'success',
        language: 'hi',
        duration: 8.4,
        segments: [
          {
            id: 'seg_1_0',
            start: 0.0,
            end: 4.2,
            text: 'नमस्ते दुनिया',
            confidence: 0.98,
            words: [
              { word: 'नमस्ते', start: 0.0, end: 2.1, confidence: 0.99 },
              { word: 'दुनिया', start: 2.2, end: 4.2, confidence: 0.97 },
            ],
          },
        ],
      });

      const res = await transcribeAudioFile(new Blob(['test']), 'narration.wav', {
        nativePath: '/data/user/0/com.longformai.app/files/narration.wav',
        language: 'hi',
      });

      expect(transcribeMock).toHaveBeenCalledWith({
        filePath: '/data/user/0/com.longformai.app/files/narration.wav',
        language: 'hi',
        threads: 4,
      });

      expect(res.language).toBe('hi');
      expect(res.duration).toBe(8.4);
      expect(res.segments[0].startTime).toBe(0.0);
      expect(res.segments[0].endTime).toBe(4.2);
      expect(res.segments[0].text).toBe('नमस्ते दुनिया');
      expect(res.segments[0].words).toHaveLength(2);
    });

    it('reports native health immediately on Android', async () => {
      vi.spyOn(androidMedia, 'isNativeAndroid').mockReturnValue(true);
      vi.mocked(NativeWhisper.getSystemInfo).mockResolvedValue({
        systemInfo: 'whisper.cpp neon',
      });

      const health = await checkTranscriptionWorkerHealth();
      expect(health.online).toBe(true);
      expect(health.engine).toBe('whisper.cpp (native)');
      expect(health.defaultModel).toBe('base');
    });
  });
});
