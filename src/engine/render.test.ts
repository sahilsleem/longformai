import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRenderWorkerHealth, requestVideoRender } from './render';
import * as androidMedia from '../platform/androidMedia';
import { Filesystem } from '@capacitor/filesystem';
import NativeFFmpeg from './NativeFFmpeg';
import { getBollywoodFrameBlob } from './frameAsset';
import type { LongFormProject } from '../types/project';

// Mock the androidMedia module
vi.mock('../platform/androidMedia', () => ({
  isNativeAndroid: vi.fn(),
}));

// Mock Capacitor Filesystem so renderVideoNativeAndroid can execute without a real device
vi.mock('@capacitor/filesystem', () => {
  const getUriFn = vi.fn().mockResolvedValue({ uri: 'file:///data/data/com.longformai.app/cache' });
  const writeFileFn = vi.fn().mockResolvedValue({});
  const statFn = vi.fn().mockResolvedValue({ size: 1024 });
  return {
    Filesystem: {
      getUri: getUriFn,
      writeFile: writeFileFn,
      stat: statFn,
    },
    Directory: { Cache: 'CACHE', Data: 'DATA' },
    Encoding: { UTF8: 'utf8' },
  };
});

// Mock NativeFFmpeg so segment/concat calls succeed without a real device
vi.mock('./NativeFFmpeg', () => ({
  default: {
    execute: vi.fn().mockResolvedValue({ success: true, returnCode: 0, cancel: false, output: '' }),
  },
}));

