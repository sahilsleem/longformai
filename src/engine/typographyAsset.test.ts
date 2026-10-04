import { describe, it, expect } from 'vitest';
import {
  renderTypographyCanvas,
  generateTypographyOverlayBase64,
  generateTypographyOverlayBlob,
} from './typographyAsset';

describe('typographyAsset', () => {
  it('handles headless environment gracefully with base64 fallback', async () => {
    // In node/headless test environment without document:
    const b64 = await generateTypographyOverlayBase64({
      type: 'EMPHASIS_TEXT',
      text: 'BOLLYWOOD',
    });
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);
  });

  it('handles empty text gracefully', async () => {
    const b64 = await generateTypographyOverlayBase64({
      type: 'CONTEXT_LABEL',
      text: '',
    });
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);
  });

  it('generates blob fallback in headless environment', async () => {
    const blob = await generateTypographyOverlayBlob({
      type: 'EMPHASIS_TEXT',
      text: 'ACTION',
    });
    expect(blob).toBeDefined();
    expect(blob.type).toBe('image/png');
  });

  it('returns null for renderTypographyCanvas in headless environment', () => {
    if (typeof document === 'undefined') {
      const canvas = renderTypographyCanvas({
        type: 'EMPHASIS_TEXT',
        text: 'TEST',
      });
      expect(canvas).toBeNull();
    }
  });

  it('handles FULLSCREEN_TEXT in headless environment with base64 fallback', async () => {
    const b64 = await generateTypographyOverlayBase64({
      type: 'FULLSCREEN_TEXT',
      text: 'The Epic Chapter',
    });
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);
  });

  it('handles FULLSCREEN_TEXT blob generation in headless environment', async () => {
    const blob = await generateTypographyOverlayBlob({
      type: 'FULLSCREEN_TEXT',
      text: 'सिनेमा का इतिहास',
    });
    expect(blob).toBeDefined();
    expect(blob.type).toBe('image/png');
  });
});
