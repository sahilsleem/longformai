import { LongFormProject } from '../types/project';
import { DEFAULT_BOLLYWOOD_FRAME } from './schema';
import { getRenderWorkerUrl } from '../config/workerConfig';
import { getBollywoodFrameBlob } from './frameAsset';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import NativeFFmpeg from './NativeFFmpeg';
import { buildSegmentCommand, buildConcatCommand } from './ffmpegBuilder';
import { resolveRenderPlan } from './renderPlan';
import { generateTypographyOverlayBase64 } from './typographyAsset';

export const RENDER_WORKER_URL = getRenderWorkerUrl();

import { isNativeAndroid } from '../platform/androidMedia';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

export async function renderVideoNativeAndroid(
  project: LongFormProject,
  onProgress?: (progress: number, message: string) => void
): Promise<RenderJobResult> {
  try {
    const cacheDir = await Filesystem.getUri({ directory: Directory.Cache, path: '' });
    const cacheBase = cacheDir.uri.replace(/^file:\/\//, '');

    onProgress?.(5, 'Preparing native rendering paths...');
    const outName = `longform_${Date.now()}.mp4`;
    const finalOut = `${cacheBase}/${outName}`;
    const concatTxtPath = `${cacheBase}/concat.txt`;

    const mediaMap = new Map<string, string>();
    for (const m of project.media) {
      if (m.nativePath) mediaMap.set(m.id, m.nativePath.replace(/^file:\/\//, ''));
    }

    const segmentPaths: string[] = [];
    const renderPlan = resolveRenderPlan(project);
    const totalSegments = renderPlan.segments.length;
    const tempTypographyFiles: string[] = [];

    try {
      for (let i = 0; i < totalSegments; i++) {
        const segment = renderPlan.segments[i];
        const segmentOut = `${cacheBase}/segment_${i}.mp4`;
        segmentPaths.push(segmentOut);

        let mediaNativePath: string | undefined;
        let mediaDef: any;

        if (!segment.isGap && segment.timelineItem) {
          mediaNativePath = mediaMap.get(segment.timelineItem.mediaId);
          mediaDef = project.media.find(m => m.id === segment.timelineItem!.mediaId);
        }

        let overlayNativePath: string | undefined;
        let overlayStart: number | undefined;
        let overlayEnd: number | undefined;

        if (segment.typographyOverlay) {
          try {
            const overlayFilename = `typo_${i}_${Date.now()}.png`;
            const base64Data = await generateTypographyOverlayBase64({
              type: segment.typographyOverlay.type,
              text: segment.typographyOverlay.text,
            });
            await Filesystem.writeFile({
              directory: Directory.Cache,
              path: overlayFilename,
              data: base64Data,
            });
            overlayNativePath = `${cacheBase}/${overlayFilename}`;
            overlayStart = segment.typographyOverlay.startTime;
            overlayEnd = segment.typographyOverlay.endTime;
            tempTypographyFiles.push(overlayFilename);
          } catch (e) {
            console.warn(`Could not generate typography overlay for segment ${i}:`, e);
          }
        }

        const segCmd = buildSegmentCommand({
          isGap: segment.isGap,
          timelineItem: segment.timelineItem,
          treatment: segment.treatment,
          mediaPath: mediaNativePath,
          duration: segment.duration,
          outPath: segmentOut,
          isImage: mediaDef?.type === 'image',
          width: mediaDef?.width,
          height: mediaDef?.height,
          overlayPath: overlayNativePath,
          overlayStart,
          overlayEnd,
        });

        const args = segCmd[0] === 'ffmpeg' ? segCmd.slice(1) : segCmd;
        onProgress?.(10 + (i / totalSegments) * 50, `Rendering segment ${i + 1}/${totalSegments}...`);

        const result = await NativeFFmpeg.execute({ arguments: args });
        if (!result.success) {
          throw new Error(`Segment ${i} render failed: ${result.returnCode}\n${result.output}`);
        }
      }

      onProgress?.(65, 'Creating concatenation plan...');
      let concatData = '';
      for (const p of segmentPaths) {
        concatData += `file '${p}'\n`;
      }
      await Filesystem.writeFile({
        directory: Directory.Cache,
        path: 'concat.txt',
        data: concatData,
        encoding: Encoding.UTF8
      });

      let voPath: string | undefined;
      if (project.voiceover?.nativePath) {
        voPath = project.voiceover.nativePath.replace(/^file:\/\//, '');
      } else if (project.voiceover?.url) {
         try {
           const resp = await fetch(project.voiceover.url);
           const blob = await resp.blob();
           const b64 = await blobToBase64(blob);
           await Filesystem.writeFile({ directory: Directory.Cache, path: 'vo.wav', data: b64 });
           voPath = `${cacheBase}/vo.wav`;
         } catch (e) {
           console.warn('Could not process voiceover natively:', e);
         }
      }

      let framePath: string | undefined;
      const frameConfig = project.frame || { enabled: true };
      if (frameConfig.enabled !== false) {
         try {
           const frameBlob = await getBollywoodFrameBlob(frameConfig.src);
           const b64 = await blobToBase64(frameBlob);
           await Filesystem.writeFile({ directory: Directory.Cache, path: 'frame.png', data: b64 });
           framePath = `${cacheBase}/frame.png`;
         } catch (e) {
           console.warn('Could not process frame overlay natively:', e);
         }
      }

      const totalDuration = project.timeline.reduce((acc, item) => acc + item.duration, 0);

      onProgress?.(70, 'Running final video assembly...');
      const concatCmd = buildConcatCommand({
        concatListPath: concatTxtPath,
        voiceoverPath: voPath,
        totalDuration: totalDuration,
        outPath: finalOut,
        frameConfig: {
          enabled: frameConfig.enabled !== false,
          id: frameConfig.id || '',
          name: frameConfig.name || '',
          src: frameConfig.src || ''
        },
        overlayAssetPath: framePath
      });

      const finalArgs = concatCmd[0] === 'ffmpeg' ? concatCmd.slice(1) : concatCmd;
      const concatRes = await NativeFFmpeg.execute({ arguments: finalArgs });
      if (!concatRes.success) {
        throw new Error(`Concat render failed: ${concatRes.returnCode}\n${concatRes.output}`);
      }

      const stat = await Filesystem.stat({ directory: Directory.Cache, path: outName });
      onProgress?.(95, 'Saving to Android Gallery...');

      const galleryFilename = `LongFormAI_${Date.now()}.mp4`;
      let mediaStoreUri = finalOut;
      try {
        if (typeof NativeFFmpeg.saveToGallery === 'function') {
          const mediaStoreRes = await NativeFFmpeg.saveToGallery({
            filePath: finalOut,
            filename: galleryFilename,
            relativePath: 'Movies/LongFormAI/',
          });
          if (mediaStoreRes?.uri) {
            mediaStoreUri = mediaStoreRes.uri;
          }
        }
      } catch (e) {
        console.warn('Could not save to MediaStore:', e);
      }

      onProgress?.(100, 'Render complete!');

      return {
        success: true,
        outputPath: mediaStoreUri,
        downloadUrl: finalOut,
        filename: galleryFilename,
        width: 1920,
        height: 1080,
        fps: 30,
        duration: totalDuration,
        sizeBytes: stat.size,
        aspectRatio: '16:9',
        videoCodec: 'libx264',
        audioCodec: 'aac'
      };
    } finally {
      for (const tempFile of tempTypographyFiles) {
        try {
          await Filesystem.deleteFile({ directory: Directory.Cache, path: tempFile });
        } catch {
          // ignore cleanup errors
        }
      }
    }
  } catch (err) {
    console.error('renderVideoNativeAndroid failed:', err);
    throw err;
  }
}

export interface RenderHealth {
  status: string;
  service: string;
  engine: string;
  ffmpegAvailable: boolean;
  ffmpegVersion?: string;
  exportsDir?: string;
}

export interface RenderJobResult {
  success: boolean;
  outputPath: string;
  downloadUrl: string;
  filename: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  sizeBytes: number;
  aspectRatio: string;
  videoCodec: string;
  audioCodec: string;
}

export interface RenderJobStatus {
  jobId: string;
  status: 'rendering' | 'completed' | 'failed';
  progress: number;
  message: string;
  result?: RenderJobResult;
  error?: string;
}

/**
 * Checks if the local FFmpeg rendering worker is running.
 */
export async function checkRenderWorkerHealth(
  workerUrl: string = getRenderWorkerUrl()
): Promise<RenderHealth | null> {
  if (isNativeAndroid()) {
    return {
      status: 'ok',
      service: 'android-native-renderer',
      engine: 'ffmpegkit',
      ffmpegAvailable: true
    };
  }

  try {
    const res = await fetch(`${workerUrl}/health`, { method: 'GET' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Saves a completed native video file to the Android MediaStore under Movies/LongFormAI/.
 */
export async function saveVideoToMediaStore(
  filePath: string,
  filename?: string
): Promise<{ success: boolean; uri: string; filename: string; relativePath: string }> {
  if (isNativeAndroid() && typeof NativeFFmpeg.saveToGallery === 'function') {
    return NativeFFmpeg.saveToGallery({
      filePath,
      filename,
      relativePath: 'Movies/LongFormAI/',
    });
  }

  return {
    success: true,
    uri: filePath,
    filename: filename || `LongFormAI_${Date.now()}.mp4`,
    relativePath: 'Movies/LongFormAI/',
  };
}

/**
 * Opens the native Android share sheet for a rendered video using its MediaStore URI.
 */
export async function shareRenderedVideoNativeAndroid(
  uri: string,
  filename?: string,
  title?: string
): Promise<{ success: boolean }> {
  if (!isNativeAndroid()) {
    throw new Error('Native sharing is only available on Android');
  }

  if (!uri || !uri.startsWith('content://')) {
    throw new Error('Invalid MediaStore URI. The video must be exported to Gallery before sharing.');
  }

  if (typeof NativeFFmpeg.shareVideo !== 'function') {
    throw new Error('Native share plugin method is not available');
  }

  return NativeFFmpeg.shareVideo({
    uri,
    filename,
    title: title || filename || 'Share Video',
  });
}

/**
 * Saves a native rendered file from the app's cache directory to the public Documents directory.
 */
export async function saveNativeRenderOutput(filename: string): Promise<string> {
  const safeName = `exported_${Date.now()}_${filename}`;
  await Filesystem.copy({
    from: filename,
    directory: Directory.Cache,
    to: safeName,
    toDirectory: Directory.Documents,
  });
  return safeName;
}

/**
 * Initiates video rendering by bundling project data and local media files to the local worker.
 */
export async function requestVideoRender(
  project: LongFormProject,
  onProgress?: (progress: number, message: string) => void,
  options: { workerUrl?: string } = {}
): Promise<RenderJobResult> {
  // Android must always use the native FFmpeg renderer — the desktop Python
  // render worker is never available on a physical device.  Assets without a
  // nativePath are safely handled as black-gap segments by ffmpegBuilder.
  if (isNativeAndroid()) {
    return renderVideoNativeAndroid(project, onProgress);
  }

  const workerUrl = options.workerUrl || getRenderWorkerUrl();

  // 1. Verify worker is online
  const health = await checkRenderWorkerHealth(workerUrl);
  if (!health || !health.ffmpegAvailable) {
    throw new Error(`Local FFmpeg Render Worker is offline on ${workerUrl}. Run python server/render_server.py`);
  }

  onProgress?.(5, 'Packaging project timeline & media files...');

  const formData = new FormData();

  const frameConfig = project.frame
    ? {
        enabled: typeof project.frame.enabled === 'boolean' ? project.frame.enabled : true,
        id: project.frame.id || DEFAULT_BOLLYWOOD_FRAME.id,
        name: project.frame.name || DEFAULT_BOLLYWOOD_FRAME.name,
        src: project.frame.src || DEFAULT_BOLLYWOOD_FRAME.src,
      }
    : { ...DEFAULT_BOLLYWOOD_FRAME };

  // Attach sanitized project metadata
  const projectPayload = {
    version: project.version,
    id: project.id,
    name: project.name,
    resolution: project.resolution,
    fps: project.fps,
    timeline: project.timeline,
    media: project.media.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      width: m.width,
      height: m.height,
      duration: m.duration,
      aspectRatio: m.aspectRatio,
    })),
    voiceover: project.voiceover
      ? {
          id: project.voiceover.id,
          name: project.voiceover.name,
          duration: project.voiceover.duration,
          volume: project.voiceover.volume,
          isMuted: project.voiceover.isMuted,
        }
      : undefined,
    frame: frameConfig,
  };

  formData.append('project_json', JSON.stringify(projectPayload));

  // Attach frame overlay PNG if frame is enabled
  if (frameConfig.enabled) {
    try {
      const frameBlob = await getBollywoodFrameBlob(frameConfig.src);
      formData.append('frame_overlay', frameBlob, 'pip.png');
      console.log('FRAME DEBUG CLIENT', {
        enabled: true,
        frameConfig,
        overlayBlobExists: Boolean(frameBlob),
        overlayBlobSize: frameBlob.size,
        overlayBlobType: frameBlob.type,
        formDataContainsFrameOverlay: formData.has('frame_overlay'),
      });
    } catch (e) {
      console.error('Failed to attach frame overlay blob to render request:', e);
      throw new Error(`Persistent frame is enabled, but the frame overlay asset could not be loaded: ${e}`);
    }
  }

  // Attach voiceover file
  if (project.voiceover) {
    if (project.voiceover.file) {
      formData.append('voiceover', project.voiceover.file, project.voiceover.name || 'voiceover.wav');
    } else if (project.voiceover.url) {
      try {
        const resp = await fetch(project.voiceover.url);
        const blob = await resp.blob();
        formData.append('voiceover', blob, project.voiceover.name || 'voiceover.wav');
      } catch (e) {
        console.warn('Could not fetch voiceover blob for rendering:', e);
      }
    }
  }

  // Attach all media files used in timeline or project
  const usedMediaIds = new Set(project.timeline.map((item) => item.mediaId));
  for (const asset of project.media) {
    // Only upload assets that are actually used in the timeline
    if (!usedMediaIds.has(asset.id)) continue;

    if (asset.file) {
      // Use asset.id as prefix or name so server maps accurately
      formData.append('media_files', asset.file, `${asset.id}_${asset.name}`);
    } else if (asset.url) {
      try {
        const resp = await fetch(asset.url);
        const blob = await resp.blob();
        formData.append('media_files', blob, `${asset.id}_${asset.name}`);
      } catch (e) {
        console.warn(`Could not fetch blob for asset ${asset.name}:`, e);
      }
    }
  }

  onProgress?.(10, 'Submitting render job to local FFmpeg worker...');

  const startResp = await fetch(`${workerUrl}/render/multipart`, {
    method: 'POST',
    body: formData,
  });

  if (!startResp.ok) {
    const errText = await startResp.text();
    throw new Error(`Failed to queue render job: ${errText}`);
  }

  const { jobId } = await startResp.json();
  if (!jobId) {
    throw new Error('Render worker did not return a jobId');
  }

  // Poll until job completes
  while (true) {
    await new Promise((r) => setTimeout(r, 600));
    const statusResp = await fetch(`${workerUrl}/jobs/${jobId}`);
    if (!statusResp.ok) {
      throw new Error(`Failed to check job status: HTTP ${statusResp.status}`);
    }

    const jobData: RenderJobStatus = await statusResp.json();

    if (jobData.status === 'rendering') {
      onProgress?.(jobData.progress || 20, jobData.message || 'Rendering video frames with FFmpeg...');
    } else if (jobData.status === 'completed') {
      if (!jobData.result) {
        throw new Error('Render completed but no result was returned');
      }
      onProgress?.(100, 'Render complete!');
      return jobData.result;
    } else if (jobData.status === 'failed') {
      throw new Error(jobData.error || 'Video render failed in FFmpeg');
    }
  }
}
