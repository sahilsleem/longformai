/**
 * Native client-side Web Audio API waveform extractor.
 * Decodes audio data into true normalized peak amplitudes without any external libraries or APIs.
 */
export async function extractAudioWaveform(
  fileOrBuffer: File | Blob | ArrayBuffer,
  samplesCount: number = 200
): Promise<number[]> {
  try {
    let arrayBuffer: ArrayBuffer;
    if (fileOrBuffer instanceof ArrayBuffer) {
      arrayBuffer = fileOrBuffer;
    } else {
      arrayBuffer = await fileOrBuffer.arrayBuffer();
    }

    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      return generateFallbackDurationPoints(samplesCount);
    }

    const audioCtx = new AudioContextClass();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0); // Primary mono channel
    const totalSamples = channelData.length;
    const blockSize = Math.floor(totalSamples / samplesCount);
    const peaks: number[] = [];

    for (let i = 0; i < samplesCount; i++) {
      const start = i * blockSize;
      let sum = 0;
      let max = 0;

      for (let j = 0; j < blockSize; j++) {
        const val = Math.abs(channelData[start + j] || 0);
        sum += val;
        if (val > max) max = val;
      }

      // Root mean square (RMS) / peak hybrid for natural speech visualization
      const avg = sum / blockSize;
      const peak = Math.max(avg * 1.5, max * 0.8);
      peaks.push(Math.min(1.0, Math.max(0.05, peak)));
    }

    // Normalize peaks across the file
    const maxPeak = Math.max(...peaks, 0.1);
    const normalized = peaks.map((p) => Math.round((p / maxPeak) * 100) / 100);

    audioCtx.close().catch(() => {});
    return normalized;
  } catch (err) {
    console.warn('Could not decode audio waveform via Web Audio API:', err);
    return generateFallbackDurationPoints(samplesCount);
  }
}

function generateFallbackDurationPoints(count: number): number[] {
  // Flat baseline line for unsupported formats
  return Array(count).fill(0.3);
}
