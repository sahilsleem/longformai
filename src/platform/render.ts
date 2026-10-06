import { Filesystem, Directory } from '@capacitor/filesystem';
import NativeFFmpeg from '../engine/NativeFFmpeg';
import { registerPlugin } from '@capacitor/core';
const FFmpegKit = registerPlugin('FFmpegKitPlugin');

export interface RenderOptions {
  videoPath: string;
  isCuriosity: boolean;
  mainCaption: string;
  mainEmoji: string;
  mainFont: string;
  curiosityCaption: string;
  curiosityEmoji: string;
  curiosityFont: string;
  enhance: boolean;
  audioMode: 'original' | 'enhanced' | 'voice_focus';
  watermark: boolean;
  segments: any[];
  onProgress: (msg: string) => void;
}

const ENHANCED_VIDEO_FILTERS = "hqdn3d=1.5:1.5:3:3,eq=contrast=1.06:brightness=0.015:saturation=1.12:gamma=1.02,unsharp=5:5:0.5:3:3:0.0";
const DEFAULT_VIDEO_FILTERS = "eq=contrast=1.03:brightness=0.01:saturation=1.08:gamma=1.02,unsharp=3:3:0.3:3:3:0.0";
const ENHANCED_AUDIO_FILTERS = "highpass=f=80,lowpass=f=12000,equalizer=f=250:t=q:w=1.2:g=-1.5,equalizer=f=3000:t=q:w=1.2:g=2.5,acompressor=threshold=0.1:ratio=3:attack=15:release=120:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=11";
const VOICE_FOCUS_AUDIO_FILTERS = "highpass=f=120,lowpass=f=7500,equalizer=f=200:t=q:w=1.0:g=-3.0,equalizer=f=600:t=q:w=1.5:g=-2.5,equalizer=f=2800:t=q:w=1.2:g=4.0,equalizer=f=4500:t=q:w=1.5:g=2.5,acompressor=threshold=0.08:ratio=4:attack=10:release=100:makeup=2.5,loudnorm=I=-16:TP=-1.5:LRA=8";

