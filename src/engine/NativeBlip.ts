import { registerPlugin } from '@capacitor/core';

export interface NativeBlipStatus {
  ready: boolean;
  state: 'uninitialized' | 'extracting' | 'loading' | 'ready' | 'error';
  error?: string;
}

export interface NativeBlipCaptionOptions {
  imageData: string; // base64 string or data URL (e.g. data:image/jpeg;base64,...)
}

export interface NativeBlipCaptionResult {
  status: string;
  caption: string;
  totalDurationMs: number;
  encoderDurationMs: number;
  decoderDurationMs: number;
  tokenCount: number;
}

export interface NativeBlipPlugin {
  isReady(): Promise<NativeBlipStatus>;
  initialize(): Promise<NativeBlipStatus>;
  generateCaption(options: NativeBlipCaptionOptions): Promise<NativeBlipCaptionResult>;
  releaseModel(): Promise<{ success: boolean }>;
}

export const NativeBlip = registerPlugin<NativeBlipPlugin>('NativeBlip');

if (typeof window !== 'undefined') {
  (window as any).NativeBlip = NativeBlip;
}

export default NativeBlip;
