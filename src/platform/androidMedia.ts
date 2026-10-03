import { Capacitor } from '@capacitor/core';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Filesystem, Directory } from '@capacitor/filesystem';

export const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export interface NativeMediaAsset {
  nativePath: string;
  webPath: string;
  name: string;
  mimeType: string;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
}

export interface NativeVoiceoverAsset {
  nativePath: string;
  webPath: string;
  name: string;
  mimeType: string;
  size: number;
  duration?: number;
}

/**
 * Opens the native Android file picker for audio, copies the selected voiceover
 * to app-private persistent storage (Directory.Data), and returns the asset metadata.
 */
export async function pickAndroidVoiceover(): Promise<NativeVoiceoverAsset | null> {
  if (!isNativeAndroid()) return null;

  const result = await FilePicker.pickFiles({
    types: ['audio/*'],
    readData: false,
    limit: 1,
  });

  if (!result.files || result.files.length === 0) return null;
  const file = result.files[0];
  if (!file.path) return null;

  const ext = file.name.split('.').pop() || 'mp3';
  const destName = `voiceover_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

  const copyResult = await Filesystem.copy({
    from: file.path,
    to: destName,
    toDirectory: Directory.Data,
  });

  const webPath = Capacitor.convertFileSrc(copyResult.uri);

  return {
    nativePath: copyResult.uri,
    webPath,
    name: file.name,
    mimeType: file.mimeType || 'audio/mpeg',
    size: file.size,
    duration: file.duration,
  };
}

/**
 * Opens the native Android media picker, copies the selected files to app-private
 * persistent storage (so they survive app restarts), and returns the asset metadata.
 */
export async function pickAndroidMedia(): Promise<NativeMediaAsset[]> {
  if (!isNativeAndroid()) return [];

  const result = await FilePicker.pickMedia({ readData: false, limit: 0 });
  const assets: NativeMediaAsset[] = [];

  for (const file of result.files) {
    if (!file.path) continue; // Skip if no path is provided

    // Generate a unique filename
    const ext = file.name.split('.').pop() || 'media';
    const destName = `media_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

    // Copy to app Data directory for persistence
    const copyResult = await Filesystem.copy({
      from: file.path,
      to: destName,
      toDirectory: Directory.Data
    });

    // The copyResult.uri is an absolute file URI or content URI, convert to web path
    const webPath = Capacitor.convertFileSrc(copyResult.uri);

    assets.push({
      nativePath: copyResult.uri,
      webPath,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      duration: file.duration,
      width: file.width,
      height: file.height
    });
  }

  return assets;
}

export function resolveNativeMediaUrl(nativePath: string): string {
  if (isNativeAndroid()) {
    return Capacitor.convertFileSrc(nativePath);
  }
  return '';
}

export async function removeNativeMedia(nativePath: string): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
     // Since nativePath is an absolute URI, we don't pass `directory`.
     await Filesystem.deleteFile({ path: nativePath });
  } catch(e) {
     console.warn('Failed to delete native media', e);
  }
}