export async function renderVideo(options: RenderOptions): Promise<string> {
  options.onProgress('Preparing your edit...');
  
  options.onProgress('Generating graphics...');
  const mainOverlayUri = await generateCaptionImage(options.mainCaption, options.mainEmoji, options.mainFont, 'main_overlay.png', 'main', options.isCuriosity);
  let curiosityOverlayUri = '';
  if (options.isCuriosity) {
    curiosityOverlayUri = await generateCaptionImage(options.curiosityCaption, options.curiosityEmoji, options.curiosityFont, 'curiosity_overlay.png', 'curiosity', true);
  }

  options.onProgress('Assembling video...');
  const outputName = `AutoCut_export_${Date.now()}.mp4`;
  const { uri: outputUri } = await Filesystem.getUri({
    directory: Directory.Cache,
    path: outputName
  });

  const sourceVid = options.videoPath.replace('file://', '');
  const mainOverlay = mainOverlayUri.replace('file://', '');
  const outPath = outputUri.replace('file://', '');

  const isMulti = options.segments.length > 1;
  const seg0 = options.segments[0];
  const seg1 = isMulti ? options.segments[1] : null;

  const crop_x = Math.round(seg0.crop_x);
  const crop_y = Math.round(seg0.crop_y);
  const crop_size = Math.round(seg0.crop_size);

  const videoFilters = options.enhance ? ENHANCED_VIDEO_FILTERS : DEFAULT_VIDEO_FILTERS;
  const applyAudioEnhance = options.enhance && (options.audioMode === 'enhanced' || options.audioMode === 'voice_focus');
  const audioFilters = options.audioMode === 'voice_focus' ? VOICE_FOCUS_AUDIO_FILTERS : ENHANCED_AUDIO_FILTERS;

  let cmd = `-y -i "${sourceVid}" -i "${mainOverlay}"`;
  if (options.isCuriosity) {
    cmd += ` -i "${curiosityOverlayUri.replace('file://', '')}"`;
  }

  let fc = '';
  
  if (isMulti && seg1 && options.isCuriosity) {
    // ===== CURIOSITY MODE: seg0 + black gap transition + seg1 with separate captions =====
    const dur0 = seg0.end - seg0.start;
    const dur1 = seg1.end - seg1.start;
    const gapDur = 0.15; // 150ms black gap
    const fadeDur = 0.2; // 200ms fade duration

    // Extract seg0 video and audio with fade out
    fc += `[0:v]trim=${seg0.start}:${seg0.end},setpts=PTS-STARTPTS,crop=${crop_size}:${crop_size}:${crop_x}:${crop_y},scale=1002:1002,fade=t=out:st=${dur0 - fadeDur}:d=${fadeDur},${videoFilters}[v0];`;
    fc += `[0:a]atrim=${seg0.start}:${seg0.end},asetpts=PTS-STARTPTS,afade=t=out:st=${dur0 - fadeDur}:d=${fadeDur}[a0];`;

    // Extract seg1 video and audio with fade in
    const c1_x = Math.round(seg1.crop_x);
    const c1_y = Math.round(seg1.crop_y);
    const c1_s = Math.round(seg1.crop_size);
    fc += `[0:v]trim=${seg1.start}:${seg1.end},setpts=PTS-STARTPTS,crop=${c1_s}:${c1_s}:${c1_x}:${c1_y},scale=1002:1002,fade=t=in:st=0:d=${fadeDur},${videoFilters}[v1];`;
    fc += `[0:a]atrim=${seg1.start}:${seg1.end},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fadeDur}[a1];`;

    // Black gap
    fc += `color=c=black:s=1002x1002:d=${gapDur}:r=30[vgap];`;
    fc += `anullsrc=d=${gapDur}[agap];`;

    // Concat video and audio
    fc += `[v0][vgap][v1]concat=n=3:v=1:a=0[sq_v];`;
    fc += `[a0][agap][a1]concat=n=3:v=0:a=1[sq_a];`;
    
    // Background and overlays
    const totalDur = dur0 + gapDur + dur1;
    fc += `color=c=white:s=1080x1920:d=${totalDur}:r=30[bg];`;
    fc += `[bg][sq_v]overlay=39:420:eof_action=pass[with_sq];`;
    
    // Main caption on first segment only
    fc += `[with_sq][1:v]overlay=0:0:enable='between(t,0,${dur0})'[with_main];`;
    
    // Curiosity caption on second segment
    fc += `[with_main][2:v]overlay=0:0:enable='gte(t,${dur0 + gapDur})'[with_cur];`;
    // Blackout during the gap
    fc += `[with_cur]drawbox=x=0:y=0:w=1080:h=1920:color=black:t=fill:enable='between(t,${dur0},${dur0 + gapDur})'[outv]`;

    if (applyAudioEnhance) {
      fc += `;[sq_a]${audioFilters}[outa]`;
      cmd += ` -filter_complex "${fc}" -map "[outv]" -map "[outa]"`;
    } else {
      cmd += ` -filter_complex "${fc}" -map "[outv]" -map "[sq_a]"`;
    }

  } else if (isMulti && !options.isCuriosity) {
    // ===== MAIN MODE with multiple segments: concatenate seamlessly, one caption for full video =====
    // No transition, no gap. Just stitch segments together with their own crop/zoom.
    let totalDur = 0;
    let vConcatStr = "";
    let aConcatStr = "";
    const n = options.segments.length;
    
    // Explicitly split the input video and audio streams N times
    let vSplits = "";
    let aSplits = "";
    for (let i = 0; i < n; i++) {
      vSplits += `[v_in${i}]`;
      aSplits += `[a_in${i}]`;
    }
    fc += `[0:v]split=${n}${vSplits};`;
    fc += `[0:a]asplit=${n}${aSplits};`;
    
    options.segments.forEach((seg, i) => {
      const sDur = seg.end - seg.start;
      totalDur += sDur;
      const cX = Math.round(seg.crop_x);
      const cY = Math.round(seg.crop_y);
      const cS = Math.round(seg.crop_size);
      
      fc += `[v_in${i}]trim=${seg.start}:${seg.end},setpts=PTS-STARTPTS,crop=${cS}:${cS}:${cX}:${cY},scale=1002:1002,${videoFilters}[v${i}];`;
      fc += `[a_in${i}]atrim=${seg.start}:${seg.end},asetpts=PTS-STARTPTS[a${i}];`;
      
      vConcatStr += `[v${i}]`;
      aConcatStr += `[a${i}]`;
    });
    
    
    fc += `${vConcatStr}concat=n=${n}:v=1:a=0[sq_v];`;
    fc += `${aConcatStr}concat=n=${n}:v=0:a=1[sq_a];`;
    
    // Background and overlays
    fc += `color=c=white:s=1080x1920:d=${totalDur}:r=30[bg];`;
    fc += `[bg][sq_v]overlay=39:420:eof_action=pass[with_sq];`;
    
    // One caption for the entire video
    fc += `[with_sq][1:v]overlay=0:0[outv]`;

    if (applyAudioEnhance) {
      fc += `;[sq_a]${audioFilters}[outa]`;
      cmd += ` -filter_complex "${fc}" -map "[outv]" -map "[outa]"`;
    } else {
      cmd += ` -filter_complex "${fc}" -map "[outv]" -map "[sq_a]"`;
    }

  } else {
    // Single segment
    const dur = seg0.end - seg0.start;
    cmd += ` -ss ${seg0.start} -t ${dur}`; // Fast seek for single seg
    
    fc += `[0:v]crop=${crop_size}:${crop_size}:${crop_x}:${crop_y},scale=1002:1002,${videoFilters}[v_proc];`;
    fc += `color=c=white:s=1080x1920:d=${dur}:r=30[bg];`;
    fc += `[bg][v_proc]overlay=39:420:eof_action=pass[with_sq];`;
    
    // Main caption
    fc += `[with_sq][1:v]overlay=0:0[outv]`;

    if (applyAudioEnhance) {
      fc += `;[0:a]${audioFilters}[outa]`;
      cmd += ` -filter_complex "${fc}" -map "[outv]" -map "[outa]"`;
    } else {
      cmd += ` -filter_complex "${fc}" -map "[outv]" -map "0:a?"`;
    }
  }

  cmd += ` -c:v libx264 -preset ultrafast -crf 24 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 44100 "${outPath}"`;

    options.onProgress('Finalizing your video...');
  const result = await (FFmpegKit as any).executeFFmpegCommand({ command: cmd });

  if (result.returnCode !== 0) {
    throw new Error('FFmpeg processing failed with code ' + result.returnCode);
  }

  options.onProgress('Saving to Gallery...');
  let finalUri = outputUri;
  try {
    if (typeof NativeFFmpeg?.saveToGallery === 'function') {
      const mediaStoreRes = await NativeFFmpeg.saveToGallery({
        filePath: outPath,
        filename: outputName,
        relativePath: 'Movies/AutoCut/',
      });
      if (mediaStoreRes?.uri) {
        finalUri = mediaStoreRes.uri;
      }
    }
  } catch (e) {
    console.warn('Could not save to MediaStore:', e);
  }
  
  options.onProgress('Done!');
  return finalUri;
}


