import { registerPlugin } from '@capacitor/core';

export interface NativeWhisperTranscribeOptions {
  filePath: string;
  language?: string;
  threads?: number;
}

export interface NativeWhisperWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface NativeWhisperSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  confidence?: number;
  words?: NativeWhisperWord[];
}

export interface NativeWhisperTranscribeResult {
  status: string;
  language?: string;
  duration?: number;
  segments?: NativeWhisperSegment[];
  message?: string;
}

export interface NativeWhisperPlugin {
  transcribe(options: NativeWhisperTranscribeOptions): Promise<NativeWhisperTranscribeResult>;
  releaseModel(): Promise<{ success: boolean }>;
  getSystemInfo(): Promise<{ systemInfo: string }>;
}

const NativeWhisper = registerPlugin<NativeWhisperPlugin>('NativeWhisper');

export default NativeWhisper;
