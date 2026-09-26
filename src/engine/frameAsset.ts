import { BOLLYWOOD_FRAME_BASE64 } from './frameAssetData';

const PNG_HEADER_HEX = '89504e470d0a1a0a';

/**
 * Validates whether the first 8 bytes of a buffer match the standard PNG magic signature.
 */
export function isPngHeader(buffer: ArrayBuffer | Uint8Array): boolean {
  const bytes = new Uint8Array(buffer).slice(0, 8);
  if (bytes.length < 8) return false;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.toLowerCase() === PNG_HEADER_HEX;
}

/**
 * Converts a base64 string to a Uint8Array binary buffer.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  // Node.js fallback without direct Buffer type reference
  const nodeBuffer = (globalThis as unknown as { Buffer?: { from: (str: string, enc: string) => Uint8Array } }).Buffer;
  if (nodeBuffer) {
    return new Uint8Array(nodeBuffer.from(base64, 'base64'));
  }
  return new Uint8Array(0);
}

/**
 * Returns a data URL string for immediate, zero-network display in UI/PreviewCanvas.
 */
export function getBollywoodFrameDataUrl(): string {
  return `data:image/png;base64,${BOLLYWOOD_FRAME_BASE64}`;
}

/**
 * Returns a guaranteed valid 1920x1080 transparent PNG Blob for the Bollywood broadcast frame.
 * Tries fetching from URL first; if the network returns HTML, 404, or invalid bytes,
 * immediately falls back to the embedded lossless binary PNG.
 */
export async function getBollywoodFrameBlob(customUrl?: string): Promise<Blob> {
  const candidateUrls = [
    customUrl,
    '/assets/frames/pip.png',
    '/src/assets/frames/pip.png',
  ].filter((u): u is string => typeof u === 'string' && u.trim().length > 0);

  for (const url of candidateUrls) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const arrayBuf = await resp.arrayBuffer();
        if (arrayBuf.byteLength > 10000 && isPngHeader(arrayBuf)) {
          return new Blob([arrayBuf], { type: 'image/png' });
        }
      }
    } catch {
      // Continue to next candidate or fallback
    }
  }

  // Guaranteed embedded binary fallback
  const bytes = base64ToUint8Array(BOLLYWOOD_FRAME_BASE64);
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
}
