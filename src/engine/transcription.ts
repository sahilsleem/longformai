import { AudioSegment } from '../types/project';
import { getTranscriptionWorkerUrl } from '../config/workerConfig';
import { isNativeAndroid } from '../platform/androidMedia';
import { Filesystem, Directory } from '@capacitor/filesystem';
import NativeWhisper from './NativeWhisper';

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
  nativePath?: string;
  threads?: number;
}

export const DEFAULT_WORKER_URL = getTranscriptionWorkerUrl();

/**
 * Checks if the transcription worker/engine is running and available.
 */
export async function checkTranscriptionWorkerHealth(
  workerUrl: string = getTranscriptionWorkerUrl()
): Promise<TranscriptionWorkerStatus> {
  if (isNativeAndroid()) {
    try {
      await NativeWhisper.getSystemInfo();
      return {
        online: true,
        engine: 'whisper.cpp (native)',
        defaultModel: 'base',
        device: 'arm64',
      };
    } catch {
      return {
        online: true,
        engine: 'whisper.cpp (native)',
        defaultModel: 'base',
        device: 'arm64',
      };
    }
  }

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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function transcribeNativeAndroid(
  audioFileOrBlob?: File | Blob,
  fileName: string = 'voiceover.mp3',
  options: TranscriptionOptions = {}
): Promise<{ segments: AudioSegment[]; duration: number; language: string }> {
  let inputPath = options.nativePath ? options.nativePath.replace(/^file:\/\//, '') : undefined;
  let tempFileName: string | null = null;

  if (!inputPath) {
    if (!audioFileOrBlob) {
      throw new Error('No audio file or nativePath provided for transcription');
    }
    const ext = fileName.split('.').pop() || 'mp3';
    tempFileName = `vo_native_${Date.now()}.${ext}`;
    const base64Data = await blobToBase64(audioFileOrBlob);

    await Filesystem.writeFile({
      directory: Directory.Cache,
      path: tempFileName,
      data: base64Data,
    });

    const cacheUri = await Filesystem.getUri({
      directory: Directory.Cache,
      path: tempFileName,
    });
    inputPath = cacheUri.uri.replace(/^file:\/\//, '');
  }

  try {
    const result = await NativeWhisper.transcribe({
      filePath: inputPath,
      language: options.language || 'auto',
      threads: options.threads || 4,
    });

    const segments: AudioSegment[] = (result.segments || []).map((s, idx) => ({
      id: s.id || `seg_${idx + 1}_${Math.round((s.start || 0) * 100)}`,
      startTime: s.start,
      endTime: s.end,
      text: s.text,
      confidence: s.confidence,
      words: s.words ? s.words.map((w) => ({ ...w })) : undefined,
    }));

    const response = {
      segments,
      duration: result.duration || (segments.length > 0 ? segments[segments.length - 1].endTime : 0),
      language: result.language || 'en',
    };

    return response;
  } finally {
    if (tempFileName) {
      Filesystem.deleteFile({
        directory: Directory.Cache,
        path: tempFileName,
      }).catch(() => {});
    }
    // Always release Whisper model after transcription completes or fails
    try {
      await NativeWhisper.releaseModel();
    } catch (e) {
      console.warn('Failed to release NativeWhisper model:', e);
    }
  }
}

/**
 * Explicitly releases Native Whisper in-memory context on Android.
 */
export async function releaseTranscriptionModel(): Promise<void> {
  if (isNativeAndroid()) {
    try {
      await NativeWhisper.releaseModel();
    } catch (e) {
      console.warn('Failed to release NativeWhisper model:', e);
    }
  }
}

/**
 * Sends a local audio file or blob to transcription.
 * On Android: routes natively to whisper.cpp via NativeWhisperPlugin.
 * On Desktop/Browser: routes to Python transcription worker.
 * Purely local - zero cloud API calls.
 */
export async function transcribeAudioFile(
  audioFileOrBlob?: File | Blob,
  fileName: string = 'voiceover.mp3',
  options: TranscriptionOptions = {}
): Promise<{ segments: AudioSegment[]; duration: number; language: string }> {
  if (isNativeAndroid()) {
    return transcribeNativeAndroid(audioFileOrBlob, fileName, options);
  }

  if (!audioFileOrBlob) {
    throw new Error('Audio file source not available in memory.');
  }

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
