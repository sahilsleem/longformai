import { useState, useEffect, useCallback, useRef } from 'react';
import { LongFormProject, MediaAsset, TimelineItem, TransformState, VoiceoverTrack } from '../types/project';
import { createDefaultTransform, createInitialProject, classifyAspectRatio } from '../engine/schema';
import { extractAudioWaveform } from '../engine/audio';
import { transcribeAudioFile } from '../engine/transcription';
import { analyzeMediaAsset } from '../engine/mediaAnalysis';
import { generateDraftTimeline, DraftOptions, DraftStats } from '../engine/draftTimeline';
import { prepareProjectPipeline, PreparationProgress, PreparationResult } from '../engine/preparation';
import {
  createMediaFolder,
  renameMediaFolder,
  deleteMediaFolder,
  cleanupDeletedFolderFromAssets,
  assignMediaToFolder as assignFolderHelper,
  removeMediaFromFolder as removeFolderHelper,
  setMediaFolders as setFoldersHelper,
} from '../engine/mediaFolders';
import {
  saveProjectLocal,
  loadProjectLocal,
  saveMediaBlob,
  deleteMediaBlob,
  clearLocalProject,
  hydrateProjectWithBlobs,
} from '../engine/persistence';

/**
 * Safely revokes a browser blob object URL if valid to prevent memory leaks
 */
function safeRevokeObjectURL(url?: string) {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
}