// Mock frameAsset to avoid real fetch for the frame overlay
vi.mock('./frameAsset', () => ({
  getBollywoodFrameBlob: vi.fn().mockResolvedValue(new Blob(['fake'], { type: 'image/png' })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal project with NO nativePath on any asset — the exact scenario that triggered the bug */
function makeProjectWithoutNativePaths(): LongFormProject {
  return {
    version: '1.0',
    id: 'test_project',
    name: 'Test Project',
    resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
    fps: 30,
    media: [
      {
        id: 'media_1',
        name: 'clip.mp4',
        type: 'video',
        url: 'blob:http://localhost/fake',
        // nativePath is intentionally ABSENT
        width: 1920,
        height: 1080,
        duration: 5,
        aspectRatio: '16:9',
      },
    ],
    timeline: [
      {
        id: 'item_1',
        mediaId: 'media_1',
        trackIndex: 0,
        startTime: 0,
        duration: 5,
        sourceStart: 0,
        sourceDuration: 5,
      },
    ],
    folders: [],
    frame: { enabled: false, id: '', name: '', src: '' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as LongFormProject;
}

/** Project with nativePath set — the normal native-import scenario */
function makeProjectWithNativePaths(): LongFormProject {
  const p = makeProjectWithoutNativePaths();
  p.media[0].nativePath = 'file:///data/data/com.longformai.app/files/media_abc.mp4';
  return p;
}

// ---------------------------------------------------------------------------
// checkRenderWorkerHealth
// ---------------------------------------------------------------------------

describe('checkRenderWorkerHealth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('Android: checkRenderWorkerHealth() -> ffmpegAvailable === true without fetch', async () => {
    vi.mocked(androidMedia.isNativeAndroid).mockReturnValue(true);

    const health = await checkRenderWorkerHealth();

    expect(health).toEqual({
      status: 'ok',
      service: 'android-native-renderer',
      engine: 'ffmpegkit',
      ffmpegAvailable: true,
    });
  });

  it('Desktop/browser: existing Python worker health behavior remains unchanged', async () => {
    vi.mocked(androidMedia.isNativeAndroid).mockReturnValue(false);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        service: 'python-render-worker',
        engine: 'ffmpeg',
        ffmpegAvailable: true,
      }),
    });

    const health = await checkRenderWorkerHealth('http://127.0.0.1:8765');

    expect(health).toEqual({
      status: 'ok',
      service: 'python-render-worker',
      engine: 'ffmpeg',
      ffmpegAvailable: true,
    });

    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:8765/health', { method: 'GET' });
  });

  it('Desktop/browser: handles offline Python worker correctly', async () => {
    vi.mocked(androidMedia.isNativeAndroid).mockReturnValue(false);

    global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const health = await checkRenderWorkerHealth('http://127.0.0.1:8765');

    expect(health).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// requestVideoRender — routing decision
// ---------------------------------------------------------------------------

describe('requestVideoRender routing', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    originalFetch = globalThis.fetch;
    // Restore mocks that resetAllMocks clears
    vi.mocked(Filesystem.getUri).mockResolvedValue({ uri: 'file:///data/data/com.longformai.app/cache' });
    vi.mocked(Filesystem.writeFile).mockResolvedValue({} as any);
    vi.mocked(Filesystem.stat).mockResolvedValue({ size: 1024 } as any);
    vi.mocked(NativeFFmpeg.execute).mockResolvedValue({ success: true, returnCode: 0, cancel: false, output: '' });
    vi.mocked(getBollywoodFrameBlob).mockResolvedValue(new Blob(['fake'], { type: 'image/png' }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('Android + zero nativePath assets → native renderer is selected, no Python fetch', async () => {
    vi.mocked(androidMedia.isNativeAndroid).mockReturnValue(true);

    // Install a spy that should NEVER be called
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const project = makeProjectWithoutNativePaths();
    const result = await requestVideoRender(project);

    // Should successfully complete via native renderer
    expect(result.success).toBe(true);

    // fetch must NOT have been called — no Python worker access
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Android + nativePath assets → native renderer is selected', async () => {
    vi.mocked(androidMedia.isNativeAndroid).mockReturnValue(true);

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const project = makeProjectWithNativePaths();
    const result = await requestVideoRender(project);

    expect(result.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Desktop/browser → uses Python render worker, not native renderer', async () => {
    vi.mocked(androidMedia.isNativeAndroid).mockReturnValue(false);

    // The full call sequence inside requestVideoRender on desktop:
    // 1. checkRenderWorkerHealth → fetch(workerUrl/health)
    // 2. fetch(asset.url) → resp.blob()  (for each media asset in timeline)
    // 3. fetch(workerUrl/render/multipart, POST) → { jobId }
    // 4. fetch(workerUrl/jobs/job_123) → completed result
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        // 1. health check
        ok: true,
        json: async () => ({
          status: 'ok',
          service: 'python-render-worker',
          engine: 'ffmpeg',
          ffmpegAvailable: true,
        }),
      })
      .mockResolvedValueOnce({
        // 2. asset blob fetch
        ok: true,
        blob: async () => new Blob(['fake-video'], { type: 'video/mp4' }),
      })
      .mockResolvedValueOnce({
        // 3. POST /render/multipart
        ok: true,
        json: async () => ({ jobId: 'job_123' }),
      })
      .mockResolvedValueOnce({
        // 4. GET /jobs/job_123 → completed
        ok: true,
        json: async () => ({
          status: 'completed',
          progress: 100,
          message: 'Done',
          result: {
            success: true,
            outputPath: '/exports/out.mp4',
            downloadUrl: 'http://127.0.0.1:8765/exports/out.mp4',
            filename: 'out.mp4',
            width: 1920,
            height: 1080,
            fps: 30,
            duration: 5,
            sizeBytes: 2048,
            aspectRatio: '16:9',
            videoCodec: 'libx264',
            audioCodec: 'aac',
          },
        }),
      });

    const project = makeProjectWithoutNativePaths();
    const result = await requestVideoRender(project, undefined, {
      workerUrl: 'http://127.0.0.1:8765',
    });

    expect(result.success).toBe(true);
    expect(result.downloadUrl).toContain('127.0.0.1:8765');

    // Verify fetch was called (health + render POST + job poll)
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('Desktop/browser offline → throws worker-offline error, not native fallback', async () => {
    vi.mocked(androidMedia.isNativeAndroid).mockReturnValue(false);

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const project = makeProjectWithoutNativePaths();

    await expect(
      requestVideoRender(project, undefined, { workerUrl: 'http://127.0.0.1:8765' })
    ).rejects.toThrow('Local FFmpeg Render Worker is offline');
  });
});
