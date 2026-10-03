import { LongFormProject, MediaAsset, VoiceoverTrack } from '../types/project';
import { transcribeAudioFile, releaseTranscriptionModel } from './transcription';
import { analyzeMediaAsset } from './mediaAnalysis';
import { releaseVisionModel } from './vision';
import { matchMediaForSegment, batchMatchMediaForSegments, releaseMatchingModel } from './matching';

export interface PreparationProgress {
  stage: 'checking' | 'transcribing' | 'analyzing_media' | 'semantic_matching' | 'complete' | 'error';
  percent: number;
  message: string;
  currentItem?: string;
}

export interface PreparationResult {
  success: boolean;
  voiceoverReady: boolean;
  mediaAnalyzedCount: number;
  segmentsMatchedCount: number;
  errors: string[];
  updatedVoiceover?: VoiceoverTrack;
  updatedMedia?: MediaAsset[];
}

/**
 * Sequential, modular preparation engine that gets all ingredients ready:
 * A. Verifies voiceover & media
 * B. Transcribes voiceover if needed (Whisper :8765)
 * C. Analyzes unanalyzed media assets (BLIP :8766 + deterministic features)
 * D. Computes semantic candidate matches for transcript segments (MiniLM :8767)
 * 
 * Does NOT overwrite manual timeline edits or generate draft automatically.
 */
export async function prepareProjectPipeline(
  project: LongFormProject,
  onProgress?: (progress: PreparationProgress) => void
): Promise<PreparationResult> {
  const errors: string[] = [];
  let updatedVoiceover: VoiceoverTrack | undefined = project.voiceover ? { ...project.voiceover } : undefined;
  let updatedMedia: MediaAsset[] = [...project.media];

  try {
    onProgress?.({
      stage: 'checking',
      percent: 5,
      message: 'Verifying media and audio ingredients...',
    });

    // 1. Verify Voiceover & Transcribe
    let voiceoverReady = false;
    if (!updatedVoiceover) {
      errors.push('No voiceover audio file found. Add a voiceover track in the Media Library.');
    } else {
      // Check if voiceover needs transcription
      if (!updatedVoiceover.segments || updatedVoiceover.segments.length === 0) {
        onProgress?.({
          stage: 'transcribing',
          percent: 15,
          message: 'Transcribing voiceover narration...',
        });

        try {
          let audioSource: Blob | undefined;
          const nativePath = updatedVoiceover.nativePath;

          if (!nativePath) {
            if (updatedVoiceover.file) {
              audioSource = updatedVoiceover.file;
            } else if (updatedVoiceover.url) {
              const res = await fetch(updatedVoiceover.url);
              audioSource = await res.blob();
            } else {
              throw new Error('Voiceover audio file not found in memory.');
            }
          }

          const transcriptionRes = await transcribeAudioFile(audioSource, updatedVoiceover.name, {
            modelSize: 'base',
            nativePath,
          });

          updatedVoiceover = {
            ...updatedVoiceover,
            segments: transcriptionRes.segments,
          };
          voiceoverReady = true;
        } catch (err: any) {
          const msg = `Transcription failed: ${err.message || err}`;
          errors.push(msg);
        } finally {
          // Explicit lifecycle boundary: guarantee Whisper is released immediately after transcription
          await releaseTranscriptionModel();
        }
      } else {
        voiceoverReady = true;
      }
    }

    // Safety guarantee: Whisper must be completely released before BLIP begins
    await releaseTranscriptionModel();

    // 2. Visual Media Analysis
    let mediaAnalyzedCount = 0;
    const unanalyzedIndices = updatedMedia
      .map((m, idx) => (!m.analysis?.analyzed ? idx : -1))
      .filter((idx) => idx !== -1);

    if (unanalyzedIndices.length > 0) {
      try {
        for (let i = 0; i < unanalyzedIndices.length; i++) {
          const idx = unanalyzedIndices[i];
          const asset = updatedMedia[idx];
          const currentPct = 30 + Math.round(((i + 1) / unanalyzedIndices.length) * 35);

          onProgress?.({
            stage: 'analyzing_media',
            percent: currentPct,
            message: `Analyzing media (${i + 1}/${unanalyzedIndices.length}): ${asset.name}...`,
            currentItem: asset.name,
          });

          try {
            const analysis = await analyzeMediaAsset(asset);
            updatedMedia[idx] = {
              ...asset,
              analysis,
            };
            mediaAnalyzedCount++;
          } catch (err: any) {
            console.warn(`Analysis failed for ${asset.name}:`, err);
            errors.push(`Analysis failed for "${asset.name}": ${err.message || err}`);
          }
        }
      } finally {
        // Explicit lifecycle boundary: release BLIP once all media analysis is complete
        await releaseVisionModel();
      }
    } else {
      mediaAnalyzedCount = updatedMedia.filter((m) => m.analysis?.analyzed).length;
    }

    // Safety guarantee: BLIP must be completely released before MiniLM begins
    await releaseVisionModel();

    // 3. Pre-compute Semantic Matches for Transcript Segments
    let segmentsMatchedCount = 0;
    if (updatedVoiceover && updatedVoiceover.segments && updatedVoiceover.segments.length > 0) {
      const analyzedMediaAssets = updatedMedia.filter((m) => m.analysis?.analyzed);

      if (analyzedMediaAssets.length > 0) {
        onProgress?.({
          stage: 'semantic_matching',
          percent: 75,
          message: 'Matching footage with narration...',
        });

        try {
          await batchMatchMediaForSegments(updatedVoiceover.segments, analyzedMediaAssets, { topK: 5 });
          const updatedSegments = [...updatedVoiceover.segments];
          for (let s = 0; s < updatedSegments.length; s++) {
            const seg = updatedSegments[s];
            const matchPct = 75 + Math.round(((s + 1) / updatedSegments.length) * 20);

            onProgress?.({
              stage: 'semantic_matching',
              percent: matchPct,
              message: `Matching footage (${s + 1}/${updatedSegments.length})...`,
            });

            try {
              const matchResult = await matchMediaForSegment(seg, analyzedMediaAssets, { topK: 5 });
              updatedSegments[s] = {
                ...seg,
                matchResult,
                matchedMediaId: matchResult.candidates.length > 0 ? matchResult.candidates[0].mediaId : undefined,
              };
              segmentsMatchedCount++;
            } catch (err: any) {
              console.warn(`Semantic matching warning for segment ${seg.id}:`, err);
            }
          }

          updatedVoiceover = {
            ...updatedVoiceover,
            segments: updatedSegments,
          };
        } finally {
          // Explicit lifecycle boundary: release MiniLM after matching completes
          await releaseMatchingModel();
        }
      }
    }

    const isSuccess = errors.length === 0;

    onProgress?.({
      stage: isSuccess ? 'complete' : 'error',
      percent: 100,
      message: isSuccess
        ? 'Project Ready ✓'
        : `Preparation completed with ${errors.length} issue(s).`,
    });

    return {
      success: isSuccess,
      voiceoverReady,
      mediaAnalyzedCount,
      segmentsMatchedCount,
      errors,
      updatedVoiceover,
      updatedMedia,
    };
  } finally {
    // Safety net: ensure all native AI engines are released if an unhandled error occurred
    await releaseTranscriptionModel().catch(() => {});
    await releaseVisionModel().catch(() => {});
    await releaseMatchingModel().catch(() => {});
  }
}
