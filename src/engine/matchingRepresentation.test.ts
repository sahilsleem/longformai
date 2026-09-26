import { describe, it, expect } from 'vitest';
import { extractMediaPayload } from './matching';
import { MediaAsset, MediaFolder } from '../types/project';

describe('Media Representation Quality - Folder Identity Injection', () => {
  it('injects Subject: {folder.name} into the main description if an asset belongs to a folder', () => {
    const assets: MediaAsset[] = [
      {
        id: 'media1',
        name: 'video1.mp4',
        type: 'video',
        url: '',
        width: 1920,
        height: 1080,
        duration: 10,
        aspectRatio: 16/9,
        folderIds: ['folder-katrina'],
        analysis: {
          analyzed: true,
          description: 'A woman in a green dress',
          semantic: {
            analyzed: true,
            description: 'A woman in a green dress',
            tags: []
          }
        }
      }
    ] as unknown as MediaAsset[];

    const folders: MediaFolder[] = [
      {
        id: 'folder-katrina',
        name: 'Katrina Kaif',
        aliases: ['Katrina'],
        createdAt: 0
      }
    ];

    const payload = extractMediaPayload(assets, folders);
    expect(payload).toHaveLength(1);
    expect(payload[0].description).toBe('Subject: Katrina Kaif. A woman in a green dress');
  });

  it('leaves the description unchanged if the asset has no folder', () => {
    const assets: MediaAsset[] = [
      {
        id: 'media2',
        name: 'video2.mp4',
        type: 'video',
        url: '',
        width: 1920,
        height: 1080,
        duration: 10,
        aspectRatio: 16/9,
        analysis: {
          analyzed: true,
          description: 'A dog running',
          semantic: {
            analyzed: true,
            description: 'A dog running',
            tags: []
          }
        }
      }
    ] as unknown as MediaAsset[];

    const payload = extractMediaPayload(assets, []);
    expect(payload[0].description).toBe('A dog running');
  });

  it('multiple assets in the same folder all receive the same subject metadata', () => {
    const assets: MediaAsset[] = [
      {
        id: 'media1', name: 'v1.mp4', type: 'video', url: '', width: 1, height: 1, duration: 1, aspectRatio: 1, folderIds: ['folder-salman'],
        analysis: { analyzed: true, semantic: { analyzed: true, description: 'A man standing', tags: [] } }
      },
      {
        id: 'media2', name: 'v2.mp4', type: 'video', url: '', width: 1, height: 1, duration: 1, aspectRatio: 1, folderIds: ['folder-salman'],
        analysis: { analyzed: true, semantic: { analyzed: true, description: 'A man walking', tags: [] } }
      }
    ] as unknown as MediaAsset[];

    const folders: MediaFolder[] = [
      { id: 'folder-salman', name: 'Salman Khan', createdAt: 0 }
    ];

    const payload = extractMediaPayload(assets, folders);
    expect(payload[0].description).toBe('Subject: Salman Khan. A man standing');
    expect(payload[1].description).toBe('Subject: Salman Khan. A man walking');
  });

  it('does not mutate the original BLIP description', () => {
    const originalDescription = 'A woman in a green dress';
    const assets: MediaAsset[] = [
      {
        id: 'media1', name: 'v1.mp4', type: 'video', url: '', width: 1, height: 1, duration: 1, aspectRatio: 1, folderIds: ['folder-katrina'],
        analysis: { analyzed: true, semantic: { analyzed: true, description: originalDescription, tags: [] } }
      }
    ] as unknown as MediaAsset[];

    const folders: MediaFolder[] = [
      { id: 'folder-katrina', name: 'Katrina Kaif', createdAt: 0 }
    ];

    extractMediaPayload(assets, folders);
    expect(assets[0].analysis!.semantic!.description).toBe(originalDescription);
  });
});
