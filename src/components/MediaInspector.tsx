import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Maximize2,
  HardDrive,
  Compass,
  Sun,
  Activity,
  Palette,
  Eye,
  Tag,
  ChevronDown,
  ChevronUp,
  Cpu,
} from 'lucide-react';
import { MediaAsset } from '../types/project';
import { formatTimecode, formatSecondsToMinutes } from '../engine/schema';
import { checkVisionWorkerHealth, VisionWorkerStatus } from '../engine/vision';

interface MediaInspectorProps {
  asset: MediaAsset | null;
  onAnalyze: (mediaId: string) => void;
  onAddToTimeline: (mediaId: string) => void;
}

export const MediaInspector: React.FC<MediaInspectorProps> = ({
  asset,
  onAnalyze,
  onAddToTimeline,
}) => {
  const [showKeyframeDetails, setShowKeyframeDetails] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<VisionWorkerStatus>({ online: false });

  useEffect(() => {
    let isMounted = true;
    const checkStatus = async () => {
      const status = await checkVisionWorkerHealth();
      if (isMounted) {
        setWorkerStatus(status);
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!asset) {
    return (
      <div className="w-80 h-full bg-editor-panel border-l border-editor-panelBorder p-6 flex flex-col items-center justify-center text-center text-slate-500 shrink-0 select-none">
        <Eye className="w-9 h-9 mb-2.5 opacity-30 text-slate-400" />
        <p className="text-xs font-semibold text-slate-300">No Media Selected</p>
        <p className="text-[11px] text-slate-500 mt-1 max-w-[210px] leading-relaxed">
          Click on any video or photo in the Media Library to inspect metadata, extract keyframes, and run local semantic analysis.
        </p>
      </div>
    );
  }

  const analysis = asset.analysis;
  const isAnalyzing = analysis?.analyzing || false;
  const isAnalyzed = analysis?.analyzed || false;
  const semantic = analysis?.semantic;
  const features = analysis?.visualFeatures;
  const keyframes = analysis?.keyframes || [];

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-80 h-full bg-editor-panel border-l border-editor-panelBorder flex flex-col shrink-0 select-none">
      {/* Header */}
      <div className="p-3 border-b border-editor-panelBorder flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-semibold text-xs text-slate-200 uppercase tracking-wider truncate">
            Media Intelligence
          </span>
        </div>

        {/* Analyze Button */}
        <button
          onClick={() => onAnalyze(asset.id)}
          disabled={isAnalyzing}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded shadow-sm transition-all ${
            isAnalyzing
              ? 'bg-blue-950 text-blue-300 cursor-wait'
              : isAnalyzed
              ? 'bg-editor-surface hover:bg-editor-surfaceHover text-blue-300 border border-editor-panelBorder'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Analyzing visuals...</span>
            </>
          ) : isAnalyzed ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Re-Analyze</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              <span>Analyze</span>
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Worker Status Badge */}
        <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-900/60 border border-slate-800 text-[10px]">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3 h-3 text-slate-400" />
            <span className="text-slate-400">Vision Engine:</span>
          </div>
          {workerStatus.online ? (
            workerStatus.state === 'ready' || workerStatus.modelLoaded ? (
              <span className="text-emerald-400 font-medium">Vision model ready</span>
            ) : workerStatus.state === 'model_not_installed' ? (
              <span className="text-amber-400 font-medium">Vision model not installed</span>
            ) : (
              <span className="text-blue-400 font-medium">Vision model cached</span>
            )
          ) : (
            <span className="text-slate-500 font-medium">Worker offline</span>
          )}
        </div>

        {/* Selected Asset Header Card */}
        <div className="bg-editor-surface rounded-lg p-3 border border-editor-panelBorder space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 truncate max-w-[170px]" title={asset.name}>
              {asset.name}
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {asset.type}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono pt-1 border-t border-editor-panelBorder/50">
            <div className="flex items-center gap-1">
              <Maximize2 className="w-3 h-3 text-slate-500" />
              <span>{asset.width} × {asset.height}</span>
            </div>
            <div className="flex items-center gap-1">
              <Compass className="w-3 h-3 text-slate-500" />
              <span className="truncate">{asset.aspectRatioLabel}</span>
            </div>
            {asset.type === 'video' && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>{formatSecondsToMinutes(asset.duration)}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-slate-500" />
              <span>{formatFileSize(asset.size)}</span>
            </div>
          </div>
        </div>

        {/* 1. SEMANTIC ANALYSIS SECTION */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
              Semantic Understanding
            </label>
            {semantic?.analyzed && semantic?.description ? (
              <span className="text-[9px] bg-emerald-950/60 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800/40 font-mono">
                Visual analysis complete
              </span>
            ) : isAnalyzed && !semantic?.analyzed ? (
              <span className="text-[9px] bg-amber-950/60 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800/40 font-mono">
                Semantic analysis unavailable
              </span>
            ) : null}
          </div>

          {semantic?.analyzed && semantic?.description ? (
            <div className="bg-editor-surface rounded-lg p-3 border border-editor-panelBorder space-y-2.5">
              {/* Overall Scene Description */}
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block mb-1">
                  Primary Scene Description
                </span>
                <p className="text-xs text-slate-100 leading-relaxed font-normal italic bg-slate-900/60 p-2 rounded border border-slate-800">
                  "{semantic.description}"
                </p>
              </div>

              {/* Temporal Video Summary (if multi-frame video) */}
              {semantic.temporalSummary && semantic.temporalSummary !== semantic.description && (
                <div>
                  <span className="text-[10px] text-indigo-300 uppercase tracking-wider font-semibold block mb-1 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-indigo-400" />
                    <span>Temporal Sequence Summary</span>
                  </span>
                  <p className="text-xs text-indigo-100/90 leading-relaxed font-normal italic bg-indigo-950/40 p-2 rounded border border-indigo-800/40">
                    "{semantic.temporalSummary}"
                  </p>
                </div>
              )}

              {/* Visual Change Detection Alert */}
              {asset.type === 'video' && (
                <div className="flex items-center justify-between text-[11px] p-2 rounded bg-slate-900/50 border border-slate-800">
                  <span className="text-slate-400">Visual Motion / Shift:</span>
                  {semantic.hasVisualChange ? (
                    <span className="text-amber-300 font-medium flex items-center gap-1 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Visual Change Detected
                    </span>
                  ) : (
                    <span className="text-slate-400 bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-700/40">
                      Static / Stable Shot
                    </span>
                  )}
                </div>
              )}

              {/* Visual Change Details if any */}
              {semantic.visualChanges && semantic.visualChanges.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">
                    Detected Transitions
                  </span>
                  <div className="space-y-1">
                    {semantic.visualChanges.map((vc, idx) => (
                      <div
                        key={idx}
                        className="text-[10px] font-mono text-slate-300 bg-slate-950/80 px-2 py-1 rounded border border-slate-800 flex items-center justify-between"
                      >
                        <span>{formatTimecode(vc.fromTime)} → {formatTimecode(vc.toTime)}</span>
                        <span className="text-amber-400">Δ {Math.round(vc.differenceScore * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Semantic Concept Tags */}
              {semantic.tags && semantic.tags.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1.5">
                    <Tag className="w-3 h-3 text-purple-400" />
                    <span>Visual Concept Tags</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {semantic.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-950/60 text-purple-300 border border-purple-800/40 font-mono"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Keyframe Descriptions Toggle */}
              {semantic.keyframeDescriptions && semantic.keyframeDescriptions.length > 1 && (
                <div className="pt-1 border-t border-editor-panelBorder/50">
                  <button
                    onClick={() => setShowKeyframeDetails(!showKeyframeDetails)}
                    className="flex items-center justify-between w-full text-[11px] text-slate-400 hover:text-slate-200 transition-colors py-0.5"
                  >
                    <span>Frame-by-Frame Descriptions ({semantic.keyframeDescriptions.length})</span>
                    {showKeyframeDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showKeyframeDetails && (
                    <div className="space-y-1.5 mt-2">
                      {semantic.keyframeDescriptions.map((kd, idx) => (
                        <div
                          key={idx}
                          className={`rounded p-2 text-[11px] border space-y-0.5 ${
                            kd.isKeyMoment
                              ? 'bg-purple-950/30 border-purple-800/50'
                              : 'bg-black/40 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-purple-300">
                              Frame @ {formatTimecode(kd.time)}
                            </span>
                            {kd.isKeyMoment && (
                              <span className="text-[9px] bg-purple-900/60 text-purple-200 px-1 py-0.2 rounded font-mono border border-purple-700/50">
                                Key Moment
                              </span>
                            )}
                          </div>
                          <div className="text-slate-200 italic">"{kd.description}"</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-editor-surface/40 border border-dashed border-editor-panelBorder rounded-lg p-3 text-center text-slate-500 text-[11px] space-y-1">
              <p className="text-slate-400 font-medium">
                {isAnalyzed ? 'Semantic analysis unavailable' : 'Visual concepts not generated yet'}
              </p>
              <p className="text-slate-500 text-[10px]">
                {isAnalyzed
                  ? analysis?.error || 'Local vision model could not infer scene concepts.'
                  : 'Click "Analyze" above to run the local vision model and extract scene interpretations.'}
              </p>
            </div>
          )}
        </div>

        {/* Error banner if any */}
        {analysis?.error && (
          <div className="p-2.5 rounded bg-amber-950/40 border border-amber-800/40 text-[10px] text-amber-300 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>{analysis.error}</span>
          </div>
        )}

        {/* 2. REPRESENTATIVE KEYFRAMES REEL */}
        <div>
          <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
            <span>Representative Keyframes</span>
            {keyframes.length > 0 && (
              <span className="text-[10px] font-mono text-blue-400">{keyframes.length} frames</span>
            )}
          </label>

          {keyframes.length === 0 ? (
            <div className="bg-editor-surface/40 border border-dashed border-editor-panelBorder rounded-lg p-3 text-center text-slate-500 text-[11px]">
              {isAnalyzing
                ? 'Extracting local keyframes...'
                : 'Click "Analyze" to extract representative video frames locally.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {keyframes.map((kf, i) => (
                <div
                  key={i}
                  className="bg-black rounded-md overflow-hidden border border-slate-700/60 relative group shadow-sm"
                >
                  {kf.imageData ? (
                    <img
                      src={kf.imageData}
                      alt={`Keyframe at ${kf.time}s`}
                      className="w-full h-16 object-cover"
                    />
                  ) : (
                    <div className="w-full h-16 bg-slate-900 flex items-center justify-center text-[10px] text-slate-500">
                      Frame {i + 1}
                    </div>
                  )}
                  {kf.isKeyMoment && (
                    <div className="absolute top-1 left-1 bg-purple-900/90 text-purple-200 px-1 py-0.2 rounded text-[8px] font-mono border border-purple-600/60 shadow">
                      Key Moment
                    </div>
                  )}
                  <div className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.2 rounded text-[9px] font-mono text-slate-300 border border-slate-700/50">
                    {formatTimecode(kf.time)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. VISUAL FEATURES & DETERMINISTIC STATS */}
        {features && (
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
              Visual Properties
            </label>

            <div className="bg-editor-surface rounded-lg p-3 border border-editor-panelBorder space-y-2 text-xs">
              {/* Orientation */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Compass className="w-3.5 h-3.5" />
                  <span>Orientation</span>
                </span>
                <span className="font-mono capitalize text-blue-400 font-medium">
                  {features.orientation}
                </span>
              </div>

              {/* Brightness */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="flex items-center gap-1">
                    <Sun className="w-3 h-3 text-amber-400" />
                    <span>Average Brightness</span>
                  </span>
                  <span className="font-mono text-slate-300">{Math.round(features.brightness * 100)}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${Math.round(features.brightness * 100)}%` }}
                  />
                </div>
              </div>

              {/* Contrast */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="flex items-center gap-1">
                    <Activity className="w-3 h-3 text-emerald-400" />
                    <span>Contrast Index</span>
                  </span>
                  <span className="font-mono text-slate-300">{Math.round(features.contrast * 100)}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: `${Math.round(features.contrast * 100)}%` }}
                  />
                </div>
              </div>

              {/* Dominant Color Palette */}
              {features.dominantColors && features.dominantColors.length > 0 && (
                <div className="pt-1">
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-1.5">
                    <Palette className="w-3 h-3 text-blue-400" />
                    <span>Dominant Palette</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {features.dominantColors.map((hex, idx) => (
                      <div
                        key={idx}
                        className="flex-1 h-5 rounded border border-slate-700/80 shadow-sm"
                        style={{ backgroundColor: hex }}
                        title={`Color: ${hex}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add to Timeline Action */}
        <button
          onClick={() => onAddToTimeline(asset.id)}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-semibold transition-colors shadow"
        >
          Add to Timeline
        </button>
      </div>
    </div>
  );
};