async function generateCaptionImage(text: string, emoji: string, font: string, filename: string, mode: 'main'|'curiosity', isCuriosityMode: boolean): Promise<string> {
  // Force the browser to download the font if it hasn't already (since it's not in the visible DOM)
  await document.fonts.load(`10px "${font}"`);
  await document.fonts.load(`bold 10px "${font}"`);
  await document.fonts.ready;
  
  // Wait explicitly up to 2 seconds for the font to actually report as loaded
  for (let i = 0; i < 20; i++) {
    if (document.fonts.check(`10px "${font}"`)) break;
    await new Promise(r => setTimeout(r, 100));
  }
  // Draw a dummy text to force the engine to initialize the font glyphs
  const dummyCanvas = document.createElement('canvas');
  const dCtx = dummyCanvas.getContext('2d')!;
  dCtx.font = `bold 10px "${font}", sans-serif`;
  dCtx.fillText("A", 0, 10);
  await new Promise(r => setTimeout(r, 50)); // Tiny yield to ensure GPU catches up


  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const fullText = text.trim();
  if (!fullText) {
    const emptyBase64 = canvas.toDataURL('image/png').split(',')[1];
    await Filesystem.writeFile({ path: filename, data: emptyBase64, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: filename });
    return uri;
  }

  // Handle newlines
  const processedText = fullText.replace(/\r\n/g, '\n').replace(/\n/g, ' \n ');
  const words: {word: string, color: string, isExplicitEmoji?: boolean}[] = [];
  
  // Coloring rules depend on AutoCut mode AND which caption this is
  if (mode === 'main' && !isCuriosityMode) {
    // MAIN MODE - Main Caption: words starting with capital letter = RED, rest = BLACK
    processedText.split(' ').forEach(w => {
      if (w === '\n') { words.push({ word: '\n', color: 'transparent' }); return; }
      if (!w) return;
      const firstChar = w.replace(/[^a-zA-Z]/g, '')[0];
      const isRed = firstChar && firstChar === firstChar.toUpperCase();
      const color = isRed ? '#ef4444' : '#000000';
      words.push({ word: w, color });
    });
    if (emoji) {
      words.push({ word: emoji, color: '#000000', isExplicitEmoji: true });
    }
  } else if (mode === 'main' && isCuriosityMode) {
    // CURIOSITY MODE - Main Caption: text before comma = BLACK, text after comma = RED
    let passedComma = false;
    processedText.split(' ').forEach(w => {
      if (w === '\n') { words.push({ word: '\n', color: 'transparent' }); return; }
      if (!w) return;
      const color = passedComma ? '#ef4444' : '#000000';
      words.push({ word: w, color });
      if (!passedComma && w.includes(',')) {
        passedComma = true;
      }
    });
    if (emoji) {
      words.push({ word: emoji, color: '#000000', isExplicitEmoji: true });
    }
  } else if (mode === 'curiosity') {
    // CURIOSITY MODE - Curiosity Caption: ALL BLACK, no color changes
    processedText.split(' ').forEach(w => {
      if (w === '\n') { words.push({ word: '\n', color: 'transparent' }); return; }
      if (!w) return;
      words.push({ word: w, color: '#000000' });
    });
    if (emoji) {
      words.push({ word: emoji, color: '#000000', isExplicitEmoji: true });
    }
  }

  const maxWidth = 936;
  let bestFontSize = 82;
  let finalLines: {word: string, color: string, isExplicitEmoji?: boolean}[][] = [];
  let spaceW = 0;

  for (let fs = 82; fs >= 38; fs -= 2) {
    ctx.font = `bold ${fs}px "${font}", sans-serif`;
    spaceW = ctx.measureText(" ").width;

    const lines: {word: string, color: string, isExplicitEmoji?: boolean}[][] = [];
    let currentLine: {word: string, color: string, isExplicitEmoji?: boolean}[] = [];
    let currentW = 0;
    let validSize = true;
    
    for (const w of words) {
      if (w.word === '\n') {
        if (currentLine.length) lines.push(currentLine);
        currentLine = [];
        currentW = 0;
        continue;
      }
      const wW = ctx.measureText(w.word).width;
      if (wW > maxWidth) { validSize = false; break; }
      if (!currentLine.length) {
        currentLine.push(w);
        currentW = wW;
      } else {
        if (currentW + spaceW + wW <= maxWidth) {
          currentLine.push(w);
          currentW += spaceW + wW;
        } else {
          lines.push(currentLine);
          currentLine = [w];
          currentW = wW;
        }
      }
    }
    if (!validSize) continue;
    if (currentLine.length) lines.push(currentLine);
    
    if (lines.length <= 2) {
      bestFontSize = fs;
      finalLines = lines;
      break;
    }
  }

  if (finalLines.length === 0) {
    bestFontSize = 38;
    ctx.font = `bold ${bestFontSize}px "${font}", sans-serif`;
    spaceW = ctx.measureText(" ").width;
    let currLine: {word: string, color: string, isExplicitEmoji?: boolean}[] = [];
    let currW = 0;
    for (const w of words) {
      if (w.word === '\n') {
        if (currLine.length) finalLines.push(currLine);
        else finalLines.push([{word: " ", color: "transparent"}]);
        currLine = [];
        currW = 0;
        continue;
      }
      const wW = ctx.measureText(w.word).width;
      if (!currLine.length) {
        currLine.push(w);
        currW = wW;
      } else if (currW + spaceW + wW <= maxWidth) {
        currLine.push(w);
        currW += spaceW + wW;
      } else {
        finalLines.push(currLine);
        currLine = [w];
        currW = wW;
      }
    }
    if (currLine.length) finalLines.push(currLine);
  }

  ctx.font = `bold ${bestFontSize}px "${font}", sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';

  const getWidthFinal = (line: {word: string}[]) => {
    if (!line.length) return 0;
    return line.reduce((acc, w) => acc + ctx.measureText(w.word).width, 0) + spaceW * (line.length - 1);
  };

  const lineHeight = bestFontSize * 1.2;
  const lineSpacing = bestFontSize * 0.1;
  const totalHeight = (finalLines.length * lineHeight) + Math.max(0, finalLines.length - 1) * lineSpacing;
  
  let startY = 390 - totalHeight + lineHeight;
  
  const getEmojiHex = (e: string) => {
    return Array.from(e).map(c => c.codePointAt(0)?.toString(16)).join('-');
  };

  const drawEmoji = async (emojiChar: string, x: number, y: number, size: number) => {
    try {
      const hex = getEmojiHex(emojiChar);
      const url = `https://unpkg.com/emoji-datasource-apple@15.0.1/img/apple/64/${hex}.png`;
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      // Adjust y to align with text baseline
      ctx.drawImage(img, x, y - size * 0.85, size, size);
      return true;
    } catch (err) {
      return false; // fallback
    }
  };

  for (const line of finalLines) {
    const lineW = getWidthFinal(line);
    let startX = (1080 - lineW) / 2;
    
    for (const w of line) {
      if (w.isExplicitEmoji) {
        const success = await drawEmoji(w.word, startX, startY, bestFontSize);
        if (!success) {
          ctx.fillStyle = w.color;
          ctx.fillText(w.word, startX, startY);
        }
      } else {
        ctx.fillStyle = w.color;
        ctx.fillText(w.word, startX, startY);
      }
      startX += ctx.measureText(w.word).width + spaceW;
    }
    
    startY += lineHeight + lineSpacing;
  }
  
  const base64Data = canvas.toDataURL('image/png').split(',')[1];
  await Filesystem.writeFile({ path: filename, data: base64Data, directory: Directory.Cache });
  const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: filename });
  return uri;
}


