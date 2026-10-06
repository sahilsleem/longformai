import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Play, Pause, Upload, Sparkles, Scissors, Trash2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Loader2, CheckCircle } from 'lucide-react';
import { pickAndroidMedia } from './platform/androidMedia';
import { renderVideo } from './platform/render';

interface ShortsEditorProps {
  onBack: () => void;
}

interface Segment {
  start: number;
  end: number;
  crop_x: number;
  crop_y: number;
  crop_size: number;
  zoom: number;
  crop_left_pct: number;
  crop_top_pct: number;
}

export default function ShortsEditor({ onBack }: ShortsEditorProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string>(''); // absolute path for ffmpeg
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'curiosity'>('main');
  const [mainCaption, setMainCaption] = useState('');
  const [mainEmoji, setMainEmoji] = useState('');
  const [mainFont, setMainFont] = useState('Calistoga');
  const [curiosityCaption, setCuriosityCaption] = useState('');
  const [curiosityEmoji, setCuriosityEmoji] = useState('');
  const [curiosityFont, setCuriosityFont] = useState('Calistoga');

  // Settings state

  // Render state
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState('');
  const [renderDoneUri, setRenderDoneUri] = useState('');

  // Video and Crop dimensions
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [origW, setOrigW] = useState(1080);
  const [origH, setOrigH] = useState(1920);
  const [zoomLevel, setZoomLevel] = useState(100); // 30 - 100%
  // Segments state
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);

  const [previewStyle, setPreviewStyle] = useState<React.CSSProperties>({ aspectRatio: '9/16', height: '100%', containerType: 'inline-size' });

  const fit916Container = useCallback(() => {
    const viewport = previewViewportRef.current;
    if (!viewport) return;
    
    // Subtract padding (p-2 is 8px, so 16px total)
    const availW = viewport.clientWidth - 16;
    const availH = viewport.clientHeight - 16;
    if (availW <= 0 || availH <= 0) return;

    const aspect = 9 / 16;
    let targetW: number;
    let targetH: number;

    if (availW / availH > aspect) {
      targetH = availH;
      targetW = Math.round(availH * aspect);
    } else {
      targetW = availW;
      targetH = Math.round(availW / aspect);
    }

    setPreviewStyle({
      width: targetW,
      height: targetH,
      containerType: 'inline-size'
    });
  }, []);

  useEffect(() => {
    // Run it on next tick to ensure viewport is rendered
    setTimeout(fit916Container, 50);
    window.addEventListener('resize', fit916Container);
    return () => window.removeEventListener('resize', fit916Container);
  }, [fit916Container]);

  // References
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);

  // Dragging state for crop box
    
  // Timeline drag state
  const activeTimelineHandle = useRef<'in' | 'out' | 'segment' | 'playhead' | null>(null);
  const timelineDragRef = useRef({ startX: 0, origStart: 0, origEnd: 0 });

  // Format timestamp helper mm:ss.ms
  const formatTime = (s: number) => {
    if (isNaN(s)) return '00:00.000';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 1000);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  // Video loaded metadata
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    if (!video.videoWidth || !video.videoHeight) {
      setTimeout(handleLoadedMetadata, 100);
      return;
    }

    const dur = video.duration || 1;
    const w = video.videoWidth;
    const h = video.videoHeight;

    setVideoDuration(dur);
    setOrigW(w);
    setOrigH(h);

    

    const maxCrop = Math.min(w, h);
    const cssW = (maxCrop / w) * 100;
    const cssH = (maxCrop / h) * 100;
    const initLeft = (100 - cssW) / 2;
    const initTop = Math.min((100 - cssH) / 2, 20);

    

    const initSegment: Segment = {
      start: 0,
      end: dur,
      crop_x: Math.round((initLeft / 100) * w),
      crop_y: Math.round((initTop / 100) * h),
      crop_size: Math.round(maxCrop),
      zoom: 100,
      crop_left_pct: initLeft,
      crop_top_pct: initTop,
    };

    setSegments([initSegment]);
    setActiveSegmentIndex(0);
    video.currentTime = dur / 2;
  };

  // Upload video
  const handleUpload = async () => {
    try {
      const files = await pickAndroidMedia();
      if (files && files.length > 0) {
        setVideoUrl(files[0].webPath);
        setVideoPath(files[0].nativePath || files[0].webPath); // Save absolute path for FFmpeg
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRender = async () => {
    if (!videoPath) return;
    setIsRendering(true);
    setRenderProgress('Preparing your edit...');
    setRenderDoneUri('');
    
    try {
      const resultUri = await renderVideo({
        videoPath,
        isCuriosity: activeTab === 'curiosity',
        mainCaption,
        mainEmoji,
        mainFont,
        curiosityCaption,
        curiosityEmoji,
        curiosityFont,
        enhance: false,
        audioMode: 'original',
        watermark: false,
        segments: segments,
        onProgress: (msg) => setRenderProgress(msg)
      });
      
      setRenderDoneUri(resultUri);
      setRenderProgress('Video saved to gallery.');
    } catch (err: any) {
      console.error(err);
      setRenderProgress('Error: ' + err.message);
    } finally {
      setIsRendering(false);
    }
  };

    // Force metadata load
  useEffect(() => {
    if (videoUrl && videoRef.current) {
      videoRef.current.load();
    }
  }, [videoUrl]);

  useEffect(() => {
    if (!videoUrl) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (video && video.readyState >= 1 && video.videoWidth > 0 && segments.length === 0) {
        handleLoadedMetadata();
      }
      if (video && video.duration && segments.length > 0) {
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [videoUrl, segments.length]);

  // Play / Pause toggle
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (segments.length > 0) {
        const seg = segments[activeSegmentIndex];
        if (videoRef.current.currentTime >= seg.end - 0.05 || videoRef.current.currentTime < seg.start) {
          videoRef.current.currentTime = seg.start;
        }
      }
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Keep active segment looping during playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const t = video.currentTime;
      setCurrentTime(t);

      if (isPlaying && segments.length > 0 && segments[activeSegmentIndex]) {
        const seg = segments[activeSegmentIndex];
        if (t >= seg.end) {
          video.currentTime = seg.start;
        }
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [isPlaying, segments, activeSegmentIndex]);
// Save crop state into active segment
  const saveCropToActiveSegment = useCallback((leftPct: number, topPct: number, zoomVal: number) => {
    setSegments((prev) => {
      if (!prev[activeSegmentIndex]) return prev;
      const next = [...prev];
      const maxCrop = Math.min(origW, origH);
      const cropSize = maxCrop * (zoomVal / 100);
      next[activeSegmentIndex] = {
        ...next[activeSegmentIndex],
        crop_left_pct: leftPct,
        crop_top_pct: topPct,
        crop_x: Math.round((leftPct / 100) * origW),
        crop_y: Math.round((topPct / 100) * origH),
        crop_size: Math.round(cropSize),
        zoom: zoomVal,
      };
      return next;
    });
  }, [activeSegmentIndex, origW, origH]);

  // Load crop state for a segment
  const loadSegmentCrop = useCallback((seg: Segment) => {
    setZoomLevel(seg.zoom || 100);
    const maxCrop = Math.min(origW, origH);
    const cropSize = seg.crop_size || (maxCrop * ((seg.zoom || 100) / 100));
    const cssW = (cropSize / origW) * 100;
    const cssH = (cropSize / origH) * 100;

    let left = seg.crop_left_pct !== undefined ? seg.crop_left_pct : (seg.crop_x / origW) * 100;
    let top = seg.crop_top_pct !== undefined ? seg.crop_top_pct : (seg.crop_y / origH) * 100;

    // Enforce bounds
    if (left < 0) left = 0;
    if (left + cssW > 100) left = 100 - cssW;
    if (top < 0) top = 0;
    if (top + cssH > 100) top = 100 - cssH;

    
  }, [origW, origH]);

  


  // Handle Zoom change
  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setZoomLevel(val);
    
    saveCropToActiveSegment(parseFloat("0%"), parseFloat("0%"), val);
  };

  // Split Segment action
  const handleSplitSegment = () => {
    if (!videoRef.current || segments.length === 0) return;
    const t = videoRef.current.currentTime;
    const activeSeg = segments[activeSegmentIndex];
    if (!activeSeg) return;

    if (t > activeSeg.start + 0.1 && t < activeSeg.end - 0.1) {
      const oldEnd = activeSeg.end;
      const nextSegs = [...segments];

      nextSegs[activeSegmentIndex] = {
        ...activeSeg,
        end: t,
      };

      const newSeg: Segment = {
        ...activeSeg,
        start: t,
        end: oldEnd,
      };

      nextSegs.splice(activeSegmentIndex + 1, 0, newSeg);
      setSegments(nextSegs);
      setActiveSegmentIndex(activeSegmentIndex + 1);
    }
  };

  // Delete Segment action
  const handleDeleteSegment = () => {
    if (segments.length <= 1) return; // Keep at least one segment
    const nextSegs = segments.filter((_, idx) => idx !== activeSegmentIndex);
    const newIdx = Math.max(0, activeSegmentIndex - 1);
    setSegments(nextSegs);
    setActiveSegmentIndex(newIdx);
    if (videoRef.current && nextSegs[newIdx]) {
      videoRef.current.currentTime = nextSegs[newIdx].start;
      loadSegmentCrop(nextSegs[newIdx]);
    }
  };

  // Frame stepping helper
  const stepFrame = (forward: boolean) => {
    if (!videoRef.current) return;
    const delta = forward ? 1 / 30 : -1 / 30;
    videoRef.current.currentTime = Math.max(0, Math.min(videoDuration, videoRef.current.currentTime + delta));
  };

  // Timeline handle drag handler
  const handleTimelinePointerDown = (e: React.PointerEvent, handleType: 'in' | 'out' | 'segment' | 'playhead') => {
    e.stopPropagation();
    activeTimelineHandle.current = handleType;
    const activeSeg = segments[activeSegmentIndex];
    if (!activeSeg) return;

    timelineDragRef.current = {
      startX: e.clientX,
      origStart: activeSeg.start,
      origEnd: activeSeg.end,
    };
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!activeTimelineHandle.current || !videoDuration || segments.length === 0 || !timelineTrackRef.current) return;
      const rect = timelineTrackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const t = pct * videoDuration;

      const activeSeg = segments[activeSegmentIndex];
      if (!activeSeg) return;

      const nextSegs = [...segments];

      if (activeTimelineHandle.current === 'in') {
        const prevEnd = activeSegmentIndex > 0 ? segments[activeSegmentIndex - 1].end : 0;
        const newStart = Math.max(prevEnd, Math.min(t, activeSeg.end - 0.1));
        nextSegs[activeSegmentIndex] = { ...activeSeg, start: newStart };
        setSegments(nextSegs);
        if (videoRef.current) videoRef.current.currentTime = newStart;
      } else if (activeTimelineHandle.current === 'out') {
        const nextStart = activeSegmentIndex < segments.length - 1 ? segments[activeSegmentIndex + 1].start : videoDuration;
        const newEnd = Math.min(nextStart, Math.max(t, activeSeg.start + 0.1));
        nextSegs[activeSegmentIndex] = { ...activeSeg, end: newEnd };
        setSegments(nextSegs);
        if (videoRef.current) videoRef.current.currentTime = newEnd;
      } else if (activeTimelineHandle.current === 'segment') {
        const dx = ((e.clientX - timelineDragRef.current.startX) / rect.width) * videoDuration;
        let newStart = timelineDragRef.current.origStart + dx;
        let newEnd = timelineDragRef.current.origEnd + dx;
        const dur = activeSeg.end - activeSeg.start;

        const prevEnd = activeSegmentIndex > 0 ? segments[activeSegmentIndex - 1].end : 0;
        const nextStart = activeSegmentIndex < segments.length - 1 ? segments[activeSegmentIndex + 1].start : videoDuration;

        if (newStart < prevEnd) {
          newStart = prevEnd;
          newEnd = prevEnd + dur;
        }
        if (newEnd > nextStart) {
          newEnd = nextStart;
          newStart = nextStart - dur;
        }

        nextSegs[activeSegmentIndex] = { ...activeSeg, start: newStart, end: newEnd };
        setSegments(nextSegs);
        if (videoRef.current) videoRef.current.currentTime = newStart;
      } else if (activeTimelineHandle.current === 'playhead') {
        if (videoRef.current) videoRef.current.currentTime = t;
      }
    };

    const handlePointerUp = () => {
      activeTimelineHandle.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [segments, activeSegmentIndex, videoDuration]);

  const activeSegment = segments[activeSegmentIndex];

  return (
    <div className="flex flex-col h-[100dvh] bg-editor-bg text-white font-sans overflow-hidden select-none">
      
      {/* Sleek Header without massive titles, keeping Render Button on Top Right */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-editor-panelBorder bg-editor-surface shrink-0 z-50">
        <button 
          onClick={onBack} 
          className="p-2 -ml-2 rounded-full hover:bg-white/10 active:scale-95 transition"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        {/* Minimalist Subdued Mode Badges */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-full p-0.5">
          <button 
            onClick={() => setActiveTab('main')} 
            className={`px-3 py-1 text-xs font-bold uppercase rounded-full transition ${activeTab === 'main' ? 'bg-white text-black' : 'text-slate-400 hover:text-white'}`}
          >
            Main
          </button>
          <button 
            onClick={() => setActiveTab('curiosity')} 
            className={`px-3 py-1 text-xs font-bold uppercase rounded-full transition ${activeTab === 'curiosity' ? 'bg-white text-black' : 'text-slate-400 hover:text-white'}`}
          >
            Curiosity
          </button>
        </div>

        {/* Render Button */}
        <button 
          onClick={handleRender}
          disabled={!videoUrl || isRendering}
          className="px-4 py-1.5 bg-white text-black rounded-full text-xs font-bold tracking-wider uppercase shadow-[0_0_15px_rgba(255,255,255,0.2)] flex items-center justify-center gap-1.5 active:scale-95 transition disabled:opacity-40 disabled:active:scale-100 disabled:shadow-none"
        >
          {isRendering ? <Loader2 className="w-3.5 h-3.5 text-black animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-black" />}
          Render
        </button>
      </header>

      {/* Render Overlay */}
      {(isRendering || renderDoneUri || renderProgress.includes('Error')) && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-editor-surface border border-editor-panelBorder rounded-2xl p-6 w-full max-w-sm flex flex-col items-center text-center gap-4 shadow-2xl">
            
            {isRendering && <Loader2 className="w-10 h-10 text-white animate-spin" />}
            {renderDoneUri && <CheckCircle className="w-10 h-10 text-green-400" />}
            {renderProgress.includes('Error') && <div className="text-red-400 text-3xl font-bold">!</div>}

            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-bold">
                {isRendering ? 'Rendering your video' : renderDoneUri ? 'Render Complete' : 'Render Failed'}
              </h3>
              <p className="text-sm text-slate-400">{renderProgress}</p>
            </div>

            

            {!isRendering && (
              <button 
                onClick={() => { setRenderProgress(''); setRenderDoneUri(''); }}
                className="mt-2 px-6 py-2 bg-white text-black font-bold uppercase tracking-wider text-xs rounded-xl active:scale-95 transition"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        
                {/* Top Preview Area (approx 54% height for nice balance) */}
        <div className="h-[54%] shrink-0 flex items-center justify-center bg-black relative p-4">
          
          {/* Video Preview Viewport */}
          <div 
            ref={previewViewportRef}
            className="absolute inset-0 flex items-center justify-center overflow-hidden p-2 bg-black"
          >
            {!videoUrl ? (
              <button 
                onClick={handleUpload}
                className="flex flex-col items-center gap-3 text-slate-400 hover:text-white transition group"
              >
                <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:scale-110 transition shadow-2xl">
                  <Upload className="w-7 h-7 text-white" />
                </div>
                <span className="font-semibold tracking-widest uppercase text-xs">Choose Video</span>
              </button>
            ) : (
              <div 
                className="relative bg-white overflow-hidden shadow-2xl select-none mx-auto border border-slate-800 flex-shrink-0"
                style={previewStyle}
              >
                {/* Final 9:16 WYSIWYG Composition */}
                
                {/* Curiosity Overlay (Optional) */}
                {activeTab === 'curiosity' && curiosityCaption && (
                  <div className="absolute left-0 right-0 bottom-0 h-[25.9375%] flex flex-col justify-center items-center z-30 px-4">
                    <span className="text-[#ef4444] font-bold text-center leading-tight drop-shadow-md" style={{ fontFamily: curiosityFont || 'Alike', fontSize: '6cqw' }}>
                      {curiosityCaption} {curiosityEmoji}
                    </span>
                  </div>
                )}
                
                {/* Main Overlay */}
                <div className="absolute left-0 right-0 top-0 h-[21.875%] flex flex-col justify-center items-center z-30 px-4">
                  <span className="text-black font-bold text-center leading-tight drop-shadow-md whitespace-pre-wrap break-words" style={{ fontFamily: mainFont || 'Alike', fontSize: '6cqw' }}>
                    {mainCaption.split(' ').map((w, i) => {
                      const match = w.match(/[a-zA-Z]/); const isRed = match ? match[0] === match[0].toUpperCase() : false;
                      return <span key={i} className={isRed ? 'text-[#ef4444]' : 'text-black'}>{w} </span>;
                    })}
                    {mainEmoji}
                  </span>
                </div>
                
                {/* The 1002x1002 Cropped Video Square (y=420 out of 1920 -> 21.875%, width=1002/1080 -> 92.77%) */}
                <div 
                  ref={previewContainerRef}
                  className="absolute z-20 cursor-move touch-none bg-black overflow-hidden shadow-xl border border-white"
                  style={{
                    left: '3.61%', // (1080 - 1002)/2 / 1080
                    top: '21.875%', // 420 / 1920
                    width: '92.77%', // 1002 / 1080
                    aspectRatio: '1/1',
                  }}
                >
                  {/* The Source Video, scaled and translated based on crop coordinates */}
                  <video 
                    ref={videoRef}
                    src={videoUrl}
                    className="absolute max-w-none origin-top-left pointer-events-none"
                    style={{
                      width: `${(origW / (segments[activeSegmentIndex]?.crop_size || 1080)) * 100}%`,
                      height: `${(origH / (segments[activeSegmentIndex]?.crop_size || 1080)) * 100}%`,
                      left: `${-(segments[activeSegmentIndex]?.crop_x || 0) / (segments[activeSegmentIndex]?.crop_size || 1080) * 100}%`,
                      top: `${-(segments[activeSegmentIndex]?.crop_y || 0) / (segments[activeSegmentIndex]?.crop_size || 1080) * 100}%`,
                    }}
                    playsInline
                    onLoadedMetadata={handleLoadedMetadata}
                  />
                  
                  {/* Grid Lines for alignment */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="w-full h-[1px] bg-white/20 absolute top-1/2 -translate-y-1/2" />
                    <div className="h-full w-[1px] bg-white/20 absolute left-1/2 -translate-x-1/2" />
                  </div>
                </div>

                {/* Play / Pause Touch Icon (moved to 9:16 container) */}
                <div className="absolute bottom-3 right-3 z-30">
                  <button 
                    onClick={togglePlay} 
                    className="w-9 h-9 rounded-full bg-black/60 backdrop-blur border border-white/20 flex items-center justify-center shadow-lg active:scale-90 transition"
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lower Controls & Timeline Panel */}
        <div className="h-[46%] shrink-0 bg-editor-surface border-t border-editor-panelBorder flex flex-col z-40">
          
          {/* Zoom Slider Bar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-editor-panelBorder bg-slate-950/40">
            <ZoomOut className="w-4 h-4 text-slate-500" />
            <input 
              type="range" 
              min={30} 
              max={100} 
              value={zoomLevel} 
              onChange={handleZoomChange}
              className="flex-1 accent-white h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <ZoomIn className="w-4 h-4 text-slate-500" />
            <span className="text-[11px] font-mono text-slate-400 w-9 text-right">{Math.round(zoomLevel)}%</span>
          </div>

          <div className="flex-1 p-3 flex flex-col justify-between overflow-y-auto gap-3">
            
            {/* Timeline Trimmer Section */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold tracking-wider uppercase text-slate-400 text-[11px]">Timeline Trimmer</span>
                <span className="font-mono text-slate-300 text-[11px] bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  {formatTime(currentTime)} / {formatTime(videoDuration)}
                </span>
              </div>

              {/* Trimmer Track Container */}
              <div 
                ref={timelineTrackRef}
                onPointerDown={(e) => handleTimelinePointerDown(e, 'playhead')}
                className="relative h-12 bg-black rounded-lg border border-editor-panelBorder overflow-hidden touch-none cursor-pointer"
              >
                {/* Segments Display */}
                {segments.map((seg, idx) => {
                  if (!videoDuration) return null;
                  const sPct = (seg.start / videoDuration) * 100;
                  const ePct = (seg.end / videoDuration) * 100;
                  const wPct = Math.max(0, ePct - sPct);
                  const isActive = idx === activeSegmentIndex;

                  return (
                    <div
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveSegmentIndex(idx);
                        loadSegmentCrop(seg);
                        if (videoRef.current) videoRef.current.currentTime = seg.start;
                      }}
                      className={`absolute top-0 bottom-0 box-border transition-colors ${
                        isActive 
                          ? 'border-2 border-white bg-white/20 z-10' 
                          : 'border border-slate-600 bg-slate-800/40 z-0'
                      }`}
                      style={{
                        left: `${sPct}%`,
                        width: `${wPct}%`,
                      }}
                    />
                  );
                })}

                {/* Handles for active segment */}
                {activeSegment && videoDuration > 0 && (
                  <>
                    {/* IN Handle */}
                    <div 
                      onPointerDown={(e) => handleTimelinePointerDown(e, 'in')}
                      className="absolute top-0 bottom-0 w-7 -translate-x-1/2 flex items-center justify-center cursor-ew-resize z-20 touch-none"
                      style={{ left: `${(activeSegment.start / videoDuration) * 100}%` }}
                    >
                      <div className="w-2.5 h-8 bg-white rounded-sm shadow-md flex items-center justify-center">
                        <div className="w-0.5 h-3 bg-black rounded-full" />
                      </div>
                    </div>

                    {/* OUT Handle */}
                    <div 
                      onPointerDown={(e) => handleTimelinePointerDown(e, 'out')}
                      className="absolute top-0 bottom-0 w-7 -translate-x-1/2 flex items-center justify-center cursor-ew-resize z-20 touch-none"
                      style={{ left: `${(activeSegment.end / videoDuration) * 100}%` }}
                    >
                      <div className="w-2.5 h-8 bg-white rounded-sm shadow-md flex items-center justify-center">
                        <div className="w-0.5 h-3 bg-black rounded-full" />
                      </div>
                    </div>
                  </>
                )}

                {/* Playhead */}
                {videoDuration > 0 && (
                  <div 
                    className="absolute top-0 bottom-0 w-[2px] bg-red-500 pointer-events-none z-30 -translate-x-1/2"
                    style={{ left: `${(currentTime / videoDuration) * 100}%` }}
                  >
                    <div className="w-2 h-2 rounded-full bg-red-500 -translate-x-[3px] -translate-y-0.5" />
                  </div>
                )}
              </div>

              {/* Segment Actions (Split, Delete, Frame Step, Play Selection) */}
              <div className="flex items-center gap-2 mt-1">
                <button 
                  onClick={() => stepFrame(false)}
                  className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 hover:text-white flex items-center justify-center text-xs active:scale-95 transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <button 
                  onClick={togglePlay}
                  className="flex-1 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-bold tracking-wider uppercase text-white hover:bg-slate-800 active:scale-95 transition flex items-center justify-center gap-1.5"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white ml-0.5" />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>

                <button 
                  onClick={() => stepFrame(true)}
                  className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 hover:text-white flex items-center justify-center text-xs active:scale-95 transition"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <button 
                  onClick={handleSplitSegment}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-semibold text-slate-200 hover:text-white active:scale-95 transition flex items-center gap-1"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  Split
                </button>

                <button 
                  onClick={handleDeleteSegment}
                  disabled={segments.length <= 1}
                  className="px-3 py-1.5 bg-red-950/40 border border-red-900/50 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 active:scale-95 transition flex items-center gap-1 disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>

            {/* Caption Text Boxes */}
            <div className="flex flex-col gap-4">
              
              {/* Always show Main Caption */}
              <div className="flex flex-col gap-2 p-3 bg-slate-900 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-bold tracking-wider uppercase text-slate-400 text-[11px]">Main Caption</label>
                  <span className="text-[10px] text-slate-500 font-mono">{mainCaption.length} / 220</span>
                </div>
                <textarea
                  value={mainCaption}
                  onChange={(e) => setMainCaption(e.target.value)}
                  placeholder="Enter your main caption..."
                  rows={2}
                  className="w-full bg-slate-950 border border-editor-panelBorder rounded-lg p-2.5 text-white text-xs resize-none focus:outline-none focus:border-white/40 transition placeholder:text-slate-600"
                />
                <div className="flex gap-2">
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Font</label>
                    <select 
                      value={mainFont} 
                      onChange={e => setMainFont(e.target.value)}
                      className="bg-slate-950 border border-editor-panelBorder rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                    >
                      <option value="Alike">Alike</option>
                  <option value="Calistoga">Calistoga</option>
                    </select>
                  </div>
                  <div className="w-20 flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Emoji <span className="text-[8px] bg-slate-800 px-1 rounded ml-1">OPT</span></label>
                    <input 
                      type="text" 
                      value={mainEmoji}
                      onChange={e => setMainEmoji(e.target.value)}
                      className="w-full bg-slate-950 border border-editor-panelBorder rounded px-2 py-1.5 text-sm text-center text-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Show Curiosity Caption only in curiosity mode */}
              {activeTab === 'curiosity' && (
                <div className="flex flex-col gap-2 p-3 bg-slate-900 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-bold tracking-wider uppercase text-slate-400 text-[11px]">Curiosity Caption</label>
                    <span className="text-[10px] text-slate-500 font-mono">{curiosityCaption.length} / 220</span>
                  </div>
                  <textarea
                    value={curiosityCaption}
                    onChange={(e) => setCuriosityCaption(e.target.value)}
                    placeholder="Enter your curiosity caption..."
                    rows={2}
                    className="w-full bg-slate-950 border border-editor-panelBorder rounded-lg p-2.5 text-white text-xs resize-none focus:outline-none focus:border-white/40 transition placeholder:text-slate-600"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Font</label>
                      <select 
                        value={curiosityFont} 
                        onChange={e => setCuriosityFont(e.target.value)}
                        className="bg-slate-950 border border-editor-panelBorder rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                      >
                        <option value="Alike">Alike</option>
                  <option value="Calistoga">Calistoga</option>
                      </select>
                    </div>
                    <div className="w-20 flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Emoji <span className="text-[8px] bg-slate-800 px-1 rounded ml-1">OPT</span></label>
                      <input 
                        type="text" 
                        value={curiosityEmoji}
                        onChange={e => setCuriosityEmoji(e.target.value)}
                        className="w-full bg-slate-950 border border-editor-panelBorder rounded px-2 py-1.5 text-sm text-center text-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Extra Settings */}
            <div className="flex flex-col gap-3 mt-4 mb-6">

            </div>

          </div>

        </div>

      </div>
    </div>
  );
}








