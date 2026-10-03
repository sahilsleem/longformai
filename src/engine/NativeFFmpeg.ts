import { registerPlugin } from '@capacitor/core';

export interface NativeFFmpegExecuteOptions {
  arguments: string[];
}

export interface NativeFFmpegExecuteResult {
  returnCode: number;
  success: boolean;
  cancel: boolean;
  output: string;
}

export interface NativeFFmpegSaveToGalleryOptions {
  filePath: string;
  filename?: string;
  relativePath?: string;
}

export interface NativeFFmpegSaveToGalleryResult {
  success: boolean;
  uri: string;
  filename: string;
  relativePath: string;
}

export interface NativeFFmpegShareVideoOptions {
  uri: string;
  filename?: string;
  title?: string;
}

export interface NativeFFmpegShareVideoResult {
  success: boolean;
}

export interface NativeFFmpegPlugin {
  execute(options: NativeFFmpegExecuteOptions): Promise<NativeFFmpegExecuteResult>;
  saveToGallery(options: NativeFFmpegSaveToGalleryOptions): Promise<NativeFFmpegSaveToGalleryResult>;
  shareVideo(options: NativeFFmpegShareVideoOptions): Promise<NativeFFmpegShareVideoResult>;
}

const NativeFFmpeg = registerPlugin<NativeFFmpegPlugin>('NativeFFmpeg');

export async function testFFmpegVersion(): Promise<string> {
  try {
    const result = await NativeFFmpeg.execute({ arguments: ['-version'] });
    if (result.success) {
      console.log('FFmpeg version check success:\\n', result.output);
      return result.output;
    } else {
      console.error('FFmpeg version check failed:', result);
      return `Failed with code ${result.returnCode}`;
    }
  } catch (err) {
    console.error('FFmpeg version check error:', err);
    throw err;
  }
}

export default NativeFFmpeg;
