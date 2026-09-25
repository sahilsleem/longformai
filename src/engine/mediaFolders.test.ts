import { describe, it, expect } from 'vitest';
import {
  createMediaFolder,
  renameMediaFolder,
  deleteMediaFolder,
  cleanupDeletedFolderFromAssets,
  assignMediaToFolder,
  removeMediaFromFolder,
  setMediaFolders,
  getMediaFolderNames,
  getAssetsInFolder,
  getUnassignedAssets,
} from './mediaFolders';
import { MediaAsset, MediaFolder, LongFormProject } from '../types/project';
import {
  createInitialProject,
  exportProjectToPortableJSON,
  validateAndParseProjectJSON,
} from './schema';

describe('Media Folders Engine', () => {
  const sampleMedia: MediaAsset[] = [
    {
      id: 'media_1',
      name: 'salman_interview.mp4',
      type: 'video',
      url: 'blob:http://localhost/1',
      width: 1920,
      height: 1080,
      duration: 10,
      aspectRatio: 16 / 9,
      aspectRatioLabel: '16:9 Native',
      createdAt: 1000,
    },
    {
      id: 'media_2',
      name: 'katrina_dance.mp4',
      type: 'video',
      url: 'blob:http://localhost/2',
      width: 1920,
      height: 1080,
      duration: 15,
      aspectRatio: 16 / 9,
      aspectRatioLabel: '16:9 Native',
      folderIds: ['folder_katrina'],
      createdAt: 1001,
    },
    {
      id: 'media_3',
      name: 'tiger3_salman_katrina_action.mp4',
      type: 'video',
      url: 'blob:http://localhost/3',
      width: 1920,
      height: 1080,
      duration: 20,
      aspectRatio: 16 / 9,
      aspectRatioLabel: '16:9 Native',
      folderIds: ['folder_salman', 'folder_katrina'],
      createdAt: 1002,
    },
  ];

  const sampleFolders: MediaFolder[] = [
    { id: 'folder_salman', name: 'Salman Khan', createdAt: 1000 },
    { id: 'folder_katrina', name: 'Katrina Kaif', createdAt: 1001 },
  ];

  describe('createMediaFolder', () => {
    it('creates a new folder with given name and unique ID', () => {
      const folder = createMediaFolder('Deepika Padukone');
      expect(folder.name).toBe('Deepika Padukone');
      expect(folder.id).toMatch(/^folder_\d+_/);
      expect(folder.createdAt).toBeGreaterThan(0);
    });

    it('trims folder name whitespace and provides fallback for empty string', () => {
      const folderWithSpaces = createMediaFolder('   Ranveer Singh   ');
      expect(folderWithSpaces.name).toBe('Ranveer Singh');

      const emptyFolder = createMediaFolder('   ');
      expect(emptyFolder.name).toBe('Untitled Folder');
    });
  });

  describe('renameMediaFolder', () => {
    it('renames a specific folder immutably and sets updatedAt', () => {
      const updated = renameMediaFolder(sampleFolders, 'folder_salman', 'Salman Khan (Official)');
      expect(updated.find((f) => f.id === 'folder_salman')?.name).toBe('Salman Khan (Official)');
      expect(updated.find((f) => f.id === 'folder_salman')?.updatedAt).toBeGreaterThan(0);
      expect(updated.find((f) => f.id === 'folder_katrina')?.name).toBe('Katrina Kaif');
    });

    it('ignores empty rename strings', () => {
      const untouched = renameMediaFolder(sampleFolders, 'folder_salman', '   ');
      expect(untouched).toEqual(sampleFolders);
    });
  });

  describe('deleteMediaFolder & cleanupDeletedFolderFromAssets', () => {
    it('deletes folder from folders list immutably', () => {
      const updatedFolders = deleteMediaFolder(sampleFolders, 'folder_salman');
      expect(updatedFolders.length).toBe(1);
      expect(updatedFolders[0].id).toBe('folder_katrina');
    });

    it('cleans up deleted folder ID from media assets without deleting the media assets themselves', () => {
      const cleanedMedia = cleanupDeletedFolderFromAssets(sampleMedia, 'folder_salman');
      expect(cleanedMedia.length).toBe(3); // All media assets are preserved
      expect(cleanedMedia[0].folderIds).toBeUndefined(); // media_1 was unassigned
      expect(cleanedMedia[1].folderIds).toEqual(['folder_katrina']); // media_2 unaffected
      expect(cleanedMedia[2].folderIds).toEqual(['folder_katrina']); // media_3 has salman removed, katrina preserved
    });
  });

  describe('assignMediaToFolder & removeMediaFromFolder', () => {
    it('assigns media to folder and supports multi-folder membership', () => {
      // Assign media_1 to folder_salman
      const step1 = assignMediaToFolder(sampleMedia, 'media_1', 'folder_salman');
      expect(step1.find((m) => m.id === 'media_1')?.folderIds).toEqual(['folder_salman']);

      // Assign media_1 also to folder_katrina (multi-folder assignment)
      const step2 = assignMediaToFolder(step1, 'media_1', 'folder_katrina');
      expect(step2.find((m) => m.id === 'media_1')?.folderIds).toEqual(['folder_salman', 'folder_katrina']);

      // Does not create duplicates if assigned again
      const step3 = assignMediaToFolder(step2, 'media_1', 'folder_salman');
      expect(step3.find((m) => m.id === 'media_1')?.folderIds).toEqual(['folder_salman', 'folder_katrina']);
    });

    it('removes media from folder without deleting the media asset', () => {
      // media_3 is in ['folder_salman', 'folder_katrina']
      const removedSalman = removeMediaFromFolder(sampleMedia, 'media_3', 'folder_salman');
      expect(removedSalman.find((m) => m.id === 'media_3')?.folderIds).toEqual(['folder_katrina']);

      const removedKatrina = removeMediaFromFolder(removedSalman, 'media_3', 'folder_katrina');
      expect(removedKatrina.find((m) => m.id === 'media_3')?.folderIds).toEqual([]);
      // Asset is still present
      expect(removedKatrina.find((m) => m.id === 'media_3')?.name).toBe('tiger3_salman_katrina_action.mp4');
    });
  });

  describe('setMediaFolders', () => {
    it('replaces all folder assignments for an asset and dedupes input', () => {
      const updated = setMediaFolders(sampleMedia, 'media_1', [
        'folder_salman',
        'folder_katrina',
        'folder_salman',
      ]);
      expect(updated.find((m) => m.id === 'media_1')?.folderIds).toEqual(['folder_salman', 'folder_katrina']);
    });
  });

  describe('getMediaFolderNames', () => {
    it('resolves correct folder names for an asset', () => {
      expect(getMediaFolderNames(sampleMedia[0], sampleFolders)).toEqual([]);
      expect(getMediaFolderNames(sampleMedia[1], sampleFolders)).toEqual(['Katrina Kaif']);
      expect(getMediaFolderNames(sampleMedia[2], sampleFolders)).toEqual(['Salman Khan', 'Katrina Kaif']);
    });

    it('gracefully handles missing/unmatched folder IDs', () => {
      const assetWithDangling: MediaAsset = {
        ...sampleMedia[0],
        folderIds: ['non_existent_folder', 'folder_salman'],
      };
      expect(getMediaFolderNames(assetWithDangling, sampleFolders)).toEqual(['Salman Khan']);
    });
  });

  describe('getAssetsInFolder & getUnassignedAssets', () => {
    it('filters assets assigned to a specific folder', () => {
      const salmanClips = getAssetsInFolder(sampleMedia, 'folder_salman');
      expect(salmanClips.map((c) => c.id)).toEqual(['media_3']);

      const katrinaClips = getAssetsInFolder(sampleMedia, 'folder_katrina');
      expect(katrinaClips.map((c) => c.id)).toEqual(['media_2', 'media_3']);
    });

    it('filters unassigned assets', () => {
      const unassigned = getUnassignedAssets(sampleMedia);
      expect(unassigned.map((c) => c.id)).toEqual(['media_1']);
    });
  });

  describe('Project Schema & JSON Export/Import Persistence', () => {
    it('initializes a project with an empty folders array', () => {
      const project = createInitialProject('Test Project');
      expect(project.folders).toEqual([]);
    });

    it('exports and validates projects with folders and multi-folder asset assignments', () => {
      const project: LongFormProject = {
        ...createInitialProject('Celebrity Showcase'),
        folders: sampleFolders,
        media: sampleMedia,
      };

      const exportedJSON = exportProjectToPortableJSON(project);
      const parsedResult = validateAndParseProjectJSON(exportedJSON);

      expect(parsedResult.isValid).toBe(true);
      expect(parsedResult.project).toBeDefined();
      expect(parsedResult.project?.folders).toEqual(sampleFolders);

      const parsedMedia = parsedResult.project?.media || [];
      expect(parsedMedia.length).toBe(3);
      expect(parsedMedia[0].folderIds).toBeUndefined();
      expect(parsedMedia[1].folderIds).toEqual(['folder_katrina']);
      expect(parsedMedia[2].folderIds).toEqual(['folder_salman', 'folder_katrina']);
    });

    it('provides backward compatibility for legacy project JSON without folders or folderIds', () => {
      const legacyProject = {
        version: '1.0',
        id: 'legacy_proj_1',
        name: 'Legacy Project',
        resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
        fps: 30,
        timeline: [],
        media: [
          {
            id: 'legacy_media_1',
            name: 'old_clip.mp4',
            type: 'video',
            width: 1920,
            height: 1080,
            duration: 10,
          },
        ],
      };

      const legacyJSON = JSON.stringify({ project: legacyProject });
      const parsedResult = validateAndParseProjectJSON(legacyJSON);

      expect(parsedResult.isValid).toBe(true);
      expect(parsedResult.project?.folders).toEqual([]);
      expect(parsedResult.project?.media[0].folderIds).toBeUndefined();
    });
  });
});
