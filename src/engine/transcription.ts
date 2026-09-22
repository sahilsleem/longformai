import { AudioSegment } from '../types/project';
import { getTranscriptionWorkerUrl } from '../config/workerConfig';

export interface TranscriptionWorkerStatus {
  online: boolean;
  engine?: string;
  defaultModel?: string;
  device?: string;
  error?: string;
}

export interface TranscriptionOptions {
  workerUrl?: string;
  modelSize?: 'tiny' | 'base' | 'small' | 'medium';
  language?: string;
}

export const DEFAULT_WORKER_URL = getTranscriptionWorkerUrl();

/**
 * Checks if the local transcription worker is running.
 */
export async function checkTranscriptionWorkerHealth(
  workerUrl: string = getTranscriptionWorkerUrl()
): Promise<TranscriptionWorkerStatus> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${workerUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        online: true,
        engine: data.engine || 'faster-whisper',
        defaultModel: data.default_model || 'base',
        device: data.default_device || 'cpu',
      };
    }
    return { online: false, error: `Worker returned HTTP ${res.status}` };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return {
      online: false,
      error: `Local worker unreachable at ${workerUrl} (${errorMessage})`,
    };
  }
}

/**
 * Sends a local audio file or blob to the local transcription worker.
 * Purely local - zero cloud API calls.
 */
export async function transcribeAudioFile(
  audioFileOrBlob: File | Blob,
  fileName: string = 'voiceover.mp3',
  options: TranscriptionOptions = {}
): Promise<{ segments: AudioSegment[]; duration: number; language: string }> {
  const workerUrl = options.workerUrl || DEFAULT_WORKER_URL;
  const modelSize = options.modelSize || 'base';

  const formData = new FormData();
  formData.append('file', audioFileOrBlob, fileName);
  formData.append('model_size', modelSize);
  if (options.language) {
    formData.append('language', options.language);
  }

  try {
    const response = await fetch(`${workerUrl}/transcribe`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errorJson = await response.json();
        detail = errorJson.detail || detail;
      } catch {
        // fallback
      }
      throw new Error(`Transcription failed: ${detail}`);
    }

    const data = await response.json();

    const segments: AudioSegment[] = (data.segments || []).map(
      (s: {
        id: string;
        start: number;
        end: number;
        text: string;
        confidence?: number;
        words?: Array<{ word: string; start: number; end: number; confidence?: number }>;
      }) => ({
        id: s.id || `seg_${Math.random().toString(36).substring(2, 7)}`,
        startTime: s.start,
        endTime: s.end,
        text: s.text,
        confidence: s.confidence,
        words: s.words,
      })
    );

    return {
      segments,
      duration: data.duration || 0,
      language: data.language || 'en',
    };
  } catch (err: unknown) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(
        `Local transcription worker is not running on ${workerUrl}. Please start it using: python server/transcribe_server.py`
      );
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}
