import { describe, it, expect } from 'vitest';
import { buildSegmentCommand, buildConcatCommand, buildPairwiseTransitionCommand } from './ffmpegBuilder';
import { TimelineItem } from '../types/project';

describe('ffmpegBuilder', () => {
  it('builds a normal video clip command', () => {
    const item: TimelineItem = {
      id: 'clip1',
      mediaId: 'm1',
      startTime: 0,
      duration: 5,
      sourceStart: 2.5,
      transform: { scale: 1, x: 0, y: 0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } }
    } as TimelineItem;
    
    const cmd = buildSegmentCommand({
      timelineItem: item,
      mediaPath: '/tmp/test.mp4',
      duration: 5.0,
      outPath: '/tmp/out1.mp4',
      width: 1920,
      height: 1080
    });

    expect(cmd).toEqual([
      'ffmpeg', '-y',
      '-ss', '2.5',
      '-i', '/tmp/test.mp4',
      '-filter_complex', '[0:v]scale=1920:1080:force_original_aspect_ratio=disable,crop=1920:1080:0:0,setsar=1,fps=30,setpts=PTS-STARTPTS[outv]',
      '-map', '[outv]',
      '-an',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-t', '5',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart',
      '/tmp/out1.mp4'
    ]);
  });

  it('builds a vertical source into 16:9 clip command', () => {
    const item: TimelineItem = {
      id: 'clip2',
      mediaId: 'm2',
      startTime: 5,
      duration: 4,
      sourceStart: 0,
      transform: { scale: 1.2, x: 10, y: -5, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } }
    } as TimelineItem;
    
    // 1080x1920 vertical video
    const cmd = buildSegmentCommand({
      timelineItem: item,
      mediaPath: '/tmp/vert.mp4',
      duration: 4.0,
      outPath: '/tmp/out2.mp4',
      width: 1080,
      height: 1920
    });

    // base_scale = max(1920/1080, 1080/1920) = 1.7777...
    // total_scale = 1.7777 * 1.2 = 2.13333...
    // scaled_w = 1080 * 2.13333 = 2304
    // scaled_h = 1920 * 2.13333 = 4096
    // delta_x = 1920 * (10 / 100) = 192
    // delta_y = 1080 * (-5 / 100) = -54
    // raw_crop_x = (2304-1920)/2 - 192 = 192 - 192 = 0
    // raw_crop_y = (4096-1080)/2 - (-54) = 1508 + 54 = 1562
    // crop_x = min(2304-1920, 0) ? wait: max(0, min(384, 0)) => 0
    // crop_y = max(0, min(3016, 1562)) => 1562
    
    expect(cmd).toContain('-filter_complex');
    const filterStr = cmd[cmd.indexOf('-filter_complex') + 1];
    expect(filterStr).toContain('scale=2304:4096:force_original_aspect_ratio=disable');
    expect(filterStr).toContain('crop=1920:1080:0:1562');
  });

  it('builds an image asset command', () => {
    const item: TimelineItem = {
      id: 'clip3',
      mediaId: 'm3',
      startTime: 9,
      duration: 3,
      transform: { scale: 1, x: 0, y: 0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } }
    } as TimelineItem;
    
    const cmd = buildSegmentCommand({
      timelineItem: item,
      mediaPath: '/tmp/img.png',
      isImage: true,
      duration: 3.0,
      outPath: '/tmp/out3.mp4',
      width: 1920,
      height: 1080
    });

    expect(cmd).toEqual([
      'ffmpeg', '-y',
      '-loop', '1',
      '-t', '3',
      '-i', '/tmp/img.png',
      '-filter_complex', '[0:v]scale=1920:1080:force_original_aspect_ratio=disable,crop=1920:1080:0:0,setsar=1,fps=30,setpts=PTS-STARTPTS[outv]',
      '-map', '[outv]',
      '-an',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-t', '3',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart',
      '/tmp/out3.mp4'
    ]);
  });

  it('builds a gap / black fallback command', () => {
    const cmd = buildSegmentCommand({
      duration: 2.5,
      outPath: '/tmp/gap.mp4'
    });

    expect(cmd).toEqual([
      'ffmpeg', '-y', '-f', 'lavfi',
      '-i', 'color=c=black:s=1920x1080:r=30:d=2.5',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-r', '30',
      '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart',
      '/tmp/gap.mp4'
    ]);
  });

  it('builds concat command WITH frame overlay', () => {
    const cmd = buildConcatCommand({
      concatListPath: '/tmp/list.txt',
      voiceoverPath: '/tmp/vo.wav',
      totalDuration: 15,
      outPath: '/tmp/final.mp4',
      frameConfig: { enabled: true },
      overlayAssetPath: '/tmp/pip.png'
    });

    expect(cmd).toEqual([
      'ffmpeg', '-y',
      '-fflags', '+genpts',
      '-f', 'concat',
      '-safe', '0',
      '-i', '/tmp/list.txt',
      '-i', '/tmp/vo.wav',
      '-loop', '1',
      '-i', '/tmp/pip.png',
      '-filter_complex', '[2:v]scale=1920:1080:flags=lanczos[frame_overlay];[0:v][frame_overlay]overlay=0:0:shortest=1[outv]',
      '-map', '[outv]',
      '-map', '1:a:0',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-t', '15',
      '-movflags', '+faststart',
      '/tmp/final.mp4'
    ]);
  });

  it('builds concat command WITHOUT frame overlay (silent fallback)', () => {
    const cmd = buildConcatCommand({
      concatListPath: '/tmp/list.txt',
      totalDuration: 10,
      outPath: '/tmp/final.mp4',
      frameConfig: { enabled: false }
    });

    expect(cmd).toEqual([
      'ffmpeg', '-y',
      '-fflags', '+genpts',
      '-f', 'concat',
      '-safe', '0',
      '-i', '/tmp/list.txt',
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo:d=10',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-t', '10',
      '-movflags', '+faststart',
      '/tmp/final.mp4'
    ]);
  });

  it('builds a SLOW_ZOOM segment safely', () => {
    const item: TimelineItem = {
      id: 'clip1',
      mediaId: 'm1',
      startTime: 0,
      duration: 5,
      sourceStart: 2.5,
      transform: { scale: 1, x: 0, y: 0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } }
    } as TimelineItem;

    const cmd = buildSegmentCommand({
      timelineItem: item,
      mediaPath: '/tmp/test.mp4',
      duration: 5.0,
      outPath: '/tmp/out1.mp4',
      width: 1920,
      height: 1080,
      treatment: { motion: 'SLOW_ZOOM', typography: 'NONE', transition: 'HARD_CUT', reason: '', motionParams: { startScale: 1.0, endScale: 1.1 } }
    });

    const filterIdx = cmd.indexOf('-filter_complex');
    expect(filterIdx).toBeGreaterThan(-1);
    const filter = cmd[filterIdx + 1];
    expect(filter).toContain('scale=1920:1080');
    expect(filter).toContain('setpts=PTS-STARTPTS[base];[base]zoompan=z=\'1+');
    expect(filter).toContain('*(time/5)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=1:s=1920x1080:fps=30[outv]');
  });

  it('builds a PUNCH_ZOOM segment with safe trigger clamping', () => {
    const item: TimelineItem = {
      id: 'clip1',
      mediaId: 'm1',
      startTime: 0,
      duration: 5,
      sourceStart: 2.5,
      transform: { scale: 1, x: 0, y: 0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } }
    } as TimelineItem;

    // triggerTime = 6 (greater than duration - ramp (4.7)), should clamp to 4.7
    const cmd = buildSegmentCommand({
      timelineItem: item,
      mediaPath: '/tmp/test.mp4',
      duration: 5.0,
      outPath: '/tmp/out1.mp4',
      width: 1920,
      height: 1080,
      treatment: { motion: 'PUNCH_ZOOM', typography: 'NONE', transition: 'HARD_CUT', reason: '', motionParams: { scale: 1.3, triggerTime: 6 } }
    });

    const filterIdx = cmd.indexOf('-filter_complex');
    const filter = cmd[filterIdx + 1];
    expect(filter).toContain('zoompan=z=\'1.0+(1.3-1.0)*min(max(time-4.7\\,0)/0.3\\,1.0)\'');
  });

  it('builds a fallback NORMAL_CLIP safely when treatment is missing or unrecognized', () => {
    const item: TimelineItem = {
      id: 'clip1',
      mediaId: 'm1',
      startTime: 0,
      duration: 5,
      sourceStart: 2.5,
      transform: { scale: 1, x: 0, y: 0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } }
    } as TimelineItem;

    const cmd = buildSegmentCommand({
      timelineItem: item,
      mediaPath: '/tmp/test.mp4',
      duration: 5.0,
      outPath: '/tmp/out1.mp4',
      width: 1920,
      height: 1080,
      treatment: { motion: 'FAKE_INVALID' as any, typography: 'NONE', transition: 'HARD_CUT', reason: '' }
    });

    const filterIdx = cmd.indexOf('-filter_complex');
    const filter = cmd[filterIdx + 1];
    expect(filter).toContain('setpts=PTS-STARTPTS[outv]');
    expect(filter).not.toContain('zoompan');
  });

  it('generates an explicit black gap command when isGap is true', () => {
    const cmd = buildSegmentCommand({
      isGap: true,
      duration: 2.5,
      outPath: '/tmp/gap.mp4'
    });

    expect(cmd).toEqual([
      'ffmpeg', '-y', '-f', 'lavfi',
      '-i', 'color=c=black:s=1920x1080:r=30:d=2.5',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-r', '30',
      '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart',
      '/tmp/gap.mp4'
    ]);
  });

  describe('Stage 3C Typography Overlay Execution', () => {
    it('builds NORMAL_CLIP with typography overlay', () => {
      const item: TimelineItem = {
        id: 'clip1',
        mediaId: 'm1',
        startTime: 0,
        duration: 4,
        sourceStart: 0,
        transform: { scale: 1, x: 0, y: 0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
      } as TimelineItem;

      const cmd = buildSegmentCommand({
        timelineItem: item,
        mediaPath: '/tmp/test.mp4',
        duration: 4.0,
        outPath: '/tmp/out_typo.mp4',
        width: 1920,
        height: 1080,
        treatment: { motion: 'NORMAL_CLIP', typography: 'CONTEXT_LABEL', transition: 'HARD_CUT', reason: 'Entity' },
        overlayPath: '/tmp/typo.png',
        overlayStart: 0.3,
        overlayEnd: 2.5,
      });

      expect(cmd).toContain('-loop');
      expect(cmd).toContain('/tmp/typo.png');
      const filterIdx = cmd.indexOf('-filter_complex');
      const filter = cmd[filterIdx + 1];
      expect(filter).toContain('setpts=PTS-STARTPTS[motion_out]');
      expect(filter).toContain("[1:v]fps=30,setpts=PTS-STARTPTS[ovl];[motion_out][ovl]overlay=0:0:enable='between(t,0.3,2.5)':shortest=1[outv]");
      expect(cmd).toContain('-map');
      expect(cmd[cmd.indexOf('-map') + 1]).toBe('[outv]');
    });

    it('builds SLOW_ZOOM with typography overlay', () => {
      const item: TimelineItem = {
        id: 'clip1',
        mediaId: 'm1',
        startTime: 0,
        duration: 5,
        sourceStart: 0,
        transform: { scale: 1, x: 0, y: 0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
      } as TimelineItem;

      const cmd = buildSegmentCommand({
        timelineItem: item,
        mediaPath: '/tmp/test.mp4',
        duration: 5.0,
        outPath: '/tmp/out_slow_typo.mp4',
        width: 1920,
        height: 1080,
        treatment: { motion: 'SLOW_ZOOM', typography: 'EMPHASIS_TEXT', transition: 'HARD_CUT', reason: 'Impact' },
        overlayPath: '/tmp/typo.png',
        overlayStart: 0.5,
        overlayEnd: 2.0,
      });

      const filterIdx = cmd.indexOf('-filter_complex');
      const filter = cmd[filterIdx + 1];
      expect(filter).toContain('zoompan=');
      expect(filter).toContain('[motion_out]');
      expect(filter).toContain("[1:v]fps=30,setpts=PTS-STARTPTS[ovl];[motion_out][ovl]overlay=0:0:enable='between(t,0.5,2)':shortest=1[outv]");
    });

    it('builds PUNCH_ZOOM with typography overlay', () => {
      const item: TimelineItem = {
        id: 'clip1',
        mediaId: 'm1',
        startTime: 0,
        duration: 3,
        sourceStart: 0,
        transform: { scale: 1, x: 0, y: 0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
      } as TimelineItem;

      const cmd = buildSegmentCommand({
        timelineItem: item,
        mediaPath: '/tmp/test.mp4',
        duration: 3.0,
        outPath: '/tmp/out_punch_typo.mp4',
        width: 1920,
        height: 1080,
        treatment: { motion: 'PUNCH_ZOOM', typography: 'EMPHASIS_TEXT', transition: 'HARD_CUT', reason: 'Impact' },
        overlayPath: '/tmp/typo.png',
        overlayStart: 0.0,
        overlayEnd: 1.5,
      });

      const filterIdx = cmd.indexOf('-filter_complex');
      const filter = cmd[filterIdx + 1];
      expect(filter).toContain('zoompan=');
      expect(filter).toContain('[motion_out]');
      expect(filter).toContain("[1:v]fps=30,setpts=PTS-STARTPTS[ovl];[motion_out][ovl]overlay=0:0:enable='between(t,0,1.5)':shortest=1[outv]");
    });

    it('builds image asset with typography overlay', () => {
      const item: TimelineItem = {
        id: 'img1',
        mediaId: 'm_img',
        startTime: 0,
        duration: 4,
        sourceStart: 0,
        transform: { scale: 1, x: 0, y: 0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
      } as TimelineItem;

      const cmd = buildSegmentCommand({
        timelineItem: item,
        mediaPath: '/tmp/photo.jpg',
        isImage: true,
        duration: 4.0,
        outPath: '/tmp/out_img_typo.mp4',
        width: 1920,
        height: 1080,
        treatment: { motion: 'SLOW_ZOOM', typography: 'CONTEXT_LABEL', transition: 'HARD_CUT', reason: 'Photo' },
        overlayPath: '/tmp/label.png',
        overlayStart: 0.3,
        overlayEnd: 2.5,
      });

      // Both image and overlay have -loop 1
      const loopIndices: number[] = [];
      cmd.forEach((arg, idx) => {
        if (arg === '-loop') loopIndices.push(idx);
      });
      expect(loopIndices).toHaveLength(2);
    });

    it('clamps overlayStart and overlayEnd safely to duration bounds', () => {
      const item: TimelineItem = {
        id: 'clip1',
        mediaId: 'm1',
        startTime: 0,
        duration: 3,
        sourceStart: 0,
        transform: { scale: 1, x: 0, y: 0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
      } as TimelineItem;

      const cmd = buildSegmentCommand({
        timelineItem: item,
        mediaPath: '/tmp/test.mp4',
        duration: 3.0,
        outPath: '/tmp/out_clamped.mp4',
        width: 1920,
        height: 1080,
        overlayPath: '/tmp/typo.png',
        overlayStart: -2.0,
        overlayEnd: 10.0,
      });

      const filterIdx = cmd.indexOf('-filter_complex');
      const filter = cmd[filterIdx + 1];
      expect(filter).toContain("enable='between(t,0,3)'");
    });
  });

  describe('Stage 3D: pairwise transition & tail handle', () => {
    it('Test 9: builds pairwise xfade command structure correctly', () => {
      const cmd = buildPairwiseTransitionCommand({
        segAPath: '/tmp/segA.mp4',
        segBPath: '/tmp/segB.mp4',
        duration: 0.5,
        offset: 3.0,
        outPath: '/tmp/xfade_0_1.mp4'
      });

      expect(cmd).toEqual([
        'ffmpeg', '-y',
        '-i', '/tmp/segA.mp4',
        '-i', '/tmp/segB.mp4',
        '-filter_complex', '[0:v][1:v]xfade=transition=fade:duration=0.5:offset=3[outv]',
        '-map', '[outv]',
        '-an',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-avoid_negative_ts', 'make_zero',
        '-movflags', '+faststart',
        '/tmp/xfade_0_1.mp4'
      ]);
    });

    it('Test 10: tail handle extends render duration without shifting sourceStart or leaking typography', () => {
      const item: TimelineItem = {
        id: 'clip1',
        mediaId: 'm1',
        startTime: 0,
        duration: 3.0,
        sourceStart: 1.5,
        transform: { scale: 1, x: 0, y: 0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
      } as TimelineItem;

      // Video clip with tailHandle
      const cmdVideo = buildSegmentCommand({
        timelineItem: item,
        mediaPath: '/tmp/video.mp4',
        duration: 3.0,
        tailHandle: 0.5,
        outPath: '/tmp/out_tail.mp4',
        width: 1920,
        height: 1080,
        treatment: { motion: 'SLOW_ZOOM', typography: 'EMPHASIS_TEXT', transition: 'CROSSFADE', reason: 'Flow' },
        overlayPath: '/tmp/typo.png',
        overlayStart: 0.5,
        overlayEnd: 3.0,
      });

      // -ss should remain 1.5 (sourceStart)
      const ssIdx = cmdVideo.indexOf('-ss');
      expect(ssIdx).toBeGreaterThan(-1);
      expect(cmdVideo[ssIdx + 1]).toBe('1.5');

      // -t should be duration + tailHandle = 3.5
      const tIndices: number[] = [];
      cmdVideo.forEach((arg, idx) => {
        if (arg === '-t') tIndices.push(idx);
      });
      expect(tIndices.length).toBeGreaterThan(0);
      expect(cmdVideo[tIndices[tIndices.length - 1] + 1]).toBe('3.5');

      // zoompan duration expression uses extended duration (time/3.5)
      const filterStr = cmdVideo[cmdVideo.indexOf('-filter_complex') + 1];
      expect(filterStr).toContain('(time/3.5)');

      // typography overlay bounds must remain clamped to base duration (3.0), not extended to 3.5
      expect(filterStr).toContain("enable='between(t,0.5,3)'");

      // Image clip with tailHandle
      const cmdImage = buildSegmentCommand({
        timelineItem: item,
        mediaPath: '/tmp/img.png',
        isImage: true,
        duration: 2.0,
        tailHandle: 0.5,
        outPath: '/tmp/out_img_tail.mp4',
        width: 1920,
        height: 1080,
      });
      // Image -t should be 2.5
      const imgTIndices: number[] = [];
      cmdImage.forEach((arg, idx) => {
        if (arg === '-t') imgTIndices.push(idx);
      });
      expect(cmdImage[imgTIndices[0] + 1]).toBe('2.5');
      expect(cmdImage[imgTIndices[imgTIndices.length - 1] + 1]).toBe('2.5');
    });

    it('Test 11: NORMAL_CLIP regression: identical command whether transition is HARD_CUT or omitted, without xfade', () => {
      const item: TimelineItem = {
        id: 'clip1',
        mediaId: 'm1',
        startTime: 0,
        duration: 4.0,
        sourceStart: 0,
        transform: { scale: 1, x: 0, y: 0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
      } as TimelineItem;

      const cmdHardCut = buildSegmentCommand({
        timelineItem: item,
        mediaPath: '/tmp/video.mp4',
        duration: 4.0,
        outPath: '/tmp/out.mp4',
        width: 1920,
        height: 1080,
        treatment: { motion: 'NORMAL_CLIP', typography: 'NONE', transition: 'HARD_CUT', reason: 'Cut' },
      });

      const cmdOmitted = buildSegmentCommand({
        timelineItem: item,
        mediaPath: '/tmp/video.mp4',
        duration: 4.0,
        outPath: '/tmp/out.mp4',
        width: 1920,
        height: 1080,
        treatment: { motion: 'NORMAL_CLIP', typography: 'NONE', reason: 'Normal' } as any,
      });

      expect(cmdHardCut).toEqual(cmdOmitted);
      const filter = cmdHardCut[cmdHardCut.indexOf('-filter_complex') + 1];
      expect(filter).not.toContain('xfade');
      expect(filter).not.toContain('zoompan');
    });

    it('Test 12: missing treatment fallback regression produces standard NORMAL_CLIP pipeline', () => {
      const item: TimelineItem = {
        id: 'clip1',
        mediaId: 'm1',
        startTime: 0,
        duration: 3.0,
        sourceStart: 0,
        transform: { scale: 1, x: 0, y: 0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
      } as TimelineItem;

      const cmdNoTreatment = buildSegmentCommand({
        timelineItem: item,
        mediaPath: '/tmp/video.mp4',
        duration: 3.0,
        outPath: '/tmp/out_fallback.mp4',
        width: 1920,
        height: 1080,
      });

      const filter = cmdNoTreatment[cmdNoTreatment.indexOf('-filter_complex') + 1];
      expect(filter).toBe('[0:v]scale=1920:1080:force_original_aspect_ratio=disable,crop=1920:1080:0:0,setsar=1,fps=30,setpts=PTS-STARTPTS[outv]');
      expect(filter).not.toContain('xfade');
      expect(filter).not.toContain('zoompan');
    });
  });
});