export function useProject() {
  const [project, setProject] = useState<LongFormProject>(() => {
    return createInitialProject();
  });

  const [isHydrating, setIsHydrating] = useState<boolean>(true);
  const [isSavingLocal, setIsSavingLocal] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<number | null>(null);

  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [timelineScale, setTimelineScale] = useState<number>(24); // pixels per second
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState<boolean>(false);
  const [draftStats, setDraftStats] = useState<DraftStats | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState<boolean>(false);
  const [preparationProgress, setPreparationProgress] = useState<PreparationProgress | null>(null);
  const [preparationError, setPreparationError] = useState<string | null>(null);

  const playAnimationRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const projectRef = useRef<LongFormProject>(project);
  projectRef.current = project;
  const saveTimeoutRef = useRef<number | null>(null);

  // 1. Initial Local State Hydration from IndexedDB on startup
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const stored = await loadProjectLocal();
        if (stored && stored.project && isMounted) {
          const hydrated = await hydrateProjectWithBlobs(stored.project);
          if (isMounted) {
            setProject(hydrated);
            setLastSavedTime(stored.savedAt);
          }
        }
      } catch (err) {
        console.warn('Failed to load local project on startup:', err);
      } finally {
        if (isMounted) {
          setIsHydrating(false);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Debounced Local Autosave on Project State Mutations
  useEffect(() => {
    if (isHydrating) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      setIsSavingLocal(true);
      try {
        await saveProjectLocal(projectRef.current);
        setLastSavedTime(Date.now());
      } catch (err) {
        console.warn('Autosave error:', err);
      } finally {
        setIsSavingLocal(false);
      }
    }, 400);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [project, isHydrating]);

  // 3. Page Lifecycle & Backgrounding Flush (visibilitychange, pagehide, beforeunload)
  useEffect(() => {
    const flushSave = async () => {
      if (!isHydrating && projectRef.current) {
        try {
          await saveProjectLocal(projectRef.current);
          setLastSavedTime(Date.now());
        } catch (e) {
          console.warn('Flush save error:', e);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSave();
      }
    };

    const handlePageHide = () => {
      flushSave();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, [isHydrating]);

  // Initialize hidden audio element for voiceover playback synchronization
  useEffect(() => {
    if (!audioPlayerRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audioPlayerRef.current = audio;
    }
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = '';
      }
    };
  }, []);

  // Update audio source when voiceover changes
  useEffect(() => {
    const audio = audioPlayerRef.current;
    if (!audio) return;

    if (project.voiceover?.url) {
      if (audio.src !== project.voiceover.url) {
        audio.src = project.voiceover.url;
      }
      audio.volume = project.voiceover.isMuted ? 0 : project.voiceover.volume;
    } else {
      audio.pause();
      audio.src = '';
    }
  }, [project.voiceover?.url, project.voiceover?.volume, project.voiceover?.isMuted]);

  // Visual duration from timeline clips
  const visualDuration = project.timeline.reduce((acc, item) => {
    const itemEnd = item.startTime + item.duration;
    return Math.max(acc, itemEnd);
  }, 0);

  // Total project duration: Audio duration becomes primary backbone when voiceover exists
  const totalDuration = project.voiceover
    ? Math.max(project.voiceover.duration, visualDuration)
    : visualDuration;

  // Synchronize audio playback & playhead animation loop
  useEffect(() => {
    const audio = audioPlayerRef.current;

    if (isPlaying) {
      lastTickTimeRef.current = performance.now();

      // Start audio playback once if voiceover exists and position is within range
      if (audio && project.voiceover && currentTimeRef.current < project.voiceover.duration) {
        if (Math.abs(audio.currentTime - currentTimeRef.current) > 0.05) {
          audio.currentTime = currentTimeRef.current;
        }
        audio.play().catch((err) => console.warn('Audio play warning:', err));
      }

      const tick = (now: number) => {
        // When voiceover audio is active and playing, use audio.currentTime as the master clock
        if (audio && project.voiceover && !audio.paused && !audio.ended) {
          const audioPos = audio.currentTime;
          currentTimeRef.current = audioPos;
          setCurrentTime(audioPos);

          if (totalDuration > 0 && audioPos >= totalDuration) {
            setIsPlaying(false);
            audio.pause();
            audio.currentTime = 0;
            currentTimeRef.current = 0;
            setCurrentTime(0);
            return;
          }
        } else {
          const delta = (now - lastTickTimeRef.current) / 1000;
          const next = currentTimeRef.current + delta;
          currentTimeRef.current = next;

          if (totalDuration > 0 && next >= totalDuration) {
            setIsPlaying(false);
            if (audio) {
              audio.pause();
              audio.currentTime = 0;
            }
            currentTimeRef.current = 0;
            setCurrentTime(0);
            return;
          }
          setCurrentTime(next);
        }

        lastTickTimeRef.current = now;
        playAnimationRef.current = requestAnimationFrame(tick);
      };

      playAnimationRef.current = requestAnimationFrame(tick);
    } else {
      if (playAnimationRef.current) {
        cancelAnimationFrame(playAnimationRef.current);
        playAnimationRef.current = null;
      }
      if (audio && !audio.paused) {
        audio.pause();
      }
    }

    return () => {
      if (playAnimationRef.current) {
        cancelAnimationFrame(playAnimationRef.current);
        playAnimationRef.current = null;
      }
    };
  }, [isPlaying, totalDuration, project.voiceover]);

  // Synchronize audio seek when user scrubs timeline
  const handleSeek = useCallback(
    (time: number) => {
      const clampedTime = Math.max(0, time);
      currentTimeRef.current = clampedTime;
      setCurrentTime(clampedTime);
      const audio = audioPlayerRef.current;
      if (audio && project.voiceover) {
        if (clampedTime <= project.voiceover.duration) {
          audio.currentTime = clampedTime;
        } else {
          audio.currentTime = project.voiceover.duration;
        }
      }
    },
    [project.voiceover]
  );

  // Set Voiceover Audio (Local Ingestion + Peak Waveform Extraction)
  const setVoiceoverAudio = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'audio';
    const url = URL.createObjectURL(file);
    const id = `voiceover_${Date.now()}`;

    // Persist audio blob to IndexedDB
    try {
      await saveMediaBlob(id, file, file.name, 'audio');
    } catch (e) {
      console.warn('Failed to persist voiceover blob:', e);
    }

    // 1. Extract duration
    let duration = 0;
    try {
      const audioEl = document.createElement('audio');
      audioEl.preload = 'metadata';
      await new Promise<void>((resolve) => {
        audioEl.onloadedmetadata = () => {
          duration = audioEl.duration || 0;
          resolve();
        };
        audioEl.onerror = () => resolve();
        audioEl.src = url;
      });
    } catch (e) {
      console.warn('Audio metadata extraction error:', e);
    }

    // 2. Extract true Web Audio API waveform amplitudes
    let waveformData: number[] = [];
    try {
      waveformData = await extractAudioWaveform(file, 240);
    } catch (e) {
      console.warn('Waveform extraction fallback:', e);
      waveformData = Array(240).fill(0.3);
    }

    setProject((prev) => {
      // Clean up previous voiceover blob URL and storage
      if (prev.voiceover?.id && prev.voiceover.id !== id) {
        deleteMediaBlob(prev.voiceover.id).catch(() => {});
      }
      if (prev.voiceover?.url && prev.voiceover.url !== url) {
        safeRevokeObjectURL(prev.voiceover.url);
      }

      const voiceover: VoiceoverTrack = {
        id,
        name: file.name,
        type: 'audio',
        url,
        file,
        duration: Math.max(0.5, duration),
        size: file.size,
        format: ext,
        waveformData,
        volume: 1.0,
        isMuted: false,
        segments: [],
        createdAt: Date.now(),
      };

      return {
        ...prev,
        voiceover,
        updatedAt: new Date().toISOString(),
      };
    });
    setIsDirty(true);
    setTranscriptionError(null);
  }, []);

  // Remove Voiceover Audio
  const removeVoiceoverAudio = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = '';
    }
    setProject((prev) => {
      if (prev.voiceover?.id) {
        deleteMediaBlob(prev.voiceover.id).catch(() => {});
      }
      if (prev.voiceover?.url) {
        safeRevokeObjectURL(prev.voiceover.url);
      }
      return {
        ...prev,
        voiceover: undefined,
        updatedAt: new Date().toISOString(),
      };
    });
    setIsDirty(true);
    setTranscriptionError(null);
  }, []);

  // Run Local Transcription
  const transcribeVoiceover = useCallback(
    async (options: { modelSize: 'tiny' | 'base' | 'small' } = { modelSize: 'base' }) => {
      if (!project.voiceover) {
        setTranscriptionError('Please import a voiceover audio file first.');
        return;
      }

      setIsTranscribing(true);
      setTranscriptionError(null);

      try {
        let audioSource: File | Blob;
        if (project.voiceover.file) {
          audioSource = project.voiceover.file;
        } else if (project.voiceover.url) {
          const res = await fetch(project.voiceover.url);
          audioSource = await res.blob();
        } else {
          throw new Error('Audio file source not available in memory.');
        }

        const result = await transcribeAudioFile(audioSource, project.voiceover.name, {
          modelSize: options.modelSize,
        });

        setProject((prev) => {
          if (!prev.voiceover) return prev;
          return {
            ...prev,
            voiceover: {
              ...prev.voiceover,
              segments: result.segments,
            },
            updatedAt: new Date().toISOString(),
          };
        });
        setIsDirty(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Transcription failed.';
        setTranscriptionError(msg);
      } finally {
        setIsTranscribing(false);
      }
    },
    [project.voiceover]
  );

  // Update transcript segment text
  const updateTranscriptSegmentText = useCallback((segmentId: string, newText: string) => {
    setProject((prev) => {
      if (!prev.voiceover || !prev.voiceover.segments) return prev;

      const updatedSegments = prev.voiceover.segments.map((seg) =>
        seg.id === segmentId ? { ...seg, text: newText } : seg
      );

      return {
        ...prev,
        voiceover: {
          ...prev.voiceover,
          segments: updatedSegments,
        },
        updatedAt: new Date().toISOString(),
      };
    });
    setIsDirty(true);
  }, []);

  // Analyze a specific Media Asset locally (Keyframes & Visual Stats)
  const analyzeMedia = useCallback(async (mediaId: string) => {
    const asset = project.media.find((m) => m.id === mediaId);
    if (!asset) return;

    // Set analyzing state
    setProject((prev) => ({
      ...prev,
      media: prev.media.map((m) =>
        m.id === mediaId ? { ...m, analysis: { analyzed: false, analyzing: true } } : m
      ),
    }));

    try {
      const analysisResult = await analyzeMediaAsset(asset);
      setProject((prev) => ({
        ...prev,
        media: prev.media.map((m) =>
          m.id === mediaId ? { ...m, analysis: analysisResult } : m
        ),
      }));
      setIsDirty(true);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Analysis failed';
      setProject((prev) => ({
        ...prev,
        media: prev.media.map((m) =>
          m.id === mediaId
            ? { ...m, analysis: { analyzed: false, analyzing: false, error: errMsg } }
            : m
        ),
      }));
    }
  }, [project.media]);

  // Analyze All Media Assets sequentially and update progress
  const analyzeAllMedia = useCallback(async () => {
    const unanalyzed = project.media.filter((m) => !m.analysis?.analyzed);
    const targets = unanalyzed.length > 0 ? unanalyzed : project.media;
    if (targets.length === 0) return;

    setIsPreparing(true);
    setPreparationProgress({
      stage: 'analyzing_media',
      percent: 0,
      message: `Analyzing 0/${targets.length} media assets...`,
    });

    for (let i = 0; i < targets.length; i++) {
      const targetAsset = targets[i];
      setPreparationProgress({
        stage: 'analyzing_media',
        percent: Math.round(((i + 1) / targets.length) * 100),
        message: `Analyzing visual media (${i + 1}/${targets.length}): ${targetAsset.name}...`,
        currentItem: targetAsset.name,
      });

      // Mark this asset analyzing
      setProject((prev) => ({
        ...prev,
        media: prev.media.map((m) =>
          m.id === targetAsset.id ? { ...m, analysis: { analyzed: false, analyzing: true } } : m
        ),
      }));

      try {
        const analysisResult = await analyzeMediaAsset(targetAsset);
        setProject((prev) => ({
          ...prev,
          media: prev.media.map((m) =>
            m.id === targetAsset.id ? { ...m, analysis: analysisResult } : m
          ),
        }));
        setIsDirty(true);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Analysis failed';
        console.warn(`Analysis failed for ${targetAsset.name}:`, err);
        setProject((prev) => ({
          ...prev,
          media: prev.media.map((m) =>
            m.id === targetAsset.id
              ? { ...m, analysis: { analyzed: false, analyzing: false, error: errMsg } }
              : m
          ),
        }));
      }
    }

    setIsPreparing(false);
    setPreparationProgress(null);
  }, [project.media]);

  // Voiceover Volume & Mute Controls
  const setVoiceoverVolume = useCallback((volume: number) => {
    setProject((prev) => {
      if (!prev.voiceover) return prev;
      return {
        ...prev,
        voiceover: { ...prev.voiceover, volume: Math.max(0, Math.min(1, volume)) },
      };
    });
    setIsDirty(true);
  }, []);

  const toggleVoiceoverMute = useCallback(() => {
    setProject((prev) => {
      if (!prev.voiceover) return prev;
      return {
        ...prev,
        voiceover: { ...prev.voiceover, isMuted: !prev.voiceover.isMuted },
      };
    });
    setIsDirty(true);
  }, []);

  // Add uploaded media assets
  const addMediaAssets = useCallback(async (files: FileList | File[], targetFolderId?: string) => {
    const fileArray = Array.from(files);
    const newAssets: MediaAsset[] = [];

    for (const file of fileArray) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isVideo = file.type.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(ext);
      const isImage = file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext);
      const isAudio = file.type.startsWith('audio/') || ['mp3', 'wav', 'aac', 'ogg', 'm4a'].includes(ext);

      if (!isVideo && !isImage && !isAudio) continue;

      const mediaType = isVideo ? 'video' : isImage ? 'image' : 'audio';
      const url = URL.createObjectURL(file);
      const id = `media_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // Persist binary blob into IndexedDB
      try {
        await saveMediaBlob(id, file, file.name, mediaType);
      } catch (e) {
        console.warn(`Failed to persist blob for ${file.name}:`, e);
      }

      let width = 1920;
      let height = 1080;
      let duration = isImage ? 5 : 0;

      if (isImage) {
        try {
          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => {
              width = img.naturalWidth || 1920;
              height = img.naturalHeight || 1080;
              resolve();
            };
            img.onerror = () => resolve();
            img.src = url;
          });
        } catch {
          // fallback
        }
      } else if (isVideo) {
        try {
          const vid = document.createElement('video');
          vid.preload = 'metadata';
          await new Promise<void>((resolve) => {
            vid.onloadedmetadata = () => {
              duration = vid.duration || 5;
              width = vid.videoWidth || 1920;
              height = vid.videoHeight || 1080;
              resolve();
            };
            vid.onerror = () => resolve();
            vid.src = url;
          });
        } catch {
          // fallback
        }
      } else if (isAudio) {
        try {
          const aud = document.createElement('audio');
          aud.preload = 'metadata';
          await new Promise<void>((resolve) => {
            aud.onloadedmetadata = () => {
              duration = aud.duration || 5;
              resolve();
            };
            aud.onerror = () => resolve();
            aud.src = url;
          });
        } catch {
          // fallback
        }
      }

      const { ratio, label } = classifyAspectRatio(width, height);

      newAssets.push({
        id,
        name: file.name,
        type: mediaType,
        url,
        file,
        width,
        height,
        duration: Math.max(0.1, duration),
        aspectRatio: ratio,
        aspectRatioLabel: label,
        size: file.size,
        folderIds: targetFolderId ? [targetFolderId] : undefined,
        createdAt: Date.now(),
      });
    }

    if (newAssets.length > 0) {
      setProject((prev) => ({
        ...prev,
        media: [...prev.media, ...newAssets],
        updatedAt: new Date().toISOString(),
      }));
      setIsDirty(true);

      // Trigger automatic background analysis for newly imported visual assets sequentially
      const visualAssets = newAssets.filter((a) => a.type === 'video' || a.type === 'image');
      if (visualAssets.length > 0) {
        (async () => {
          for (const newAsset of visualAssets) {
            try {
              // Avoid analyzing if already analyzed
              let isAlreadyAnalyzed = false;
              setProject((prev) => {
                const current = prev.media.find((m) => m.id === newAsset.id);
                if (current?.analysis?.analyzed) {
                  isAlreadyAnalyzed = true;
                  return prev;
                }
                return {
                  ...prev,
                  media: prev.media.map((m) =>
                    m.id === newAsset.id
                      ? { ...m, analysis: { ...(m.analysis || {}), analyzed: false, analyzing: true } }
                      : m
                  ),
                };
              });

              if (isAlreadyAnalyzed) continue;

              const analysisResult = await analyzeMediaAsset(newAsset);

              setProject((prev) => {
                const exists = prev.media.some((m) => m.id === newAsset.id);
                if (!exists) return prev;

                return {
                  ...prev,
                  media: prev.media.map((m) =>
                    m.id === newAsset.id ? { ...m, analysis: analysisResult } : m
                  ),
                  updatedAt: new Date().toISOString(),
                };
              });
              setIsDirty(true);
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? err.message : 'Automatic analysis failed';
              console.warn(`Automatic background analysis failed for ${newAsset.name}:`, err);
              setProject((prev) => {
                const exists = prev.media.some((m) => m.id === newAsset.id);
                if (!exists) return prev;

                return {
                  ...prev,
                  media: prev.media.map((m) =>
                    m.id === newAsset.id
                      ? { ...m, analysis: { ...(m.analysis || {}), analyzed: false, analyzing: false, error: errMsg } }
                      : m
                  ),
                };
              });
            }
          }
        })();
      }
    }
  }, []);

  // Folder Operations
  const createFolder = useCallback((name: string) => {
    const newFolder = createMediaFolder(name);
    setProject((prev) => ({
      ...prev,
      folders: [...(prev.folders || []), newFolder],
      updatedAt: new Date().toISOString(),
    }));
    setIsDirty(true);
    return newFolder;
  }, []);

  const renameFolder = useCallback((folderId: string, newName: string) => {
    setProject((prev) => ({
      ...prev,
      folders: renameMediaFolder(prev.folders || [], folderId, newName),
      updatedAt: new Date().toISOString(),
    }));
    setIsDirty(true);
  }, []);

  const deleteFolder = useCallback((folderId: string) => {
    setProject((prev) => ({
      ...prev,
      folders: deleteMediaFolder(prev.folders || [], folderId),
      media: cleanupDeletedFolderFromAssets(prev.media, folderId),
      updatedAt: new Date().toISOString(),
    }));
    setActiveFolderId((current) => (current === folderId ? null : current));
    setIsDirty(true);
  }, []);

  const assignMediaToFolder = useCallback((mediaId: string, folderId: string) => {
    setProject((prev) => ({
      ...prev,
      media: assignFolderHelper(prev.media, mediaId, folderId),
      updatedAt: new Date().toISOString(),
    }));
    setIsDirty(true);
  }, []);

  const removeMediaFromFolder = useCallback((mediaId: string, folderId: string) => {
    setProject((prev) => ({
      ...prev,
      media: removeFolderHelper(prev.media, mediaId, folderId),
      updatedAt: new Date().toISOString(),
    }));
    setIsDirty(true);
  }, []);

  const setMediaFolders = useCallback((mediaId: string, folderIds: string[]) => {
    setProject((prev) => ({
      ...prev,
      media: setFoldersHelper(prev.media, mediaId, folderIds),
      updatedAt: new Date().toISOString(),
    }));
    setIsDirty(true);
  }, []);

  const removeMediaAsset = useCallback((mediaId: string) => {
    deleteMediaBlob(mediaId).catch(() => {});
    setProject((prev) => {
      const target = prev.media.find((m) => m.id === mediaId);
      if (target?.url) {
        safeRevokeObjectURL(target.url);
      }
      return {
        ...prev,
        media: prev.media.filter((m) => m.id !== mediaId),
        timeline: prev.timeline.filter((item) => item.mediaId !== mediaId),
      };
    });
    setSelectedMediaId((curr) => (curr === mediaId ? null : curr));
    setIsDirty(true);
  }, []);

  // Add media to timeline with safe duration clamping
  const addMediaToTimeline = useCallback((mediaId: string) => {
    setProject((prev) => {
      const asset = prev.media.find((m) => m.id === mediaId);
      if (!asset) return prev;

      const currentEnd = prev.timeline.reduce(
        (acc, item) => Math.max(acc, item.startTime + item.duration),
        0
      );
      const itemDuration =
        asset.type === 'image'
          ? 5.0
          : Math.max(0.1, Math.min(5.0, asset.duration || 5.0));

      const newItem: TimelineItem = {
        id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        mediaId: asset.id,
        trackIndex: 0,
        startTime: currentEnd,
        duration: itemDuration,
        sourceStart: 0,
        sourceDuration: itemDuration,
        transform: JSON.parse(JSON.stringify(createDefaultTransform(asset.width, asset.height))),
      };

      return {
        ...prev,
        timeline: [...prev.timeline, newItem],
      };
    });
    setIsDirty(true);
  }, []);

  // Remove single clip (preserves individual clip positions)
  const removeTimelineItem = useCallback((itemId: string) => {
    setProject((prev) => ({
      ...prev,
      timeline: prev.timeline.filter((item) => item.id !== itemId),
    }));
    setSelectedItemId((curr) => (curr === itemId ? null : curr));
    setIsDirty(true);
  }, []);

  // Update item duration or sourceStart with strict safety clamping
  const updateTimelineItem = useCallback((itemId: string, updates: Partial<TimelineItem>) => {
    setProject((prev) => {
      const index = prev.timeline.findIndex((item) => item.id === itemId);
      if (index === -1) return prev;

      const currentItem = prev.timeline[index];
      const asset = prev.media.find((m) => m.id === currentItem.mediaId);

      let clampedStartTime =
        updates.startTime !== undefined
          ? Math.max(0, updates.startTime)
          : currentItem.startTime;

      let clampedSourceStart =
        updates.sourceStart !== undefined
          ? Math.max(0, updates.sourceStart)
          : currentItem.sourceStart;

      let clampedDuration =
        updates.duration !== undefined
          ? Math.max(0.1, updates.duration)
          : currentItem.duration;

      // If video asset with known duration, clamp within available footage bounds
      if (asset && asset.type === 'video' && typeof asset.duration === 'number' && asset.duration > 0) {
        clampedSourceStart = Math.min(clampedSourceStart, Math.max(0, asset.duration - 0.1));
        const maxFootageAvailable = Math.max(0.1, asset.duration - clampedSourceStart);
        clampedDuration = Math.min(clampedDuration, maxFootageAvailable);
      }

      const updatedItem: TimelineItem = {
        ...currentItem,
        ...updates,
        startTime: clampedStartTime,
        sourceStart: clampedSourceStart,
        duration: clampedDuration,
        sourceDuration:
          updates.sourceDuration !== undefined
            ? Math.max(0.1, updates.sourceDuration)
            : clampedDuration,
        provenance: currentItem.provenance
          ? {
              ...currentItem.provenance,
              isManuallyEdited: true,
            }
          : undefined,
      };

      const updatedList = [...prev.timeline];
      updatedList[index] = updatedItem;

      return {
        ...prev,
        timeline: updatedList,
      };
    });
    setIsDirty(true);
  }, []);

  // Generate AI Draft Timeline (Step 7)
  const generateAIDraft = useCallback(
    async (options: DraftOptions = {}) => {
      if (!project.voiceover || !project.voiceover.segments || project.voiceover.segments.length === 0) {
        setDraftError('Transcript segments are required to generate an AI draft. Please transcribe your voiceover first.');
        return;
      }

      if (project.media.length === 0) {
        setDraftError('Media assets are required to generate an AI draft. Please import and analyze media first.');
        return;
      }

      setIsGeneratingDraft(true);
      setDraftError(null);

      try {
        const result = await generateDraftTimeline(
          project.voiceover.segments,
          project.media,
          {
            folders: project.folders || [],
            ...options,
          }
        );

        setProject((prev) => ({
          ...prev,
          timeline: result.timeline,
          updatedAt: new Date().toISOString(),
        }));

        setDraftStats(result.stats);
        if (result.timeline.length > 0) {
          setSelectedItemId(result.timeline[0].id);
        }
        setIsDirty(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to generate AI draft.';
        setDraftError(msg);
      } finally {
        setIsGeneratingDraft(false);
      }
    },
    [project.voiceover, project.media]
  );

  // Clear all timeline clips
  const clearTimeline = useCallback(() => {
    setProject((prev) => ({
      ...prev,
      timeline: [],
      updatedAt: new Date().toISOString(),
    }));
    setSelectedItemId(null);
    setDraftStats(null);
    setDraftError(null);
    setIsDirty(true);
  }, []);

  // Strict Per-Clip Transform Isolation
  const updateItemTransform = useCallback((itemId: string, transformUpdates: Partial<TransformState>) => {
    setProject((prev) => {
      const index = prev.timeline.findIndex((item) => item.id === itemId);
      if (index === -1) return prev;

      const currentItem = prev.timeline[index];
      const existingTransform = currentItem.transform || {
        fitMode: 'cover',
        scale: 1.0,
        x: 0,
        y: 0,
      };

      const existingCrop = existingTransform.crop || { x: 0, y: 0, width: 1, height: 1 };
      const updatedTransform: TransformState = {
        ...existingTransform,
        ...transformUpdates,
        crop: {
          ...existingCrop,
          ...(transformUpdates.crop || {}),
        },
      };

      // Ensure no NaN values in transform coordinates or scale
      if (
        typeof updatedTransform.scale !== 'number' ||
        isNaN(updatedTransform.scale) ||
        updatedTransform.scale < 0.1
      ) {
        updatedTransform.scale = 1.0;
      }
      if (typeof updatedTransform.x !== 'number' || isNaN(updatedTransform.x)) {
        updatedTransform.x = 0;
      }
      if (typeof updatedTransform.y !== 'number' || isNaN(updatedTransform.y)) {
        updatedTransform.y = 0;
      }

      // Deep clone item to guarantee independent framing isolation
      const updatedList = [...prev.timeline];
      updatedList[index] = {
        ...currentItem,
        transform: updatedTransform,
        provenance: currentItem.provenance
          ? {
              ...currentItem.provenance,
              isManuallyEdited: true,
            }
          : undefined,
      };

      return {
        ...prev,
        timeline: updatedList,
      };
    });
    setIsDirty(true);
  }, []);

  const reorderTimelineItems = useCallback((newItems: TimelineItem[]) => {
    const sanitized = newItems.map((item) => ({
      ...item,
      startTime: Math.max(0, item.startTime),
      duration: Math.max(0.1, item.duration),
      sourceStart: Math.max(0, item.sourceStart || 0),
      provenance: item.provenance
        ? {
            ...item.provenance,
            isManuallyEdited: true,
          }
        : undefined,
    }));

    setProject((prev) => ({
      ...prev,
      timeline: sanitized,
    }));
    setIsDirty(true);
  }, []);

  const activeTimelineItem =
    project.timeline.find(
      (item) => currentTime >= item.startTime && currentTime < item.startTime + item.duration
    ) ||
    (project.timeline.length > 0 && currentTime >= visualDuration
      ? project.timeline[project.timeline.length - 1]
      : null);

  const selectedTimelineItem = project.timeline.find((item) => item.id === selectedItemId) || null;

  const effectiveTimelineItem = isPlaying
    ? activeTimelineItem
    : selectedTimelineItem || activeTimelineItem;

  const effectiveMediaAsset = effectiveTimelineItem
    ? project.media.find((m) => m.id === effectiveTimelineItem.mediaId) || null
    : null;

  const selectedMediaAsset = selectedTimelineItem
    ? project.media.find((m) => m.id === selectedTimelineItem.mediaId) || null
    : null;

  const currentlyInspectedMedia = project.media.find((m) => m.id === selectedMediaId) || null;

  // Prepare Project (One-Click Preparation Pipeline)
  const prepareProject = useCallback(async () => {
    setIsPreparing(true);
    setPreparationError(null);

    try {
      const result: PreparationResult = await prepareProjectPipeline(project, (progress) => {
        setPreparationProgress(progress);
      });

      if (result.updatedVoiceover || result.updatedMedia) {
        setProject((prev) => ({
          ...prev,
          voiceover: result.updatedVoiceover || prev.voiceover,
          media: result.updatedMedia || prev.media,
          updatedAt: new Date().toISOString(),
        }));
        setIsDirty(true);
      }

      if (!result.success && result.errors.length > 0) {
        setPreparationError(result.errors.join(' • '));
      }
    } catch (err: any) {
      const msg = err.message || 'Preparation pipeline failed';
      setPreparationError(msg);
    } finally {
      setIsPreparing(false);
    }
  }, [project]);

  // Relink a specific single Media Asset with a replacement file
  const relinkSingleMediaAsset = useCallback((mediaId: string, file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isVideo = file.type.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(ext);
    const isImage = file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext);
    const mediaType = isVideo ? 'video' : isImage ? 'image' : 'audio';

    saveMediaBlob(mediaId, file, file.name, mediaType).catch((e) =>
      console.warn('Failed to save relinked blob:', e)
    );

    setProject((prev) => {
      const targetIndex = prev.media.findIndex((m) => m.id === mediaId);
      if (targetIndex === -1) return prev;

      const updatedList = [...prev.media];
      const existing = updatedList[targetIndex];

      if (existing.url) {
        safeRevokeObjectURL(existing.url);
      }

      updatedList[targetIndex] = {
        ...existing,
        file,
        name: file.name,
        url: URL.createObjectURL(file),
      };

      return {
        ...prev,
        media: updatedList,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  // Relink Voiceover Audio with a replacement file (strictly preserves transcript segments)
  const relinkVoiceover = useCallback((file: File) => {
    setProject((prev) => {
      if (!prev.voiceover) return prev;

      saveMediaBlob(prev.voiceover.id, file, file.name, 'audio').catch((e) =>
        console.warn('Failed to save relinked voiceover blob:', e)
      );

      if (prev.voiceover.url) {
        safeRevokeObjectURL(prev.voiceover.url);
      }

      return {
        ...prev,
        voiceover: {
          ...prev.voiceover,
          file,
          name: file.name,
          url: URL.createObjectURL(file),
        },
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  // Batch Relink Local Media Files to imported project
  const relinkMediaFiles = useCallback(async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    const exactNameMap = new Map<string, File>();
    const lowerNameMap = new Map<string, File>();

    for (const f of fileList) {
      exactNameMap.set(f.name, f);
      lowerNameMap.set(f.name.toLowerCase(), f);
    }

    setProject((prev) => {
      let updatedVoiceover = prev.voiceover;
      if (updatedVoiceover) {
        let matchedVoFile: File | undefined = exactNameMap.get(updatedVoiceover.name);
        if (!matchedVoFile) {
          matchedVoFile = lowerNameMap.get(updatedVoiceover.name.toLowerCase());
        }
        if (!matchedVoFile) {
          matchedVoFile = fileList.find(
            (f) => f.name.startsWith(updatedVoiceover!.id) || f.name.includes(updatedVoiceover!.name)
          );
        }
        if (matchedVoFile) {
          saveMediaBlob(updatedVoiceover.id, matchedVoFile, matchedVoFile.name, 'audio').catch(() => {});
          if (updatedVoiceover.url) {
            safeRevokeObjectURL(updatedVoiceover.url);
          }
          updatedVoiceover = {
            ...updatedVoiceover,
            file: matchedVoFile,
            name: matchedVoFile.name,
            url: URL.createObjectURL(matchedVoFile),
          };
        }
      }

      const updatedMedia = prev.media.map((m) => {
        let matchedFile: File | undefined = exactNameMap.get(m.name);
        if (!matchedFile) {
          matchedFile = lowerNameMap.get(m.name.toLowerCase());
        }
        if (!matchedFile) {
          matchedFile = fileList.find((f) => f.name.startsWith(m.id) || f.name.includes(m.name));
        }

        if (matchedFile) {
          saveMediaBlob(m.id, matchedFile, matchedFile.name, m.type).catch(() => {});
          if (m.url) {
            safeRevokeObjectURL(m.url);
          }
          return {
            ...m,
            file: matchedFile,
            name: matchedFile.name,
            url: URL.createObjectURL(matchedFile),
          };
        }
        return m;
      });

      return {
        ...prev,
        voiceover: updatedVoiceover,
        media: updatedMedia,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const markSaved = useCallback(() => {
    setIsDirty(false);
  }, []);

  const importProject = useCallback((imported: LongFormProject) => {
    // Revoke previous media URLs before replacing
    setProject((prev) => {
      if (prev.voiceover?.url) {
        safeRevokeObjectURL(prev.voiceover.url);
      }
      for (const m of prev.media) {
        if (m.url) {
          safeRevokeObjectURL(m.url);
        }
      }
      return imported;
    });

    saveProjectLocal(imported).catch((e) => console.warn('Failed to persist imported project:', e));

    setSelectedItemId(null);
    setSelectedMediaId(null);
    setActiveFolderId(null);
    currentTimeRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    setDraftStats(null);
    setIsDirty(false);
  }, []);

  const resetProject = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = '';
    }

    clearLocalProject().catch((e) => console.warn('Failed to clear local project from IndexedDB:', e));

    setProject((prev) => {
      if (prev.voiceover?.url) {
        safeRevokeObjectURL(prev.voiceover.url);
      }
      for (const m of prev.media) {
        if (m.url) {
          safeRevokeObjectURL(m.url);
        }
      }
      return createInitialProject();
    });

    setSelectedItemId(null);
    setSelectedMediaId(null);
    setActiveFolderId(null);
    currentTimeRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    setTranscriptionError(null);
    setDraftStats(null);
    setDraftError(null);
    setPreparationProgress(null);
    setPreparationError(null);
    setIsDirty(false);
  }, []);

  return {
    project,
    folders: project.folders || [],
    activeFolderId,
    setActiveFolderId,
    createFolder,
    renameFolder,
    deleteFolder,
    assignMediaToFolder,
    removeMediaFromFolder,
    setMediaFolders,
    voiceover: project.voiceover,
    isDirty,
    markSaved,
    isHydrating,
    isSavingLocal,
    lastSavedTime,
    selectedItemId,
    selectedMediaId,
    currentlyInspectedMedia,
    currentTime,
    isPlaying,
    timelineScale,
    totalDuration,
    visualDuration,
    activeTimelineItem,
    effectiveTimelineItem,
    selectedTimelineItem,
    effectiveMediaAsset,
    selectedMediaAsset,
    isTranscribing,
    transcriptionError,
    isGeneratingDraft,
    draftStats,
    draftError,
    isPreparing,
    preparationProgress,
    preparationError,
    prepareProject,
    relinkSingleMediaAsset,
    relinkVoiceover,
    relinkMediaFiles,
    setSelectedItemId,
    setSelectedMediaId,
    setCurrentTime: handleSeek,
    setIsPlaying,
    setTimelineScale,
    setVoiceoverAudio,
    removeVoiceoverAudio,
    transcribeVoiceover,
    updateTranscriptSegmentText,
    analyzeMedia,
    analyzeAllMedia,
    generateAIDraft,
    clearTimeline,
    setVoiceoverVolume,
    toggleVoiceoverMute,
    addMediaAssets,
    removeMediaAsset,
    addMediaToTimeline,
    removeTimelineItem,
    updateTimelineItem,
    updateItemTransform,
    reorderTimelineItems,
    importProject,
    resetProject,
    setProjectName: (name: string) => {
      setProject((p) => ({ ...p, name }));
      setIsDirty(true);
    },
  };
}

