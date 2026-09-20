import React, { useState, useEffect } from 'react';
import {
  Cpu,
  RefreshCw,
  X,
  Terminal,
  ShieldCheck,
} from 'lucide-react';
import { checkAllWorkers, WorkerDiagnostic } from '../engine/workers';

interface WorkerDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkersUpdated?: (activeCount: number, totalCount: number) => void;
}

export const WorkerDiagnosticsModal: React.FC<WorkerDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  onWorkersUpdated,
}) => {
  const [workers, setWorkers] = useState<WorkerDiagnostic[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      refreshDiagnostics();
    }
  }, [isOpen]);

  const refreshDiagnostics = async () => {
    setIsLoading(true);
    const results = await checkAllWorkers();
    setWorkers(results);
    const active = results.filter((w) => w.isOnline && w.statusText === 'Ready').length;
    onWorkersUpdated?.(active, results.length);
    setIsLoading(false);
  };

  if (!isOpen) return null;

  const onlineCount = workers.filter((w) => w.isOnline && w.statusText === 'Ready').length;

  const getCommandForPort = (port: number) => {
    switch (port) {
      case 8765:
        return 'python server/transcribe_server.py --port 8765 --model tiny --device cpu';
      case 8766:
        return 'python server/vision_server.py --port 8766 --device cpu';
      case 8767:
        return 'python server/matching_server.py --port 8767 --device cpu';
      case 8768:
        return 'python server/render_server.py --port 8768';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-editor-panel border border-editor-panelBorder rounded-xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-editor-panelBorder flex items-center justify-between bg-editor-surface/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Local Worker Diagnostics</h2>
              <p className="text-xs text-slate-400">100% Offline AI & FFmpeg Processing Units</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-editor-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Status Overview Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-lg bg-editor-surface border border-editor-panelBorder text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="font-semibold text-white">
                  {onlineCount === workers.length
                    ? 'All 4 Local Workers Online & Ready'
                    : `${onlineCount} of ${workers.length} Workers Active`}
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Zero cloud APIs or external data transfers required.
                </span>
              </div>
            </div>

            <button
              onClick={refreshDiagnostics}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-editor-surfaceHover text-blue-400 hover:text-blue-300 border border-slate-700 text-xs transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Individual Worker Cards */}
          <div className="space-y-2.5">
            {workers.map((w) => {
              const isReady = w.isOnline && w.statusText === 'Ready';
              const isMissingModel = w.statusText === 'Model not installed';

              return (
                <div
                  key={w.port}
                  className="p-3.5 bg-editor-surface rounded-lg border border-editor-panelBorder space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          isReady
                            ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
                            : isMissingModel
                            ? 'bg-amber-400'
                            : 'bg-rose-400'
                        }`}
                      />
                      <span className="font-semibold text-xs text-white">{w.name}</span>
                      <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                        Port {w.port}
                      </span>
                    </div>

                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                        isReady
                          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                          : isMissingModel
                          ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                          : 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                      }`}
                    >
                      {w.statusText}
                    </span>
                  </div>

                  {/* Details or offline hint */}
                  {isReady && w.details ? (
                    <div className="text-[11px] text-slate-400 font-mono bg-black/40 p-2 rounded border border-slate-800/60 flex flex-wrap gap-x-4 gap-y-1">
                      {w.details.engine && <span>Engine: {w.details.engine}</span>}
                      {w.details.model && <span className="truncate max-w-xs">Model: {w.details.model}</span>}
                      {w.details.ffmpegVersion && <span className="truncate max-w-xs">FFmpeg: {w.details.ffmpegVersion}</span>}
                      {w.details.device && <span>Device: {w.details.device}</span>}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 space-y-1.5">
                      <p className="text-rose-300/90 font-mono text-[11px]">
                        {w.errorMessage || 'Worker process is not currently listening on port ' + w.port}
                      </p>
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Terminal className="w-3.5 h-3.5 text-slate-400" />
                        <span>Launch command:</span>
                      </div>
                      <code className="block bg-black/60 px-2.5 py-1.5 rounded text-[11px] text-emerald-300 font-mono break-all select-all">
                        {getCommandForPort(w.port)}
                      </code>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-editor-panelBorder bg-editor-surface/30 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
