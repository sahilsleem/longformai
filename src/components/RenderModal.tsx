import React, { useState, useEffect } from 'react';
import {
  Video,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  Layers,
  Volume2,
  Clock,
  Sparkles,
  HardDrive,
  ShieldAlert,
} from 'lucide-react';
import { LongFormProject } from '../types/project';
import {
  checkRenderWorkerHealth,
  requestVideoRender,
  RENDER_WORKER_URL,
  RenderHealth,
  RenderJobResult,
} from '../engine/render';
import { formatSecondsToMinutes } from '../engine/schema';
import { validateProjectForRender, ProjectValidationResult } from '../engine/validation';

interface RenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: LongFormProject;
  totalDuration: number;
}

export const RenderModal: React.FC<RenderModalProps> = ({
  isOpen,
  onClose,
  project,
  totalDuration,
}) => {
  const [workerHealth, setWorkerHealth] = useState<RenderHealth | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [renderResult, setRenderResult] = useState<RenderJobResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ProjectValidationResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      checkHealth();
      const val = validateProjectForRender(project);
      setValidationResult(val);
    }
  }, [isOpen, project]);

  const checkHealth = async () => {
    setIsCheckingHealth(true);
    const health = await checkRenderWorkerHealth();
    setWorkerHealth(health);
    setIsCheckingHealth(false);
  };

  const handleStartRender = async () => {
    // 1. Strict pre-render validation
    const validation = validateProjectForRender(project);
    setValidationResult(validation);

    if (!validation.isValid) {
      setErrorMessage(`Validation failed: ${validation.errors.join(' • ')}`);
      return;
    }

    setIsRendering(true);
    setErrorMessage(null);
    setRenderResult(null);
    setRenderProgress(0);
    setProgressMessage('Initializing local rendering pipeline...');

    try {
      const result = await requestVideoRender(project, (pct, msg) => {
        setRenderProgress(pct);
        setProgressMessage(msg);
      });
      setRenderResult(result);
    } catch (err: any) {
      console.error('Render error:', err);
      setErrorMessage(err.message || 'Failed to render video');
    } finally {
      setIsRendering(false);
    }
  };

  if (!isOpen) return null;

  const clipCount = project.timeline.length;
  const hasVoiceover = Boolean(project.voiceover);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-editor-panel border border-editor-panelBorder rounded-xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-editor-panelBorder flex items-center justify-between bg-editor-surface/50 shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30 shrink-0">
              <Video className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-semibold text-white truncate">Master Video Export (1080p MP4)</h2>
              <p className="text-[10px] sm:text-xs text-slate-400 truncate">Local FFmpeg Rendering Engine • 100% Private</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRendering}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-editor-surface transition-colors disabled:opacity-50 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
          {/* Worker Status Banner */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-editor-surface border border-editor-panelBorder text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  workerHealth?.ffmpegAvailable ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-rose-400'
                }`}
              />
              <span className="font-medium text-slate-300">
                {workerHealth?.ffmpegAvailable
                  ? 'Local FFmpeg Worker: Online (Port 8768)'
                  : 'FFmpeg Worker Offline'}
              </span>
            </div>
            <button
              onClick={checkHealth}
              disabled={isCheckingHealth || isRendering}
              className="text-blue-400 hover:text-blue-300 text-[11px] underline disabled:opacity-50"
            >
              {isCheckingHealth ? 'Checking...' : 'Refresh Status'}
            </button>
          </div>

          {!workerHealth?.ffmpegAvailable && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/40 rounded-lg text-xs text-amber-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-200">Local Render Server Not Detected</p>
                <p className="mt-0.5 text-amber-400/90 leading-relaxed">
                  Start the local worker in your terminal by running:
                </p>
                <code className="block mt-1 bg-black/60 px-2 py-1 rounded text-[11px] text-emerald-300 font-mono">
                  python server/render_server.py --port 8768
                </code>
              </div>
            </div>
          )}

          {/* Validation Warnings / Errors */}
          {validationResult && !validationResult.isValid && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/40 rounded-lg text-xs text-rose-300 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-rose-200">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Render Preconditions Failed ({validationResult.errors.length})</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-300/90 pl-1">
                {validationResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {validationResult && validationResult.isValid && validationResult.warnings.length > 0 && (
            <div className="p-3 bg-amber-950/30 border border-amber-800/30 rounded-lg text-xs text-amber-300 space-y-1">
              <div className="flex items-center gap-2 font-medium text-amber-200">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Notice</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-300/80 pl-1">
                {validationResult.warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Project Render Summary Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-editor-surface rounded-lg border border-editor-panelBorder">
              <span className="text-[11px] text-slate-400 block mb-1">Target Resolution</span>
              <div className="font-semibold text-white text-xs flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-blue-400" />
                1920 × 1080
              </div>
              <span className="text-[10px] text-slate-500 font-mono">16:9 • 30 FPS</span>
            </div>

            <div className="p-3 bg-editor-surface rounded-lg border border-editor-panelBorder">
              <span className="text-[11px] text-slate-400 block mb-1">Total Duration</span>
              <div className="font-semibold text-white text-xs flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                {formatSecondsToMinutes(totalDuration)}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">{totalDuration.toFixed(1)}s total</span>
            </div>

            <div className="p-3 bg-editor-surface rounded-lg border border-editor-panelBorder">
              <span className="text-[11px] text-slate-400 block mb-1">Visual Clips</span>
              <div className="font-semibold text-white text-xs flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                {clipCount} {clipCount === 1 ? 'clip' : 'clips'}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Chronological</span>
            </div>

            <div className="p-3 bg-editor-surface rounded-lg border border-editor-panelBorder">
              <span className="text-[11px] text-slate-400 block mb-1">Voiceover Track</span>
              <div className="font-semibold text-white text-xs flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                {hasVoiceover ? 'Master Audio' : 'Silent Track'}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">AAC 44.1kHz</span>
            </div>
          </div>

          {/* Render In Progress */}
          {isRendering && (
            <div className="p-4 bg-blue-950/30 border border-blue-800/40 rounded-lg space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-blue-300 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  {progressMessage}
                </span>
                <span className="font-mono text-blue-400 font-bold">{renderProgress.toFixed(0)}%</span>
              </div>
              {/* Progress Bar */}
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(4, renderProgress)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                FFmpeg is encoding 1920x1080 16:9 video clips with per-clip framing, gap-fill, and AAC audio sync.
              </p>
            </div>
          )}

          {/* Render Succeeded */}
          {renderResult && !isRendering && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-800/40 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Video Rendered Successfully!</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-black/40 p-3 rounded border border-emerald-900/30 font-mono">
                <div>
                  <span className="text-slate-500">File:</span>{' '}
                  <span className="text-slate-200">{renderResult.filename}</span>
                </div>
                <div>
                  <span className="text-slate-500">Resolution:</span>{' '}
                  <span className="text-slate-200">
                    {renderResult.width}×{renderResult.height} (16:9)
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Duration:</span>{' '}
                  <span className="text-slate-200">{renderResult.duration}s @ {renderResult.fps}fps</span>
                </div>
                <div>
                  <span className="text-slate-500">Size:</span>{' '}
                  <span className="text-slate-200">
                    {(renderResult.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                <div className="col-span-2 text-[11px] text-slate-400">
                  Codecs: {renderResult.videoCodec} • {renderResult.audioCodec}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <a
                  href={`${RENDER_WORKER_URL}${renderResult.downloadUrl}`}
                  download={renderResult.filename}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-900/40"
                >
                  <Download className="w-4 h-4" />
                  Download Master MP4
                </a>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && !isRendering && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/40 rounded-lg text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-200">Rendering Failed</p>
                <p className="mt-0.5 text-rose-300/90 font-mono text-[11px] break-all">{errorMessage}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-editor-panelBorder bg-editor-surface/30 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <div className="text-[10px] sm:text-[11px] text-slate-500 flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5" />
            <span className="truncate">Saved to server/exports/</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isRendering}
              className="px-3 sm:px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-editor-surface transition-colors disabled:opacity-50"
            >
              Close
            </button>

            <button
              onClick={handleStartRender}
              disabled={isRendering || !workerHealth?.ffmpegAvailable}
              className="px-4 sm:px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRendering ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Rendering...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  {renderResult ? 'Render Again' : 'Export 1080p Video'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
