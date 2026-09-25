import { MediaAsset, MediaFolder } from '../types/project';

/**
 * Returns the resolved display names of all folders assigned to a given media asset.
 */
export function getMediaFolderNames(asset: MediaAsset, folders: MediaFolder[] = []): string[] {
  if (!asset.folderIds || asset.folderIds.length === 0) {
    return [];
  }
  const folderMap = new Map<string, string>();
  for (const f of folders) {
    folderMap.set(f.id, f.name);
  }
  return asset.folderIds
    .map((id) => folderMap.get(id))
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
}

/**
 * Creates a new MediaFolder entity with a unique ID.
 */
export function createMediaFolder(name: string): MediaFolder {
  const trimmed = name.trim();
  return {
    id: `folder_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    name: trimmed || 'Untitled Folder',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Renames an existing folder immutably.
 */
export function renameMediaFolder(
  folders: MediaFolder[],
  folderId: string,
  newName: string
): MediaFolder[] {
  const trimmed = newName.trim();
  if (!trimmed) return folders;
  return folders.map((f) =>
    f.id === folderId ? { ...f, name: trimmed, updatedAt: Date.now() } : f
  );
}

/**
 * Deletes a folder by ID from the folder collection immutably.
 */
export function deleteMediaFolder(folders: MediaFolder[], folderId: string): MediaFolder[] {
  return folders.filter((f) => f.id !== folderId);
}

/**
 * Removes a deleted folder ID from all media assets without deleting the media itself.
 */
export function cleanupDeletedFolderFromAssets(
  assets: MediaAsset[],
  deletedFolderId: string
): MediaAsset[] {
  return assets.map((asset) => {
    if (!asset.folderIds || !asset.folderIds.includes(deletedFolderId)) {
      return asset;
    }
    return {
      ...asset,
      folderIds: asset.folderIds.filter((id) => id !== deletedFolderId),
    };
  });
}

/**
 * Assigns a media asset to a specific folder immutably (supports multi-folder assignment).
 */
export function assignMediaToFolder(
  assets: MediaAsset[],
  mediaId: string,
  folderId: string
): MediaAsset[] {
  return assets.map((asset) => {
    if (asset.id !== mediaId) return asset;
    const current = asset.folderIds || [];
    if (current.includes(folderId)) return asset;
    return {
      ...asset,
      folderIds: [...current, folderId],
    };
  });
}

/**
 * Removes a media asset from a specific folder immutably without deleting the asset.
 */
export function removeMediaFromFolder(
  assets: MediaAsset[],
  mediaId: string,
  folderId: string
): MediaAsset[] {
  return assets.map((asset) => {
    if (asset.id !== mediaId) return asset;
    const current = asset.folderIds || [];
    if (!current.includes(folderId)) return asset;
    return {
      ...asset,
      folderIds: current.filter((id) => id !== folderId),
    };
  });
}

/**
 * Replaces the assigned folders for a specific media asset.
 */
export function setMediaFolders(
  assets: MediaAsset[],
  mediaId: string,
  folderIds: string[]
): MediaAsset[] {
  const deduped = Array.from(new Set(folderIds));
  return assets.map((asset) => {
    if (asset.id !== mediaId) return asset;
    return {
      ...asset,
      folderIds: deduped,
    };
  });
}

/**
 * Filters media assets belonging to a specific folder.
 */
export function getAssetsInFolder(assets: MediaAsset[], folderId: string): MediaAsset[] {
  return assets.filter((a) => a.folderIds && a.folderIds.includes(folderId));
}

/**
 * Filters media assets that have no folder assignments.
 */
export function getUnassignedAssets(assets: MediaAsset[]): MediaAsset[] {
  return assets.filter((a) => !a.folderIds || a.folderIds.length === 0);
}
