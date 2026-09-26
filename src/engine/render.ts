import { LongFormProject } from '../types/project';
import { DEFAULT_BOLLYWOOD_FRAME } from './schema';
import { getRenderWorkerUrl } from '../config/workerConfig';
import { getBollywoodFrameBlob } from './frameAsset';

export const RENDER_WORKER_URL = getRenderWorkerUrl();

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
  try {
    const res = await fetch(`${workerUrl}/health`, { method: 'GET' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Initiates video rendering by bundling project data and local media files to the local worker.
 */
export async function requestVideoRender(
  project: LongFormProject,
  onProgress?: (progress: number, message: string) => void,
  options: { workerUrl?: string } = {}
): Promise<RenderJobResult> {
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
      formData.append('frame_overlay', frameBlob, 'bollywood_frame_overlay.png');
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
