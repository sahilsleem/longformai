import {
  WORKER_PORTS,
  getWorkerUrl,
} from '../config/workerConfig';

export interface WorkerDiagnostic {
  name: string;
  port: number;
  url: string;
  isOnline: boolean;
  statusText: 'Ready' | 'Loading' | 'Not running' | 'Model not installed' | 'Error';
  details?: Record<string, any>;
  errorMessage?: string;
}

export async function checkAllWorkers(customHost?: string): Promise<WorkerDiagnostic[]> {
  const workers = [
    { name: 'Whisper Transcription Worker', port: WORKER_PORTS.TRANSCRIPTION },
    { name: 'BLIP Vision Understanding Worker', port: WORKER_PORTS.VISION },
    { name: 'Semantic Matching Worker', port: WORKER_PORTS.MATCHING },
    { name: 'FFmpeg Master Render Worker', port: WORKER_PORTS.RENDERING },
  ];

  const results: WorkerDiagnostic[] = [];

  for (const w of workers) {
    const url = `${getWorkerUrl(w.port, customHost)}/health`;
    try {
      const resp = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2500) });
      if (resp.ok) {
        const data = await resp.json();
        let statusText: WorkerDiagnostic['statusText'] = 'Ready';

        if (data.state === 'model_not_installed') {
          statusText = 'Model not installed';
        } else if (data.state === 'loading') {
          statusText = 'Loading';
        } else if (data.state === 'error' || data.error) {
          statusText = 'Error';
        } else if (w.port === 8768 && !data.ffmpegAvailable) {
          statusText = 'Error';
        }

        results.push({
          name: w.name,
          port: w.port,
          url,
          isOnline: true,
          statusText,
          details: data,
        });
      } else {
        results.push({
          name: w.name,
          port: w.port,
          url,
          isOnline: false,
          statusText: 'Error',
          errorMessage: `HTTP ${resp.status}`,
        });
      }
    } catch (e: any) {
      results.push({
        name: w.name,
        port: w.port,
        url,
        isOnline: false,
        statusText: 'Not running',
        errorMessage: e.message || 'Connection refused',
      });
    }
  }

  return results;
}
