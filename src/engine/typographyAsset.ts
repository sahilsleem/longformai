/**
 * Typography Asset Generator
 *
 * Deterministic Canvas-based generator for transparent 1920x1080 broadcast-grade
 * PNG overlays used by the Visual Story Director typography execution pipeline.
 */

export interface TypographyOverlaySpec {
  type: 'EMPHASIS_TEXT' | 'CONTEXT_LABEL' | 'FULLSCREEN_TEXT';
  text: string;
}

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

// Minimal 1x1 transparent PNG base64 fallback for headless/Node environments
const TRANSPARENT_1X1_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=';

/**
 * Draws a rounded rectangle path on a 2D canvas context,
 * with cross-platform fallback for older environments.
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Renders a typography overlay onto an HTML5 Canvas and returns the canvas element.
 */
export function renderTypographyCanvas(spec: TypographyOverlaySpec): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Clear to transparent
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const rawText = (spec.text || '').trim();
  if (!rawText) return canvas;

  if (spec.type === 'EMPHASIS_TEXT') {
    // EMPHASIS_TEXT: bold broadcast typography, centered in lower-mid zone
    const displayText = rawText.toUpperCase();
    const centerX = CANVAS_WIDTH / 2;
    const centerY = 660; // Lower-middle, leaving faces/center visible and staying above bottom safe area

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 84px sans-serif';

    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;

    // Heavy black outline / stroke for maximum contrast on any video footage
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 12;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(displayText, centerX, centerY);

    // High-visibility bright yellow/gold fill
    ctx.fillStyle = '#FFE600';
    ctx.fillText(displayText, centerX, centerY);
  } else if (spec.type === 'CONTEXT_LABEL') {
    // CONTEXT_LABEL: clean lower-third pill badge for entity identification
    ctx.font = '700 36px sans-serif';
    const metrics = ctx.measureText(rawText);
    const textWidth = metrics.width;

    const padX = 24;
    const pillHeight = 56;
    const pillWidth = Math.max(140, textWidth + padX * 2);
    const radius = 18;

    // Target position: lower-third safe zone at x=80, y=880
    const startX = 80;
    const startY = 880;

    // Soft drop shadow for the container pill
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    // Translucent dark slate background
    drawRoundedRect(ctx, startX, startY, pillWidth, pillHeight, radius);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fill();

    // Subtle crisp border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Reset shadow before drawing text
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Text: crisp off-white
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(rawText, startX + padX, startY + pillHeight / 2);
  } else if (spec.type === 'FULLSCREEN_TEXT') {
    // FULLSCREEN_TEXT: broadcast/documentary-style fullscreen story-card treatment
    // Card backdrop
    const cardX = 120;
    const cardY = 160;
    const cardW = 1680;
    const cardH = 760;
    const cardRadius = 24;

    // Card drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 12;

    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
    ctx.fillStyle = 'rgba(10, 15, 26, 0.92)';
    ctx.fill();

    // Subtle card border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Text formatting and layout
    ctx.font = '800 64px sans-serif';
    const maxLineWidth = 1500;
    const words = rawText.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxLineWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    // Limit to max 3 lines with ellipsis if necessary
    const maxLines = 3;
    let finalLines = lines;
    if (lines.length > maxLines) {
      finalLines = lines.slice(0, maxLines);
      let last = finalLines[maxLines - 1];
      while (last.length > 0 && ctx.measureText(`${last}...`).width > maxLineWidth) {
        last = last.slice(0, -1).trim();
      }
      finalLines[maxLines - 1] = `${last}...`;
    }

    // Fallback if empty
    if (finalLines.length === 0) {
      finalLines = [rawText];
    }

    const lineHeight = 84;
    const totalTextHeight = finalLines.length * lineHeight;
    const cardCenterY = cardY + cardH / 2;

    // Decorative accent line above title
    const accentW = 72;
    const accentH = 3;
    const accentGap = 40;
    const accentY = cardCenterY - totalTextHeight / 2 - accentGap;
    const accentX = CANVAS_WIDTH / 2 - accentW / 2;

    ctx.fillStyle = '#FFE600';
    ctx.fillRect(accentX, accentY, accentW, accentH);

    // Title rendering
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F8FAFC';

    // Start Y for the first line
    const textStartY = cardCenterY - totalTextHeight / 2 + lineHeight / 2;
    for (let i = 0; i < finalLines.length; i++) {
      const lineY = textStartY + i * lineHeight;
      ctx.fillText(finalLines[i], CANVAS_WIDTH / 2, lineY);
    }
  }

  return canvas;
}

/**
 * Generates a transparent 1920x1080 PNG Blob for the given typography specification.
 */
export async function generateTypographyOverlayBlob(spec: TypographyOverlaySpec): Promise<Blob> {
  const canvas = renderTypographyCanvas(spec);
  if (!canvas) {
    // Headless / Node fallback
    return new Blob([], { type: 'image/png' });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob returned null'));
    }, 'image/png');
  });
}

/**
 * Generates a base64-encoded transparent 1920x1080 PNG string (without data URL prefix)
 * ready to be written directly via Capacitor Filesystem.writeFile.
 */
export async function generateTypographyOverlayBase64(spec: TypographyOverlaySpec): Promise<string> {
  const canvas = renderTypographyCanvas(spec);
  if (!canvas) {
    return TRANSPARENT_1X1_PNG_BASE64;
  }

  const dataUrl = canvas.toDataURL('image/png');
  const base64Data = dataUrl.split(',')[1] || '';
  return base64Data;
}
