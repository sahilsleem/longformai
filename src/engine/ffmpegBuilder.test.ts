import { describe, it, expect } from 'vitest';
import { buildSegmentCommand, buildConcatCommand } from './ffmpegBuilder';
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
      '-i', '/tmp/pip.png',
      '-filter_complex', '[2:v]scale=1920:1080:flags=lanczos[frame_overlay];[0:v][frame_overlay]overlay=0:0[outv]',
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
});
